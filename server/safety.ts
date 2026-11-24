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
  navigationHeaders: Record<string, string> = {},
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
          ...Object.fromEntries(
            Object.entries(navigationHeaders).filter(
              ([key, value]) =>
                [
                  "rsc",
                  "next-router-state-tree",
                  "next-router-prefetch",
                  "next-router-segment-prefetch",
                  "x-deployment-id",
                  "next-url",
                ].includes(key) &&
                value.length <= 12000 &&
                !/[\r\n]/.test(value),
            ),
          ),
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
          for (const k of [
            "content-type",
            "location",
            "vary",
            "x-nextjs-postponed",
            "x-nextjs-stale-time",
            "x-nextjs-prerender",
            "x-nextjs-rewritten-path",
            "x-nextjs-rewritten-query",
          ]) {
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

// Each document/data URL is part of the reviewed plan; never an origin-wide API grant.
export function journeyResourceAllowed(
  raw: string,
  target: URL,
  method: string,
  resourceType: string,
  destinations: string[],
  readUrls: string[],
  imagePrefixes: string[] = [],
) {
  try {
    const url = new URL(raw);
    if (
      method !== "GET" ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash
    )
      return false;
    const clean = new URL(url);
    // Next.js client navigation adds this cache-busting key to a reviewed page URL.
    const rsc = clean.searchParams.get("_rsc");
    if (
      rsc !== null &&
      (!/^[a-zA-Z0-9_-]{1,100}$/.test(rsc) ||
        clean.searchParams.getAll("_rsc").length !== 1)
    )
      return false;
    clean.searchParams.delete("_rsc");
    const approvedPage =
      url.origin === target.origin &&
      [target.href, ...destinations].some(
        (raw) => new URL(raw).href === clean.href,
      );
    if (resourceType === "document") return rsc === null && approvedPage;
    if (["fetch", "xhr"].includes(resourceType))
      return (
        url.origin === target.origin &&
        (approvedPage || readUrls.includes(url.href))
      );
    if (
      resourceType === "image" &&
      url.origin === target.origin &&
      url.pathname === "/_next/image"
    ) {
      if (
        [...url.searchParams.keys()].some(
          (k) => !["url", "w", "q"].includes(k),
        ) ||
        ["url", "w", "q"].some((k) => url.searchParams.getAll(k).length !== 1)
      )
        return false;
      if (
        !/^[1-9][0-9]{0,3}$/.test(url.searchParams.get("w") ?? "") ||
        !/^(?:[1-9][0-9]?|100)$/.test(url.searchParams.get("q") ?? "")
      )
        return false;
      const source = new URL(url.searchParams.get("url")!, target);
      return interactiveResourceAllowed(
        source.href,
        target,
        "GET",
        "image",
        imagePrefixes,
      );
    }
    return interactiveResourceAllowed(
      raw,
      target,
      method,
      resourceType,
      imagePrefixes,
    );
  } catch {
    return false;
  }
}

export function reviewedDestinations(plan: import("./schema.ts").Plan) {
  return plan.criteria.flatMap((c) =>
    (c.actions ?? []).filter((a) => a.type === "navigate").map((a) => a.value),
  );
}
