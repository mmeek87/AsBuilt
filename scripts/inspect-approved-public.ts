import { resolve } from "node:path";
const browser = process.argv[3] ?? "chromium";
if (
  process.argv[2] !== "--approved" ||
  process.argv.length > 4 ||
  !["chromium", "firefox", "webkit"].includes(browser)
)
  throw Error(
    "Explicit approval is required for the action-free public inspection of hllofuture.com.",
  );
process.env.ASBUILT_PUBLIC_READONLY_ORIGINS = "https://hllofuture.com";
process.env.ASBUILT_INTERACTIVE_PREVIEWS = "true";
process.env.ASBUILT_DATA_DIR = resolve(".data/public-inspection");
const { startVerification, isRunActive } = await import("../server/runner.ts");
const report = startVerification({
  intent:
    "Inspect the signed-out public Future homepage without clicking, typing, signing in or changing data.",
  target: "https://hllofuture.com",
  approved: true,
  execution: "interactive",
  publicReadOnly: true,
  network: "browser",
  networkApproved: true,
  environment: "production",
  browser: browser as "chromium" | "firefox" | "webkit",
  criteria: [
    {
      id: "public-page",
      kind: "manual",
      value: "",
      expected:
        "Capture the signed-out public page to define later assertions. No pass is claimed.",
    },
  ],
});
console.log("Public inspection " + report.id);
while (isRunActive(report.id)) await new Promise((r) => setTimeout(r, 1000));
console.log(
  JSON.stringify({
    id: report.id,
    status: report.status,
    error: report.error,
    results: report.results,
    blocked: report.blockedResources,
  }),
);
