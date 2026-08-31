/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
  MEDIA?: R2Bucket;
  PRODIA_TOKEN?: string;
  PRODIA_MODEL_TYPE?: string;
  MEDIA_BASE_URL?: string;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/generate" && request.method === "POST") {
      return createProdiaJob(request, env);
    }

    if (url.pathname.startsWith("/api/generate/") && request.method === "GET") {
      return checkProdiaJob(url.pathname.split("/").pop() || "", request, env);
    }

    if (url.pathname === "/playlist.json" && request.method === "GET" && env.MEDIA) {
      const playlist = await env.MEDIA.get("playlist.json");
      if (playlist) {
        const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        playlist.writeHttpMetadata(headers);
        return new Response(playlist.body, { headers });
      }
    }

    if (url.pathname.startsWith("/videos/") && request.method === "GET" && env.MEDIA) {
      const object = await env.MEDIA.get(url.pathname.slice(1));
      if (object) {
        const headers = new Headers();
        object.writeHttpMetadata(headers);
        headers.set("cache-control", "public, max-age=31536000, immutable");
        return new Response(object.body, { headers });
      }
    }

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      return handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
    }

    return handler.fetch(request, env, ctx);
  },
};

export default worker;

const PRODIA_ASYNC_URL = "https://inference.prodia.com/v2/job/async";
const DEFAULT_PRODIA_MODEL_TYPE = "inference.minimax.h3.fast.txt2vid.v1";
const ABSURD_EVENTS = [
  "a council meeting was interrupted by a very confident pigeon",
  "three ministers were found arguing with a revolving door",
  "local trousers were declared legally sentient by mistake",
  "a suspicious loaf of bread requested diplomatic immunity",
  "the homepage caused a minor incident involving seven spoons",
];
const BASE_VIDEO_IDS = ["001", "002", "003", "004", "005", "006", "007"];

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" } });
}

function buildPrompt(hostname: string) {
  const event = ABSURD_EVENTS[hostname.length % ABSURD_EVENTS.length];
  return `1990s British television countdown/documentary footage about the website ${hostname}. The film claims, in a completely serious deadpan tone, that ${event}. No presenter, no studio, no talking head, only real-world footage, dead-serious narration, dated on-screen number and title graphics, VHS softness, analog noise, colour bleed, tracking errors, cheap archival TV look, absurd subject treated as a national emergency, 16:9, 15 seconds, no readable brand logos.`;
}

async function createProdiaJob(request: Request, env: Env) {
  if (!env.PRODIA_TOKEN) return json({ error: "Prodia is not configured" }, 503);
  let body: { url?: string };
  try { body = await request.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  let parsed: URL;
  try { parsed = new URL(body.url || ""); } catch { return json({ error: "Enter a valid website URL" }, 400); }
  if (!/^https?:$/.test(parsed.protocol)) return json({ error: "Only http and https URLs are supported" }, 400);
  const prompt = buildPrompt(parsed.hostname);
  console.log(JSON.stringify({ event: "prodia_prompt", hostname: parsed.hostname, prompt }));
  const response = await fetch(PRODIA_ASYNC_URL, { method: "POST", headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}`, Accept: "video/mp4", "content-type": "application/json" }, body: JSON.stringify({ type: env.PRODIA_MODEL_TYPE || DEFAULT_PRODIA_MODEL_TYPE, config: { prompt, duration: 15, aspect_ratio: "16:9", resolution: "768P" } }) });
  if (!response.ok) return json({ error: "Unable to start Prodia report" }, 502);
  const result = await response.json() as { id?: string };
  if (!result.id) return json({ error: "Prodia did not return a job id" }, 502);
  return json({ jobId: result.id, acceptedAt: Date.now() }, 202);
}

async function checkProdiaJob(jobId: string, request: Request, env: Env) {
  if (!jobId || !env.PRODIA_TOKEN) return json({ error: "Invalid job" }, 400);
  const stateResponse = await fetch(`${PRODIA_ASYNC_URL}/${encodeURIComponent(jobId)}/job.state.current`, { headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}` } });
  if (!stateResponse.ok) return json({ status: "pending" });
  const state = (await stateResponse.text()).replace(/\"/g, "").trim().toLowerCase();
  if (state === "failed" || state === "cancelled" || state === "canceled") return json({ status: "failed" }, 502);
  if (state !== "processed" && state !== "completed" && state !== "succeeded") return json({ status: state || "pending" });
  if (!env.MEDIA) return json({ status: "ready", error: "R2 media storage is not configured" }, 503);
  const key = `videos/generated-${jobId}.mp4`;
  const mediaBase = (env.MEDIA_BASE_URL || new URL(request.url).origin).replace(/\/$/, "");
  const existing = await env.MEDIA.head(key);
  if (!existing) {
    const videoResponse = await fetch(`${PRODIA_ASYNC_URL}/${encodeURIComponent(jobId)}/output/video.mp4`, { headers: { Authorization: `Bearer ${env.PRODIA_TOKEN}`, Accept: "video/mp4" } });
    if (!videoResponse.ok || !videoResponse.body) return json({ status: "pending" });
    await env.MEDIA.put(key, videoResponse.body, { httpMetadata: { contentType: "video/mp4", cacheControl: "public, max-age=31536000, immutable" } });
    await appendToPlaylist(env, { id: `generated-${jobId}`, src: `${mediaBase}/${key}` });
  }
  return json({ status: "ready", id: `generated-${jobId}` });
}

async function appendToPlaylist(env: Env, item: { id: string; src: string }) {
  if (!env.MEDIA) return;
  const current = await env.MEDIA.get("playlist.json");
  const mediaBase = (env.MEDIA_BASE_URL || "").replace(/\/$/, "");
  let playlist: Array<{ id: string; src: string }> = BASE_VIDEO_IDS.map((id) => ({ id, src: mediaBase ? `${mediaBase}/videos/${id}.mp4` : `/videos/${id}.mp4` }));
  if (current) { try { playlist = JSON.parse(await current.text()) as Array<{ id: string; src: string }>; } catch { playlist = []; } }
  if (!playlist.some((entry) => entry.id === item.id)) playlist.push(item);
  await env.MEDIA.put("playlist.json", JSON.stringify(playlist, null, 2), { httpMetadata: { contentType: "application/json", cacheControl: "no-store" } });
}
