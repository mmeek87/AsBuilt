import type { Report } from "./schema.ts";
// Origin-only diagnostics: paths can contain IDs/tokens too. Never persist request credentials, query, fragment or body.
export function recordBlockedResource(
  report: Report,
  raw: string,
  resourceType: string,
  reason: string,
) {
  let origin = "unparseable URL";
  try {
    const url = new URL(raw);
    origin = ["http:", "https:"].includes(url.protocol)
      ? url.origin
      : "non-HTTP resource";
  } catch {}
  const entries = (report.blockedResources ??= []);
  const existing = entries.find(
    (e) =>
      e.origin === origin &&
      e.resourceType === resourceType &&
      e.reason === reason,
  );
  if (existing) existing.count++;
  else if (entries.length < 40)
    entries.push({
      origin,
      resourceType: resourceType.slice(0, 40),
      reason,
      count: 1,
    });
}
