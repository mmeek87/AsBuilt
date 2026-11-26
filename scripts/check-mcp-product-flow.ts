// Drives AsBuilt's product flow over the stdio MCP bridge, the way a host
// assistant would: baseline -> refuse unapproved run -> approved run -> coverage.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { fileURLToPath } from "node:url";
const repo = fileURLToPath(new URL("..", import.meta.url)).replace(/\/$/, "");
const client = new Client({ name: "launch-check", version: "1" });
await client.connect(
  new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      `${repo}/node_modules/tsx/dist/loader.mjs`,
      `${repo}/server/stdio.ts`,
    ],
    env: {
      ...getDefaultEnvironment(),
      ...Object.fromEntries(
        ["ASBUILT_TOKEN", "ASBUILT_TOKEN_FILE", "ASBUILT_URL"]
          .filter((k) => process.env[k])
          .map((k) => [k, process.env[k]!]),
      ),
    },
  }),
);
const call = async (name: string, args: any = {}) => {
  const r: any = await client.callTool({ name, arguments: args });
  return r.isError ? { error: r.content[0].text } : r.structuredContent;
};
const content =
  'Visitors see a heading called "Plan your visit".\nThe page offers free cancellation.';
const spec = {
  title: "MCP flow check",
  understanding: "Fictional studio page.",
  sources: [
    {
      id: "ask",
      title: "Request",
      kind: "user_request",
      reference: "chat",
      content,
    },
  ],
  missingContext: [],
  decisions: [],
  requirements: [
    {
      id: "heading",
      title: "Heading",
      actor: "Visitor",
      priority: "critical",
      citations: [{ sourceId: "ask", line: 1, quote: "Plan your visit" }],
      outcomes: [
        {
          id: "h",
          expected: "Heading visible",
          checks: [{ scenarioId: "page", criterionId: "heading" }],
        },
      ],
    },
    {
      id: "cancel",
      title: "Cancellation",
      actor: "Visitor",
      priority: "important",
      citations: [{ sourceId: "ask", line: 2, quote: "free cancellation" }],
      outcomes: [
        {
          id: "c",
          expected: "Free cancellation shown",
          checks: [{ scenarioId: "page", criterionId: "cancel" }],
        },
      ],
    },
  ],
  scenarios: [
    {
      id: "page",
      title: "Page",
      plan: {
        intent: "Page content",
        target: "sample",
        criteria: [
          {
            id: "heading",
            expected: "Heading visible",
            kind: "heading",
            value: "Plan your visit",
          },
          {
            id: "cancel",
            expected: "Free cancellation shown",
            kind: "text",
            value: "Free cancellation",
          },
        ],
      },
    },
  ],
  discovery: {
    entry: "existing_product",
    initialIntent: "Studio booking page",
    functions: [
      {
        id: "view",
        title: "View page",
        actor: "Visitor",
        sourceIds: ["ask"],
        requirementIds: ["heading", "cancel"],
      },
    ],
    journeys: [],
    openQuestions: [],
  },
};
const out: any = {};
const base = await call("establish_product_baseline", spec);
out.baseline =
  base.error ??
  `saved ${base.requirements} requirements, status ${base.status}`;
const badCitation = structuredClone(spec);
badCitation.requirements[0].citations[0].quote = "invented promise";
out.inventedCitation = (await call("save_product_review", badCitation)).error;
out.unapprovedRun =
  (await call("run_product_scenario", { id: base.id, scenarioId: "page" }))
    .error ?? "ACCEPTED (bad)";
const run = await call("run_product_scenario", {
  id: base.id,
  scenarioId: "page",
  approved: true,
});
for (let i = 0; i < 60; i++) {
  const s = await call("check_verification", { id: run.id });
  if (!["queued", "running"].includes(s.status)) {
    out.runStatus = s.status;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
const cov = await call("get_product_review", { id: base.id });
out.coverage = Object.fromEntries(
  cov.requirements.map((r: any) => [r.id, r.status]),
);
out.counts = cov.counts;
const report = await call("get_report", { id: run.id });
out.evidence = report.results.map(
  (r: any) =>
    `${r.viewport} ${r.criterion.id}: ${r.status}${r.screenshot ? " +screenshot" : ""}`,
);
out.unknownId = (
  await call("get_product_review", {
    id: "6f1d6c0e-5b0a-4d55-9f43-2f8f0c8b7a11",
  })
).error;
console.log(JSON.stringify(out, null, 2));
await client.close();
