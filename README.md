# The Morning Post

### News that takes itself far too seriously.

A forgotten British news portal, an endless television broadcast, and a deeply questionable use of artificial intelligence.

**[Watch live →](https://themorningpost.app)** · **[Powered by Prodia](https://prodia.com/)**

Submit a website. The channel reads it, turns it into a short, absurd British television report, and plays the result after your current clip. No studio. No sensible explanation. Just highly committed nonsense.

## What’s on air

- **An endless channel:** two overlapping video elements preload the next clip and switch with a hard broadcast cut. Start on a random clip, then keep watching in sequence.
- **Your website, on television:** a server-side prompt combines website details with one simple visual joke and a short English voiceover. New reports request a 15-second video from Prodia.
- **A growing playlist:** generated videos join the shared R2 playlist. Your own completed report is prioritised for the next transition without stopping the current broadcast.
- **Painfully dated design:** royal-blue bars, pale-yellow sidebars, underlined links, terrible headlines, and a newspaper that still thinks it is 2003.
- **Small-screen edition:** the broadcast comes first on phones, with wrapping navigation and a full-width submission form.

All news stories are fictional satire. This is an experimental project, not a news source.

## How it works

1. The browser sends a website URL to the Cloudflare Worker.
2. The Worker validates and reads the public website, builds a prompt, and starts a Prodia async job.
3. The browser polls the job endpoint. When ready, the Worker saves the MP4 to R2 and appends it to the playlist using conditional writes.
4. The player queues the new report without interrupting the current clip.

The playlist refreshes every 30 seconds. Playback tries sound-enabled autoplay, falls back to muted playback when necessary, and offers a small **CLICK FOR SOUND** button. Failed clips are skipped; an unavailable playlist displays **NO SIGNAL / PLEASE STAND BY**.

## Stack

| Part | Implementation |
| --- | --- |
| Frontend | React 19, TypeScript, [Vinext](https://github.com/cloudflare/vinext) on Vite |
| Hosting and API | Cloudflare Workers |
| Video and playlist storage | Cloudflare R2, binding `MEDIA` |
| Video generation | Prodia v2 async API |
| Tests | Node’s test runner and Miniflare |

No application database, authentication, Redis, or queue service is required.

## Run locally

Requires **Node.js 22.13+** and npm.

```sh
git clone https://github.com/mso96/the-morning-post.git
cd the-morning-post
npm ci
npm run dev
```

Open the local URL printed by the development server. Local development uses simulated Cloudflare bindings, not the production R2 bucket.

For generation, create a local `.dev.vars` file with your own credentials:

```dotenv
PRODIA_TOKEN=your_prodia_token
PRODIA_MODEL_TYPE=inference.minimax.h3.fast.txt2vid.v1
```

`.dev.vars` is ignored by Git. Never commit a real token. A configured local token can still make **paid Prodia requests**.

The local R2 bucket also needs media. The repository includes seven seed clips under `public/videos/001.mp4`–`007.mp4`; upload them to the local `live-tv` bucket as `videos/1.mp4`–`7.mp4`. For example, after building:

```sh
npm run build
npx wrangler r2 object put live-tv/videos/1.mp4 \
  --file public/videos/001.mp4 --content-type video/mp4 \
  --local --config dist/server/wrangler.json
```

Repeat for clips 2–7. If R2 has no `playlist.json`, the Worker supplies those seven numbered entries. The public static playlist is not the source of truth for `/api/playlist` when `MEDIA` is bound.

## Cloudflare configuration

The project generates its deployment configuration during the build. Bindings are declared through `.openai/hosting.json` and `vite.config.ts`; do not replace the existing build plugin or hand-edit generated files in `dist/`.

| Setting | Purpose |
| --- | --- |
| `MEDIA` | R2 binding pointing to the `live-tv` bucket |
| `PRODIA_TOKEN` | Required Worker secret; never expose it to the browser |
| `PRODIA_MODEL_TYPE` | Optional override; defaults to `inference.minimax.h3.fast.txt2vid.v1` |
| `MEDIA_BASE_URL` | Optional public media origin; defaults to the incoming Worker origin |

Configure the token under **Workers & Pages → your Worker → Settings → Variables and Secrets**, as a **Secret**. Confirm that your Prodia account supports the configured model and its video options.

Videos can be served through the Worker’s `/videos/*` route, so the R2 bucket does not have to be public. If using `MEDIA_BASE_URL`, use a working public custom domain, not R2’s authenticated S3 API endpoint. Temporary signed URLs are not needed.

### Playlist format

Store `playlist.json` at the bucket root, and MP4 objects under `videos/`:

```json
[
  { "id": "1", "src": "/videos/1.mp4" },
  { "id": "2", "src": "/videos/2.mp4" },
  { "id": "generated-example", "src": "/videos/generated-example.mp4" }
]
```

Use unique IDs and include every clip you want in rotation. Do not overwrite an existing production playlist with this example: it would remove its existing entries. Generation appends new entries automatically.

### Deploy

Authenticate Wrangler with the intended Cloudflare account, ensure its `live-tv` bucket exists, then:

```sh
npm run build
npx wrangler deploy dist/server/index.js \
  --config dist/server/wrangler.json \
  --name live-ai-tv \
  --keep-vars
```

`--name live-ai-tv` is intentional: the generated configuration retains the scaffold’s default Worker name. `--keep-vars` preserves dashboard-configured variables. For a fork, select your own Worker name and bucket in `vite.config.ts` before deployment.

For Cloudflare’s Git integration, use `npm run build` as the build command and the Wrangler command above as the deploy command. This app includes a Worker API; it is not a static-only Pages upload.

## Tests

```sh
npm run build
node --experimental-strip-types --test tests/channel.test.mjs tests/generation.test.mjs
```

The targeted suite covers channel sequencing, priority insertion, autoplay fallback, URL validation, prompt rules, and the mocked Prodia-to-R2 publishing flow. It does not spend Prodia credits or prove browser-specific playback quality. The scaffold’s `npm test` command still targets its original rendered-HTML test; use the commands above for this application.

## Source map

```text
app/page.tsx                   Newspaper homepage and website form
app/globals.css                Retro theme and responsive layout
app/components/InfiniteTV.tsx  Video slots and playlist refresh
app/lib/channelPlayer.ts      Playback controller
app/lib/playerQueue.ts        Playlist parsing and queue ordering
worker/index.ts               HTTP routing and R2 video serving
worker/generation.ts          Prodia jobs and playlist publication
worker/website.ts             Website fetching and URL safeguards
worker/prompt.ts              Simple visual concepts and narration
tests/                        Channel and generation regression tests
```

## Before running it publicly

- **Generation is not instant.** The model’s requested duration is 15 seconds; processing can take much longer. There is no guaranteed 20-second turnaround.
- **Keep the submitting tab open.** Job completion is driven by browser polling. There is no durable background worker or refresh recovery for a pending submission.
- **Protect your budget.** Generation is unauthenticated and currently has no application-level rate limiting. Add abuse protection and spending limits before accepting broad public traffic.
- **Watch storage and logs.** Generated clips remain in R2, and server logs contain generated prompts. Plan retention and access accordingly.
- **Review your assets.** Third-party names, music, and media retain their respective owners’ rights. No blanket licence for those assets is implied.

Found a bug? [Open an issue](https://github.com/mso96/the-morning-post/issues). For changes, keep the retro design intact, include a focused test where practical, and never include credentials or private website data.
