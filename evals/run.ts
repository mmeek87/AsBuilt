// AsBuilt verification eval. Runs the real browser worker, journey executor,
// action policy and observation code against controlled builds whose correct
// verdicts are known in advance. Only page transport is simulated. No live
// sites, credentials or paid models are used, so there is no model cost.
//
//   pnpm eval            one pass over every scenario
//   pnpm eval --repeat 3 reproducibility: verdicts must be identical each time
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { planSchema, validateExecution } from "../server/schema.ts";
import { scenarios, type Scenario, type Expect } from "./scenarios.ts";

const root = fileURLToPath(new URL("..", import.meta.url));
const rawPlan = readFileSync(
  join(root, "tests/fixtures/requirements/plan.json"),
  "utf8",
);
const plan = planSchema.parse(JSON.parse(rawPlan));
validateExecution(plan);
const planHash = createHash("sha256").update(rawPlan).digest("hex");
const ids = plan.criteria.map((c) => c.id);
const origin = "https://requirements.asbuilt.invalid";

type Observed = {
  viewport: string;
  id: string;
  status: string;
  observed: string;
  screenshot: boolean;
};

async function execute(scenario: Scenario) {
  const attempts = new Map<string, number>();
  const child = spawn(
    process.execPath,
    [join(root, "server/browser-worker.mjs")],
    {
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        PATH: process.env.PATH,
        HOME: process.env.HOME,
        TMPDIR: process.env.TMPDIR,
        ...(process.env.PLAYWRIGHT_BROWSERS_PATH
          ? { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH }
          : {}),
      },
    },
  );
  const results: Observed[] = [];
  let done = false;
  let stderr = "";
  child.stderr.on("data", (b) => (stderr = (stderr + b).slice(-2000)));
  child.stdin.on("error", () => {});
  createInterface({ input: child.stdout }).on("line", (line) => {
    const m = JSON.parse(line);
    if (m.type === "fetch") {
      const url = new URL(m.url);
      const allowed =
        m.method === "GET" &&
        url.origin === origin &&
        ["/", "/store", "/product"].includes(url.pathname) &&
        !url.search;
      let page;
      if (allowed) {
        const n = (attempts.get(url.pathname) ?? 0) + 1;
        attempts.set(url.pathname, n);
        page = scenario.page(url.pathname, n);
      }
      child.stdin.write(
        JSON.stringify({
          type: "resource",
          id: m.id,
          allowed,
          ...(page
            ? {
                status: page.status,
                headers: { "content-type": "text/html; charset=utf-8" },
                body: Buffer.from(page.body).toString("base64"),
              }
            : {}),
        }) + "\n",
      );
    }
    if (m.type === "result")
      results.push({
        viewport: m.viewport,
        id: ids[m.index],
        status: m.status,
        observed: m.observed,
        screenshot: Boolean(m.screenshot),
      });
    if (m.type === "done") done = true;
  });
  const started = Date.now();
  const exit = new Promise<number | null>((res, rej) => {
    child.once("error", rej);
    child.once("close", res);
  });
  const timer = setTimeout(() => child.kill("SIGKILL"), 90000);
  child.stdin.write(JSON.stringify({ type: "start", plan }) + "\n");
  const code = await exit;
  clearTimeout(timer);
  return { results, done, code, stderr, ms: Date.now() - started };
}

function score(scenario: Scenario, results: Observed[]) {
  const rows: {
    viewport: string;
    id: string;
    expected: Expect;
    actual: string;
    outcome: string;
  }[] = [];
  for (const viewport of ["Desktop", "Mobile"]) {
    const expected =
      viewport === "Mobile" && scenario.mobile
        ? scenario.mobile
        : scenario.expected;
    for (const id of ids) {
      const want = expected[id];
      const got = results.find((r) => r.viewport === viewport && r.id === id);
      const actual = got?.status ?? "no result";
      let outcome: string;
      // After a stop, each later check must be absent or explicitly Not verified.
      if (want === "stop")
        outcome =
          !got || got.status === "not_verified"
            ? "correct"
            : got.status === "pass"
              ? "false pass (should have stopped)"
              : "ran after stop";
      else if (!got) outcome = "missing result";
      else if (want === "pass")
        outcome =
          got.status === "pass"
            ? "correct"
            : got.status === "fail"
              ? "false fail"
              : "inconclusive on working build";
      else if (want === "fail")
        outcome =
          got.status === "fail"
            ? "correct"
            : got.status === "pass"
              ? "FALSE PASS"
              : "inconclusive (defect not confirmed)";
      else
        outcome =
          got.status === "pass"
            ? "FALSE PASS"
            : got.status === "fail"
              ? "misattributed blocker"
              : "correct";
      if (got && !got.screenshot && got.status !== "not_verified")
        outcome += " (no screenshot)";
      rows.push({ viewport, id, expected: want, actual, outcome });
    }
  }
  return rows;
}

