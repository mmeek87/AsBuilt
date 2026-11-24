import { spawn, spawnSync } from "node:child_process";
import { createInterface } from "node:readline";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { workerCommand } from "../server/interactive.ts";
import { journeySampleCriteria } from "../server/schema.ts";
const id = randomUUID();
const spec = workerCommand(false, id);
const child = spawn(spec.command, spec.args, {
  stdio: ["pipe", "pipe", "pipe"],
});
const results: any[] = [];
let done = false,
  error = "";
child.stderr.on("data", (b) => (error = (error + b).slice(-2000)));
createInterface({ input: child.stdout }).on("line", (line) => {
  const m = JSON.parse(line);
  if (m.type === "result") results.push(m);
  if (m.type === "done") done = true;
  if (m.type === "fetch")
    child.stdin.write(
      JSON.stringify({ type: "resource", id: m.id, allowed: false }) + "\n",
    );
});
const exit = new Promise((resolve, reject) => {
  child.on("close", resolve);
  child.on("error", reject);
});
const timer = setTimeout(() => child.kill("SIGKILL"), 60000);
child.stdin.write(
  JSON.stringify({
    type: "start",
    plan: {
      target: "sample",
      journey: true,
      execution: "interactive",
      criteria: journeySampleCriteria,
    },
  }) + "\n",
);
try {
  assert.equal(await exit, 0, error);
  assert.equal(done, true);
  assert.equal(results.length, 6);
  assert.ok(results.every((r) => r.status === "pass"));
  for (const r of results)
    assert.equal(
      Buffer.from(r.screenshot, "base64").subarray(0, 8).toString("hex"),
      "89504e470d0a1a0a",
    );
  console.log(
    "Network-isolated Docker journey: six checkpoints passed with screenshots; no external network requests.",
  );
} finally {
  clearTimeout(timer);
  child.kill();
  spawnSync("docker", ["rm", "-f", `asbuilt-${id}`], { stdio: "ignore" });
}
