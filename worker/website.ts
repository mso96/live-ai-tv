export class WebsiteError extends Error {}

export function validateWebsiteUrl(value: string): URL {
  let url: URL;
  try { url = new URL(value); } catch { throw new WebsiteError("Enter a valid website URL"); }
  const host = url.hostname.toLowerCase();
  // Accept public DNS names only, not IP literals, credentials, local hosts or custom ports.
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.port ||
      !host.includes(".") || !/^[a-z0-9.-]+$/.test(host) || /^[\d.]+$/.test(host) ||
      /\.(localhost|local|internal|test|invalid|example|lan|home|onion)$/.test(host)) {
    throw new WebsiteError("Use a public http or https website address");
  }
  url.hash = "";
  return url;
}

function publicAddress(ip: string): boolean {
  if (ip.includes(":")) {
    // Only globally routable unicast IPv6; reject mapped and special-purpose ranges.
    return /^[23][0-9a-f]{3}:/i.test(ip) && !/^2001:(db8|0|2|10|20):/i.test(ip);
  }
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4 || parts.some(n => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = parts;
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && [0, 168].includes(b)) || (a === 100 && b >= 64 && b <= 127) ||
    (a === 198 && [18, 19, 51].includes(b)) || (a === 203 && b === 0));
}

async function validateDns(url: URL, signal: AbortSignal) {
  const answers = await Promise.all(["A", "AAAA"].map(async type => {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(url.hostname)}&type=${type}`, {
      headers: { Accept: "application/dns-json" }, signal,
    });
    if (!response.ok) throw new WebsiteError("Website DNS could not be verified");
    const data = await response.json() as { Answer?: Array<{ type: number; data: string }> };
    return (data.Answer || []).filter(a => a.type === 1 || a.type === 28).map(a => a.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some(ip => !publicAddress(ip))) {
    throw new WebsiteError("The website must resolve to a public internet address");
  }
}

async function readLimited(response: Response) {
  if (!response.body) throw new WebsiteError("Website returned no content");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (size < 384_000) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = value.subarray(0, 384_000 - size);
      chunks.push(chunk);
      size += chunk.length;
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  return new TextDecoder().decode(bytes);
}

export async function readWebsite(value: string) {
  let url = validateWebsiteUrl(value);
  const signal = AbortSignal.timeout(15_000);
  for (let redirect = 0; redirect <= 3; redirect++) {
    await validateDns(url, signal);
    const response = await fetch(url.href, {
      redirect: "manual", signal,
      headers: { Accept: "text/html", "User-Agent": "MorningPost/1.0 (website-submitted documentary research)" },
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel();
      if (!location) throw new WebsiteError("Website redirect has no destination");
      url = validateWebsiteUrl(new URL(location, url).href);
      continue;
    }
    if (!response.ok || !/text\/html|application\/xhtml/i.test(response.headers.get("content-type") || "")) {
      await response.body?.cancel();
      throw new WebsiteError("Website could not be read. Try a publicly accessible product page.");
    }
    const html = await readLimited(response);
    let title = "";
    let description = "";
    let text = "";
    const clean = new HTMLRewriter().on("script,style,noscript,svg,nav,footer,header,form", { element(el) { el.remove(); } });
    const extractor = new HTMLRewriter()
      .on("title", { text(chunk) { title += chunk.text; } })
      .on('meta[name="description"],meta[property="og:description"]', { element(el) { description ||= el.getAttribute("content") || ""; } })
      .on("h1,h2,h3,p,li", {
        element() { text += "\n"; },
        text(chunk) { if (text.length < 24_000) text += chunk.text; },
      });
    await extractor.transform(clean.transform(new Response(html))).text();
    const passages = [...new Set(text.split(/\n+/).map(p => p.replace(/\s+/g, " ").trim()).filter(p => p.length >= 35))]
      .filter(p => !/cookie preferences|accept all cookies|privacy policy|all rights reserved/i.test(p));
    if (passages.join(" ").length < 160) throw new WebsiteError("Not enough readable product information. Try an About or product page.");
    // No page scripts execute; only bounded public text reaches the generation prompt.
    return { url: url.href, title: title.trim().slice(0, 180), description: description.slice(0, 500), passages: passages.slice(0, 18).map(p => p.slice(0, 420)) };
  }
  throw new WebsiteError("Website redirects too many times");
}