const repeat = Math.max(
  1,
  Number(process.argv[process.argv.indexOf("--repeat") + 1]) || 1,
);
const out = join(root, ".data", "evals");
mkdirSync(out, { recursive: true });
const summary: any[] = [];
const verdictsByScenario = new Map<string, string[]>();
for (let r = 1; r <= repeat; r++)
  for (const scenario of scenarios) {
    const run = await execute(scenario);
    const rows = score(scenario, run.results);
    const signature = JSON.stringify(rows.map((x) => x.actual));
    verdictsByScenario.set(scenario.id, [
      ...(verdictsByScenario.get(scenario.id) ?? []),
      signature,
    ]);
    const count = (s: string) =>
      rows.filter((x) => x.outcome.startsWith(s)).length;
    summary.push({
      repetition: r,
      scenario: scenario.id,
      category: scenario.category,
      checks: rows.filter((x) => x.expected !== "stop").length,
      correct: count("correct"),
      falsePasses: rows.filter((x) => /FALSE PASS|false pass/.test(x.outcome))
        .length,
      falseFails: count("false fail"),
      inconclusive: rows.filter((x) => x.outcome.startsWith("inconclusive"))
        .length,
      misattributed: count("misattributed blocker"),
      missing: count("missing result") + count("ran after stop"),
      workerExit: run.code,
      ms: run.ms,
      rows,
    });
    writeFileSync(
      join(out, `${scenario.id}-${r}.json`),
      JSON.stringify(
        { planHash, ...summary.at(-1), raw: run.results },
        null,
        2,
      ),
    );
  }

const first = summary.filter((s) => s.repetition === 1);
const totals = {
  scenarios: first.length,
  repetitions: repeat,
  planSha256: planHash,
  checks: first.reduce((a, s) => a + s.rows.length, 0),
  correctVerdicts: first.reduce((a, s) => a + s.correct, 0),
  falsePasses: summary.reduce((a, s) => a + s.falsePasses, 0),
  falseFails: summary.reduce((a, s) => a + s.falseFails, 0),
  inconclusive: summary.reduce((a, s) => a + s.inconclusive, 0),
  misattributedBlockers: summary.reduce((a, s) => a + s.misattributed, 0),
  reproducible: [...verdictsByScenario.values()].every(
    (v) => new Set(v).size === 1,
  ),
  medianMs: [...first.map((s) => s.ms)].sort((a, b) => a - b)[
    Math.floor(first.length / 2)
  ],
  modelCost: "$0 (no model calls)",
};
writeFileSync(
  join(out, "summary.json"),
  JSON.stringify({ totals, summary }, null, 2),
);
console.log(
  "| Scenario | Category | Correct verdicts | False passes | False fails | Blockers reported as defects | Inconclusive on known defect | Time |",
);
console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
for (const s of first)
  console.log(
    `| ${s.scenario} | ${s.category} | ${s.correct}/${s.rows.length} | ${s.falsePasses} | ${s.falseFails} | ${s.misattributed} | ${s.inconclusive} | ${(s.ms / 1000).toFixed(1)}s |`,
  );
console.log("\n" + JSON.stringify(totals, null, 2));
for (const s of first)
  for (const row of s.rows)
    if (row.outcome !== "correct")
      console.log(
        `  ${s.scenario} ${row.viewport} ${row.id}: expected ${row.expected}, got ${row.actual} -> ${row.outcome}`,
      );
process.exitCode = totals.falsePasses > 0 ? 1 : 0;
