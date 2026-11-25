import test from "node:test";
import assert from "node:assert/strict";
import { planSchema, validateExecution } from "../server/schema.ts";
const base = {
  intent: "Inspect a public page",
  target: "https://example.com",
  approved: true as const,
  execution: "interactive" as const,
  publicReadOnly: true,
  criteria: [
    {
      id: "inspect",
      kind: "manual" as const,
      value: "",
      expected: "Capture the public page without actions",
    },
  ],
};
test("public inspection rejects interactions and broader grants", () => {
  validateExecution(planSchema.parse(base));
  for (const patch of [
    { journey: true },
    { readUrls: ["https://example.com/api"] },
    { execution: "static" },
    { target: "sample" },
    {
      criteria: [
        {
          ...base.criteria[0],
          actions: [{ type: "click", name: "Something", value: "" }],
        },
      ],
    },
    {
      criteria: [
        { ...base.criteria[0], expectedUrl: "https://example.com/next" },
      ],
    },
  ])
    assert.throws(() =>
      validateExecution(planSchema.parse({ ...base, ...patch })),
    );
});
