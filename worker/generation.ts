import { readWebsite, WebsiteError } from "./website";
import { buildPrompt, reserveDirection } from "./prompt";

export interface GenerationEnv {
  MEDIA?: R2Bucket;
  PRODIA_TOKEN?: string;
  PRODIA_MODEL_TYPE?: string;
  MEDIA_BASE_URL?: string;
}

const PRODIA_ASYNC_URL = "https://inference.prodia.com/v2/job/async";
const DEFAULT_PRODIA_MODEL_TYPE = "inference.minimax.h3.fast.txt2vid.v1";
const BASE_VIDEO_IDS = ["1", "2", "3", "4", "5", "6", "7"];

export function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

export function apiError(error: unknown) {
  if (error instanceof WebsiteError) return json({ error: error.message }, 422);
  console.error("Report request failed", error instanceof Error ? error.name : "Unknown error");
  return json({ error: "REPORT TEMPORARILY UNAVAILABLE — LIVE TV CONTINUES" }, 503);
}

export function basePlaylist() {
  return BASE_VIDEO_IDS.map((id) => ({ id, src: `/videos/${id}.mp4` }));
}

export async function createProdiaJob(request: Request, env: GenerationEnv) {
  if (!env.PRODIA_TOKEN) return json({ error: "Prodia is not configured" }, 503);
  if (!env.MEDIA) return json({ error: "R2 media storage is not configured" }, 503);
  let body: { url?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body || typeof body.url !== "string" || body.url.length > 2048) return json({ error: "Enter a valid website URL" }, 400);
  const source = await readWebsite(body.url);
  const { direction, recent } = await reserveDirection(env.MEDIA);
  const prompt = buildPrompt(source, direction, recent);
  console.log(JSON.stringify({ event: "prodia_prompt", hostname: new URL(source.url).hostname, prompt }));
  const response = await fetch(PRODIA_ASYNC_URL, { method: "POST", signal: AbortSignal.timeout(30_000), headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}`, Accept: "video/mp4", "content-type": "application/json" }, body: JSON.stringify({ type: env.PRODIA_MODEL_TYPE || DEFAULT_PRODIA_MODEL_TYPE, config: { prompt, duration: 15, aspect_ratio: "16:9", resolution: "768P" } }) });
  if (!response.ok) return json({ error: "Unable to start Prodia report" }, 502);
  const result = await response.json() as { id?: string };
  if (!result.id) return json({ error: "Prodia did not return a job id" }, 502);
  return json({ jobId: result.id, acceptedAt: Date.now() }, 202);
}

export async function checkProdiaJob(jobId: string, request: Request, env: GenerationEnv) {
  if (!/^[a-zA-Z0-9-]{1,128}$/.test(jobId) || !env.PRODIA_TOKEN) return json({ error: "Invalid job" }, 400);
  if (!env.MEDIA) return json({ error: "R2 media storage is not configured" }, 503);
  const key = `videos/generated-${jobId}.mp4`;
  const mediaBase = (env.MEDIA_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const clip = { id: `generated-${jobId}`, src: `${mediaBase}/${key}` };
  const existing = await env.MEDIA.head(key);
  if (!existing) {
  const stateResponse = await fetch(`${PRODIA_ASYNC_URL}/${encodeURIComponent(jobId)}/job.state.current`, { signal: AbortSignal.timeout(15_000), headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}` } });
  if (!stateResponse.ok) return json({ error: "Unable to check report status" }, 502);
  const state = (await stateResponse.text()).replace(/\"/g, "").trim().toLowerCase();
  if (state === "failed" || state === "cancelled" || state === "canceled") return json({ status: "failed" }, 502);
  if (state !== "processed" && state !== "completed" && state !== "succeeded") return json({ status: state || "pending" });
    const videoResponse = await fetch(`${PRODIA_ASYNC_URL}/${encodeURIComponent(jobId)}/output/video.mp4`, { signal: AbortSignal.timeout(60_000), headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}`, Accept: "video/mp4" } });
    if (!videoResponse.ok || !videoResponse.body) return json({ status: "pending" });
    await env.MEDIA.put(key, videoResponse.body, { httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" } });
  }
  // Retry the idempotent append even if a previous request saved the MP4 but failed here.
  await appendToPlaylist(env, clip);
  return json({ status: "ready", id: clip.id, clip });
}

async function appendToPlaylist(env: GenerationEnv, item: { id: string; src: string }) {
  if (!env.MEDIA) return;
  const mediaBase = (env.MEDIA_BASE_URL || "").replace(/\/$/, "");
  for (let attempt = 0; attempt < 5; attempt++) {
    const current = await env.MEDIA.get("playlist.json");
    const playlist: Array<{ id: string; src: string }> = current ? await current.json() :
      BASE_VIDEO_IDS.map(id => ({ id, src: `${mediaBase}/videos/${id}.mp4` }));
    if (!Array.isArray(playlist)) throw new Error("Invalid stored playlist");
    if (playlist.some(entry => entry.id === item.id)) return;
    playlist.push(item);
    const written = await env.MEDIA.put("playlist.json", JSON.stringify(playlist, null, 2), {
      onlyIf: current ? { etagMatches: current.etag } : new Headers({ "if-none-match": "*" }),
      httpMetadata: { contentType: "application/json", cacheControl: "no-store" },
    });
    if (written) return;
  }
  throw new Error("Playlist busy; retry publication");
}
