/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import { createProdiaJob, checkProdiaJob, apiError, basePlaylist, json } from "./generation";

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
      return createProdiaJob(request, env).catch(apiError);
    }

    if (url.pathname.startsWith("/api/generate/") && request.method === "GET") {
      return checkProdiaJob(url.pathname.split("/").pop() || "", request, env).catch(apiError);
    }

    if ((url.pathname === "/playlist.json" || url.pathname === "/api/playlist") && request.method === "GET" && env.MEDIA) {
      const playlist = await env.MEDIA.get("playlist.json");
      if (playlist) {
        const headers = new Headers({ "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
        playlist.writeHttpMetadata(headers);
        headers.set("cache-control", "no-store");
        return new Response(playlist.body, { headers });
      }
      return json(basePlaylist());
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
