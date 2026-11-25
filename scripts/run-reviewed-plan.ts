import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const [file, ...flags] = process.argv.slice(2);
if (
  !file ||
  flags.length !== 3 ||
  !["--approved", "--approve-actions", "--approve-network"].every((f) =>
    flags.includes(f),
  )
)
  throw Error(
    "Usage: run-reviewed-plan.ts <reviewed-plan.json> --approved --approve-actions --approve-network. Review the target, environment, traffic effects and every action first.",
  );
const input = JSON.parse(readFileSync(resolve(file), "utf8"));
if (
  input.environment !== "test" ||
  input.network !== "browser" ||
  input.execution !== "interactive"
)
  throw Error(
    "This local benchmark helper requires an explicitly reviewed test environment and browser networking.",
  );
const { planSchema, validateExecution } = await import("../server/schema.ts");
const plan = planSchema.parse({
  ...input,
  approved: true,
  actionsApproved: true,
  networkApproved: true,
});
validateExecution(plan);
const { validateTarget } = await import("../server/safety.ts");
const origin = new URL(plan.target).origin;
validateTarget(plan.target, [origin]);
// This invocation approves only this exact origin; no persisted service configuration changes.
process.env.ASBUILT_PREVIEW_ORIGINS = origin;
process.env.ASBUILT_INTERACTIVE_PREVIEWS = "true";
process.env.ASBUILT_DATA_DIR = resolve(".data/reviewed-benchmarks");
const { startVerification, isRunActive } = await import("../server/runner.ts");
const report = startVerification(plan);
console.log(
  JSON.stringify({
    id: report.id,
    intent: plan.intent,
    browser: plan.browser ?? "chromium",
  }),
);
while (isRunActive(report.id)) await new Promise((r) => setTimeout(r, 500));
console.log(
  JSON.stringify(
    {
      id: report.id,
      status: report.status,
      error: report.error,
      results: report.results,
      blockedResources: report.blockedResources,
    },
    null,
    2,
  ),
);
if (
  report.status !== "complete" ||
  report.results.some((r) => r.status !== "pass")
)
  process.exitCode = 1;
