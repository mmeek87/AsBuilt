import dns from "node:dns/promises";
import https from "node:https";
import ipaddr from "ipaddr.js";
export function publicAddress(address: string): boolean {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && (ip as ipaddr.IPv6).isIPv4MappedAddress())
      ip = (ip as ipaddr.IPv6).toIPv4Address();
    return ip.range() === "unicast";
  } catch {
    return false;
  }
}
export function validateTarget(raw: string, allowed: string[]): URL {
  const url = new URL(raw);
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.hash ||
    url.search ||
    (url.port && url.port !== "443")
  )
    throw Error(
      "Use an HTTPS preview URL without credentials, query parameters or fragments.",
    );
  if (!allowed.includes(url.origin))
    throw Error(
      "This preview is not approved. Add its exact origin to ASBUILT_PREVIEW_ORIGINS and restart.",
    );
  if (
    ipaddr.isValid(url.hostname.replace(/^\[|\]$/g, "")) ||
    url.hostname === "localhost" ||
    url.hostname.endsWith(".local")
  )
    throw Error("Private and literal IP destinations are blocked.");
  return url;
}
// Resolve once, validate every returned address, then pin the actual TLS socket.
// Redirects are never followed here; the browser re-enters this policy for each hop.
export async function pinnedGet(
  url: URL,
  lookup = dns.lookup,
): Promise<{ status: number; headers: Record<string, string>; body: Buffer }> {
  const addresses = await lookup(url.hostname, { all: true });
  if (!addresses.length || addresses.some((a) => !publicAddress(a.address)))
    throw Error("Preview resolves to a private or reserved network.");
  const selected = addresses[0];
  return await new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: "GET",
        agent: false,
        family: selected.family,
        lookup: ((_host: unknown, opts: { all?: boolean }, cb: Function) => {
          if (opts.all) cb(null, [selected]);
          else cb(null, selected.address, selected.family);
        }) as never,
        headers: {
          "User-Agent": "AsBuilt/0.1 preview-verifier",
          "Accept-Encoding": "identity",
        },
        timeout: 8000,
      },
      (res) => {
        let bytes = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes > 5_000_000) {
            req.destroy(Error("Preview resource exceeds 5 MB."));
            return;
          }
          chunks.push(chunk);
        });
        res.on("error", reject);
        res.on("end", () => {
          const headers: Record<string, string> = {};
          for (const k of ["content-type", "location"]) {
            const v = res.headers[k];
            if (typeof v === "string") headers[k] = v;
          }
          resolve({
            status: res.statusCode ?? 502,
            headers,
            body: Buffer.concat(chunks),
          });
        });
      },
    );
    req.on("timeout", () => req.destroy(Error("Preview request timed out.")));
    req.on("error", reject);
    req.end();
  });
}
export function resourceAllowed(
  raw: string,
  target: URL,
  method: string,
  resourceType: string,
): boolean {
  try {
    const u = new URL(raw);
    return (
      method === "GET" &&
      u.origin === target.origin &&
      !u.username &&
      !u.password &&
      !u.search &&
      (u.pathname === target.pathname ||
        ["stylesheet", "image", "font", "script"].includes(resourceType))
    );
  } catch {
    return false;
  }
}

export function interactiveResourceAllowed(
  raw: string,
  target: URL,
  method: string,
  resourceType: string,
  imagePrefixes: string[] = [],
) {
  try {
    const url = new URL(raw);
    if (
      method !== "GET" ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (url.port && url.port !== "443")
    )
      return false;
    if (url.origin !== target.origin) {
      // Operator-approved image paths only: never scripts, documents, APIs or arbitrary origins.
      return (
        resourceType === "image" &&
        !url.search &&
        imagePrefixes.some((rawPrefix) => {
          const prefix = new URL(rawPrefix);
          return (
            prefix.protocol === "https:" &&
            !prefix.username &&
            !prefix.password &&
            !prefix.search &&
            !prefix.hash &&
            prefix.pathname.endsWith("/") &&
            prefix.pathname !== "/" &&
            url.origin === prefix.origin &&
            url.pathname.startsWith(prefix.pathname) &&
            /\.(png|jpe?g|webp|gif|svg|avif)(?:$|\/m\/)/i.test(url.pathname)
          );
        })
      );
    }
    if (resourceType === "document")
      return !url.search && url.pathname === target.pathname;
    const extensions: Record<string, RegExp> = {
      stylesheet: /\.css$/i,
      script: /\.(js|mjs)$/i,
      image: /\.(png|jpe?g|webp|gif|svg|ico|avif)$/i,
      font: /\.(woff2?|ttf|otf)$/i,
    };
    if (!extensions[resourceType]?.test(url.pathname)) return false;
    // Only deployment/cache version tags, never arbitrary query parameters.
    return [...url.searchParams].every(
      ([key, value]) =>
        ["dpl", "v", "ver"].includes(key) &&
        /^[a-zA-Z0-9_.-]{1,100}$/.test(value),
    );
  } catch {
    return false;
  }
}
