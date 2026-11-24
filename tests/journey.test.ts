import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import {
  journeySampleCriteria,
  planSchema,
  validateExecution,
  type Plan,
} from "../server/schema.ts";
import {
  journeyResourceAllowed,
} from "../server/safety.ts";

export const fixturePlan: Plan = {
  intent:
    "Choose Jamaica, open Island Market, and verify its product while retaining location.",
  target: "sample",
  approved: true,
  execution: "interactive",
  actionsApproved: true,
  journey: true,
  criteria: journeySampleCriteria,
};
async function worker(plan: Plan) {
  const child = spawn(process.execPath, ["server/browser-worker.mjs"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const results: any[] = [];
  let stderr = "";
  let done = false;
  child.stderr.on("data", (b) => (stderr += b.toString()));
  createInterface({ input: child.stdout }).on("line", (line) => {
    const m = JSON.parse(line);
    if (m.type === "result") results.push(m);
    if (m.type === "done") done = true;
    if (m.type === "fetch")
      child.stdin.write(
        JSON.stringify({ type: "resource", id: m.id, allowed: false }) + "\n",
      );
  });
  const finished = new Promise((resolve, reject) => {
    child.on("error", reject);
    child.on("close", resolve);
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 45000);
  child.stdin.write(JSON.stringify({ type: "start", plan }) + "\n");
  try {
    assert.equal(await finished, 0, stderr);
    assert.equal(done, true);
    return results;
  } finally {
    clearTimeout(timeout);
    child.kill();
  }
}
test("journey retains location across real page navigation, with fresh state per viewport and checkpoint evidence", async () => {
  const results = await worker(fixturePlan);
  assert.equal(results.length, 6);
  assert.ok(results.every((r) => r.status === "pass"));
  for (const r of results)
    assert.equal(
      Buffer.from(r.screenshot, "base64").subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
    );
  const failed = await worker({
    ...fixturePlan,
    criteria: [
      { ...fixturePlan.criteria[0], value: "Wrong expected location" },
      ...fixturePlan.criteria.slice(1),
    ],
  });
  assert.deepEqual(
    failed.map((r) => r.status),
    [
      "fail",
      "not_verified",
      "not_verified",
      "fail",
      "not_verified",
      "not_verified",
    ],
  );
  assert.ok(
    failed.filter((r) => r.index > 0).every((r) => r.actions.length === 0),
  );
});
test("journey navigation refuses a link whose actual destination differs from the reviewed destination", async () => {
  const result = await worker({
    ...fixturePlan,
    criteria: [
      fixturePlan.criteria[0],
      {
        ...fixturePlan.criteria[1],
        actions: [
          {
            type: "navigate",
            name: "Island Market",
            value: "https://sample.asbuilt.invalid/product",
          },
        ],
      },
    ],
  });
  assert.equal(result[1].status, "not_verified");
  assert.match(result[1].observed, /reviewed destination/);
  assert.equal(result[1].actions.length, 1);
  assert.match(result[1].actions[0], /completion not verified/);
});
test("journey plans require approval and same-origin reviewed navigation", () => {
  validateExecution(planSchema.parse(fixturePlan));
  assert.throws(
    () => validateExecution({ ...fixturePlan, actionsApproved: undefined }),
    /approve/,
  );
  assert.throws(
    () => validateExecution({ ...fixturePlan, journey: false }),
    /journey mode/,
  );
  assert.throws(
    () =>
      validateExecution({
        ...fixturePlan,
        readUrls: ["https://other.example/api"],
      }),
    /same-origin/,
  );
  assert.throws(
    () =>
      validateExecution({
        ...fixturePlan,
        readUrls: ["https://sample.asbuilt.invalid/api/delete"],
      }),
    /sensitive/,
  );
});
test("journey broker allows only reviewed documents/data, safe Next image sources, and bounded RSC navigation", () => {
  const target = new URL("https://preview.example/");
  const pages = ["https://preview.example/store?id=1"];
  const reads = ["https://preview.example/api/stores?country=JM"];
  const allowed = (url: string, type: string, method = "GET") =>
    journeyResourceAllowed(url, target, method, type, pages, reads, [
      "https://a.storyblok.com/f/123/",
    ]);
  assert.equal(allowed(pages[0], "document"), true);
  assert.equal(allowed(pages[0] + "&_rsc=abc123", "fetch"), true);
  assert.equal(allowed(reads[0], "fetch"), true);
  assert.equal(
    allowed(
      "https://preview.example/_next/image?url=%2Flogo.png&w=640&q=75",
      "image",
    ),
    true,
  );
  for (const [url, type, method] of [
    [reads[0], "fetch", "POST"],
    ["https://preview.example/api/stores?country=DO", "fetch", "GET"],
    ["https://preview.example/store?id=2", "document", "GET"],
    ["https://other.example/store?id=1", "document", "GET"],
    ["https://preview.example/store?id=1&_rsc=x&delete=1", "fetch", "GET"],
    [
      "https://preview.example/_next/image?url=http%3A%2F%2F127.0.0.1%2Fsecret&w=640&q=75",
      "image",
      "GET",
    ],
    [
      "https://preview.example/_next/image?url=%2Fapi%2Fdelete&w=640&q=75",
      "image",
      "GET",
    ],
    [
      "https://preview.example/_next/image?url=https%3A%2F%2Fevil.example%2Fa.png&w=640&q=75",
      "image",
      "GET",
    ],
  ])
    assert.equal(allowed(url, type, method), false, url);
});

