import type { Report } from "./schema.ts";

const label = { pass: "Pass", fail: "Fail", not_verified: "Not verified" };

/**
 * Render untrusted text (page observations, criteria that may come from
 * repository-derived plans) so GitHub shows it literally. Inside an inline
 * code span, Markdown, links, images, HTML and @mentions are inert. Backticks
 * and line breaks are removed so the text cannot close the span or start a
 * new block. Length is capped to keep comments readable.
 */
export function inert(text: string, max = 300) {
  const flat = text
    .replace(/[`\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const short = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return short ? `\`${short}\`` : "_(empty)_";
}

export function commentBody(
  r: Report,
  options: { evidenceUrl?: string; marker?: string } = {},
) {
  if (r.status !== "complete" || r.mode === "sample" || !r.plan.source?.pr)
    throw Error(
      "Only a completed preview report attached to a pull request can be posted.",
    );
  const counts = (["pass", "fail", "not_verified"] as const)
    .map((s) => [s, r.results.filter((x) => x.status === s).length] as const)
    .filter(([, n]) => n > 0)
    .map(([s, n]) => `${n} ${label[s].toLowerCase()}`)
    .join(" · ");
  const sha = /^[a-f0-9]{40}$/.test(r.plan.source.sha)
    ? r.plan.source.sha
    : "unknown";
  return [
    ...(options.marker ? [options.marker] : []),
    "## AsBuilt verification",
    "",
    `**${counts || "No results"}** across desktop and mobile.`,
    "",
    `Commit: ${sha}`,
    `Target: ${inert(r.plan.target, 200)}`,
    "",
    ...r.results.map(
      (x) =>
        `- **${label[x.status]} · ${x.viewport}** Expected: ${inert(x.criterion.expected)}\n  Observed: ${inert(x.observed)}`,
    ),
    "",
    `Limitations: ${r.limitations.join(" ")}`,
    "",
    "“Not verified” means AsBuilt could not collect enough evidence; it is not a pass. A failure is an observed mismatch, not a diagnosed root cause.",
    "",
    options.evidenceUrl
      ? `Report ID: ${r.id}. [Desktop and mobile screenshots](${options.evidenceUrl}) are attached to the workflow run (visible to people with repository access).`
      : `Report ID: ${r.id}. Screenshots are stored locally and are not uploaded to GitHub.`,
  ].join("\n");
}
