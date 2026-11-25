import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { planSchema, validateExecution } from "../server/schema.ts";
import { builtPage, type BuildVariant } from "./fixtures/requirements/build.ts";

const rawPlan = readFileSync(
  new URL("./fixtures/requirements/plan.json", import.meta.url),
  "utf8",
);
const plan = planSchema.parse(JSON.parse(rawPlan));
validateExecution(plan);
const planHash = createHash("sha256").update(rawPlan).digest("hex");
async function runBuild(variant: BuildVariant) {
  const directory = join(".data", "requirements-benchmark", variant);
  mkdirSync(directory, { recursive: true });
  const child = spawn(process.execPath, ["server/browser-worker.mjs"], {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const results: any[] = [];
  let done = false,
    stderr = "",
    protocolError: unknown;
  child.stderr.on("data", (b) => {
    stderr = (stderr + b).slice(-2000);
  });
  child.stdin.on("error", () => {});
  createInterface({ input: child.stdout }).on("line", (line) => {
    try {
      const m = JSON.parse(line);
      if (m.type === "fetch") {
        const url = new URL(m.url);
        const allowed =
          m.method === "GET" &&
          url.origin === "https://requirements.asbuilt.invalid" &&
          ["/", "/store", "/product"].includes(url.pathname) &&
          !url.search;
        child.stdin.write(
          JSON.stringify({
            type: "resource",
            id: m.id,
            allowed,
            ...(allowed
              ? {
                  status: 200,
                  headers: { "content-type": "text/html; charset=utf-8" },
                  body: Buffer.from(builtPage(url.pathname, variant)).toString(
                    "base64",
                  ),
                }
              : {}),
          }) + "\n",
        );
      }
      if (m.type === "result") {
        const { screenshot, ...result } = m;
        assert.ok(screenshot, "Checkpoint requires screenshot evidence");
        const bytes = Buffer.from(screenshot, "base64");
        assert.equal(bytes.subarray(0, 8).toString("hex"), "89504e470d0a1a0a");
        const file = `${m.viewport.toLowerCase()}-${m.index}.png`;
        writeFileSync(join(directory, file), bytes);
        results.push({ ...result, screenshot: file });
      }
      if (m.type === "done") done = true;
    } catch (error) {
      protocolError = error;
      child.kill();
    }
  });
  const finished = new Promise((resolve, reject) => {
    child.once("error", reject);
    child.once("close", resolve);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
  child.stdin.write(JSON.stringify({ type: "start", plan }) + "\n");
  try {
    assert.equal(await finished, 0, stderr);
    if (protocolError) throw protocolError;
    assert.ok(done);
    writeFileSync(
      join(directory, "report.json"),
      JSON.stringify({ variant, planHash, plan, results }, null, 2),
    );
    return results;
  } finally {
    clearTimeout(timer);
    child.kill();
  }
}

test("unchanged requirement-derived plan passes correct build and catches wrong seller on both viewports", async () => {
  const correct = await runBuild("correct");
  assert.equal(correct.length, 12);
  assert.ok(correct.every((r) => r.status === "pass"));
  const broken = await runBuild("wrong-seller");
  assert.equal(broken.length, 12);
  for (const viewport of ["Desktop", "Mobile"]) {
    const checkpoints = broken.filter((r) => r.viewport === viewport);
    assert.deepEqual(
      checkpoints.map((r) => r.status),
      ["pass", "pass", "pass", "pass", "fail", "not_verified"],
    );
    assert.match(checkpoints[4].observed, /Sold by Maple Market/);
    assert.equal(checkpoints[4].blocked, 0);
    assert.match(checkpoints[5].observed, /Not attempted/);
    assert.deepEqual(checkpoints[5].actions, []);
  }
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(
          new URL("./fixtures/requirements/plan.json", import.meta.url),
        ),
      )
      .digest("hex"),
    planHash,
  );
});

test("unchanged requirement detects lost region even when the store opens correctly", async () => {
  const results = await runBuild("lost-region");
  assert.equal(results.length, 12);
  for (const viewport of ["Desktop", "Mobile"]) {
    const checkpoints = results.filter((r) => r.viewport === viewport);
    assert.deepEqual(
      checkpoints.map((r) => r.status),
      ["pass", "pass", "fail", "not_verified", "not_verified", "not_verified"],
    );
    assert.match(checkpoints[2].observed, /Sending to Ontario/);
    assert.equal(checkpoints[2].blocked, 0);
    for (const checkpoint of checkpoints.slice(3)) {
      assert.match(checkpoint.observed, /Not attempted/);
      assert.deepEqual(checkpoint.actions, []);
    }
  }
  assert.equal(
    createHash("sha256")
      .update(
        readFileSync(
          new URL("./fixtures/requirements/plan.json", import.meta.url),
        ),
      )
      .digest("hex"),
    planHash,
  );
});
