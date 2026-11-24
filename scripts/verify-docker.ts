import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { workerCommand } from "../server/interactive.ts";
import { interactiveSampleCriteria } from "../server/schema.ts";
// Trusted fixture only; no external website or network retrieval.
async function check(target: string, expected: string[]) {
  const id = randomUUID();
  const spec = workerCommand(false, id);
  const child = spawn(spec.command, spec.args, {
    stdio: ["pipe", "pipe", "pipe"],
  });
  const results: any[] = [];
  let done = false;
  let error = "";
  const timer = setTimeout(() => child.kill("SIGKILL"), 90000);
  child.stderr.on("data", (b) => {
    error = (error + b).slice(-2000);
  });
  createInterface({ input: child.stdout }).on("line", (line) => {
    const message = JSON.parse(line);
    if (message.type === "result") results.push(message);
    if (message.type === "done") done = true;
    if (message.type === "fetch")
      child.stdin.write(
        JSON.stringify({ type: "resource", id: message.id, allowed: false }) +
          "\n",
      );
  });
  const exited = new Promise<number | null>((resolve, reject) => {
    child.on("exit", resolve);
    child.on("error", reject);
  });
  child.stdin.write(
    JSON.stringify({
      type: "start",
      plan: {
        target,
        criteria:
          target === "sample"
            ? [
                ...interactiveSampleCriteria,
                {
                  id: "missing",
                  kind: "text",
                  value: "Intentionally absent",
                  expected: "Missing fixture text",
                  actions: [],
                },
              ]
            : [interactiveSampleCriteria[0]],
      },
    }) + "\n",
  );
  try {
    assert.equal(await exited, 0, error);
    assert.equal(done, true);
    assert.deepEqual(
      results.map((r) => r.status),
      expected,
    );
    for (const result of results)
      assert.equal(
        Buffer.from(result.screenshot, "base64").subarray(0, 8).toString("hex"),
        "89504e470d0a1a0a",
      );
    console.log(
      `${target === "sample" ? "Container interactions and missing outcome" : "Denied broker request"}: passed (${results.length} screenshots)`,
    );
  } finally {
    clearTimeout(timer);
    child.kill("SIGKILL");
    spawnSync("docker", ["rm", "-f", `asbuilt-${id}`], { stdio: "ignore" });
  }
}
await check("sample", [
  "pass",
  "pass",
  "pass",
  "fail",
  "pass",
  "pass",
  "pass",
  "fail",
]);
await check("https://fixture.asbuilt.invalid/", [
  "not_verified",
  "not_verified",
]);
