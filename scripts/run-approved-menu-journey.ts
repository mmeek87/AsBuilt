import { readFileSync } from "node:fs";
import { resolve } from "node:path";
// Explicit command flags are required; approval embedded in an input file is ignored.
if (process.argv.slice(2).join(" ") !== "--approved --approve-actions")
  throw Error(
    "Review docs/examples/ebarrel-menu-journey.json and approve its exact actions before running.",
  );
process.env.ASBUILT_DATA_DIR = resolve(".data/journey-verification");
process.env.ASBUILT_PREVIEW_ORIGINS = "https://shopebarrel.tech";
process.env.ASBUILT_INTERACTIVE_PREVIEWS = "true";
const { startVerification, isRunActive } = await import("../server/runner.ts");
const plan = JSON.parse(
  readFileSync("docs/examples/ebarrel-menu-journey.json", "utf8"),
);
const report = startVerification({
  ...plan,
  approved: true,
  actionsApproved: true,
});
console.log("Started local isolated journey " + report.id);
while (isRunActive(report.id)) await new Promise((r) => setTimeout(r, 500));
console.log(
  JSON.stringify(
    {
      id: report.id,
      status: report.status,
      error: report.error,
      results: report.results.map((r) => ({
        id: r.criterion.id,
        viewport: r.viewport,
        status: r.status,
        observed: r.observed,
        steps: r.steps,
        screenshot: r.screenshot,
      })),
      blockedResources: report.blockedResources,
      blockedRequests: report.blockedRequests,
    },
    null,
    2,
  ),
);
