// AsBuilt as a GitHub Action: run one reviewed plan against a preview and
// report observed evidence. No AI runs here. The plan is written by a person
// or by their assistant (Claude, ChatGPT) and reviewed in the pull request;
// this step only observes, so results are reproducible and cost nothing.
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Report } from "./schema.ts";
import { fixPrompt as fixPromptFor } from "./pr-comment.ts";

const env = process.env;
const root = fileURLToPath(new URL("..", import.meta.url));
const input = (name: string, fallback = "") =>
  (env[`INPUT_${name.toUpperCase().replace(/-/g, "_")}`] ?? fallback).trim();

function output(name: string, value: string) {
  if (env.GITHUB_OUTPUT)
    appendFileSync(env.GITHUB_OUTPUT, `${name}=${value}\n`);
}
function summary(markdown: string) {
  if (env.GITHUB_STEP_SUMMARY)
    appendFileSync(env.GITHUB_STEP_SUMMARY, markdown + "\n");
  else console.log(markdown);
}
const annotate = (level: "error" | "warning" | "notice", text: string) =>
  console.log(`::${level}::${text.replace(/\r?\n/g, " ")}`);

/** The preview URL must come from the workflow (trusted), never from the plan file. */
export function previewOrigin(url: string) {
  if (url === "sample") return "sample";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw Error(
      `"url" must be a full https:// preview address. Got: ${url || "(empty)"}`,
    );
  }
  if (parsed.protocol !== "https:")
    throw Error("The preview URL must use https://.");
  return parsed.origin;
}

/**
 * Turn the committed plan file into a runnable plan. Committing the file and
 * merging or approving the PR is the human review, so the Action supplies
 * `approved: true`. Wider permissions (clicks, page network traffic) must be
 * written in the file itself, where they show up in the PR diff.
 */
export function preparePlan(
  raw: any,
  url: string,
  source?: Record<string, unknown>,
) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw))
    throw Error("The plan file must contain one JSON object.");
  const { approved: _ignored, target: _alsoIgnored, ...rest } = raw;
  return {
    ...rest,
    target: url === "sample" ? "sample" : url,
    approved: true,
    ...(source ? { source } : {}),
  };
}

async function github(path: string, init: RequestInit = {}) {
  const token = input("github-token");
  if (!token) throw Error("No GitHub token available.");
  const r = await fetch(
    `${env.GITHUB_API_URL || "https://api.github.com"}${path}`,
    {
      ...init,
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json",
        ...(init.headers || {}),
      },
    },
  );
  if (!r.ok) {
    const { githubError } = await import("./github.ts");
    throw Error(githubError(r.status));
  }
  return r.status === 204 ? null : r.json();
}

/** Which commit and pull request this run belongs to, from the GitHub event. */
export async function eventSource() {
  const repository = env.GITHUB_REPOSITORY;
  if (
    !repository ||
    !env.GITHUB_EVENT_PATH ||
    !existsSync(env.GITHUB_EVENT_PATH)
  )
    return;
  const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
  let sha: string | undefined =
    event.pull_request?.head?.sha ?? event.deployment?.sha ?? env.GITHUB_SHA;
  let pr: number | undefined = event.pull_request?.number;
  if (!pr && sha && input("comment", "true") === "true") {
    try {
      const pulls = (await github(
        `/repos/${repository}/commits/${sha}/pulls`,
      )) as any[];
      pr = pulls.find((p) => p.state === "open")?.number;
    } catch (e) {
      annotate(
        "notice",
        `Couldn't find the pull request for ${sha}: ${(e as Error).message}`,
      );
    }
  }
  if (!sha || !/^[a-f0-9]{40}$/.test(sha)) return;
  return {
    url: `${env.GITHUB_SERVER_URL || "https://github.com"}/${repository}/${pr ? `pull/${pr}` : `commit/${sha}`}`,
    sha,
    repository,
    ...(pr ? { pr } : {}),
  };
}

function ensureWorkerImage() {
  if (
    spawnSync("docker", ["image", "inspect", "asbuilt-browser:local"], {
      stdio: "ignore",
    }).status === 0
  )
    return;
  console.log(
    "Building the isolated browser worker image (first interactive run only)…",
  );
  const built = spawnSync(
    "docker",
    ["build", "-f", "Dockerfile.browser", "-t", "asbuilt-browser:local", "."],
    { cwd: root, stdio: "inherit" },
  );
  if (built.status !== 0)
    throw Error(
      "Couldn't build the isolated browser worker. Interactive checks need Docker (available on ubuntu-latest runners).",
    );
}

const label = {
  pass: "✅ Pass",
  fail: "❌ Fail",
  not_verified: "⚪ Not verified",
} as const;

export function stepSummary(report: Report, evidenceUrl?: string) {
  const count = (s: string) =>
    report.results.filter((r) => r.status === s).length;
  const cell = (t: string) =>
    t.replace(/\|/g, "\\|").replace(/\s+/g, " ").slice(0, 300);
  return [
    "## AsBuilt verification",
    "",
    `**${count("pass")} passed · ${count("fail")} failed · ${count("not_verified")} not verified** on desktop and mobile. Run status: ${report.status}.`,
    "",
    `Target: ${report.plan.target === "sample" ? "bundled sample" : report.plan.target}${report.plan.source ? ` · Commit ${report.plan.source.sha.slice(0, 7)}` : ""}`,
    "",
    "| Result | Viewport | Expected | What AsBuilt saw |",
    "| --- | --- | --- | --- |",
    ...report.results.map(
      (r) =>
        `| ${label[r.status]} | ${r.viewport} | ${cell(r.criterion.expected)} | ${cell(r.observed)} |`,
    ),
    "",
    ...(fixPromptFor(report)
      ? [
          "### Fix prompt for Claude or ChatGPT",
          "",
          "~~~text",
          fixPromptFor(report),
          "~~~",
          "",
        ]
      : []),
    evidenceUrl
      ? `Screenshots for every check are in the **asbuilt-evidence** artifact on [this workflow run](${evidenceUrl}).`
      : "Screenshots are in the results folder.",
    "",
    "_Not verified means AsBuilt couldn't collect enough evidence. It isn't a pass. A failure is an observed mismatch, not a diagnosed cause._",
  ].join("\n");
}

export async function postComment(report: Report, evidenceUrl?: string) {
  const pr = report.plan.source?.pr;
  if (!pr || input("comment", "true") !== "true" || report.mode === "sample")
    return;
  const { commentBody } = await import("./pr-comment.ts");
  const marker = "<!-- asbuilt-verification -->";
  const body = commentBody(report, { evidenceUrl, marker });
  const repo = env.GITHUB_REPOSITORY;
  try {
    // One comment per PR, updated on each run, so reruns don't add noise.
    const comments = (await github(
      `/repos/${repo}/issues/${pr}/comments?per_page=100`,
    )) as any[];
    const mine = comments.find(
      (c) => typeof c.body === "string" && c.body.startsWith(marker),
    );
    if (mine)
      await github(`/repos/${repo}/issues/comments/${mine.id}`, {
        method: "PATCH",
        body: JSON.stringify({ body }),
      });
    else
      await github(`/repos/${repo}/issues/${pr}/comments`, {
        method: "POST",
        body: JSON.stringify({ body }),
      });
  } catch (e) {
    annotate(
      "warning",
      `Results are in the job summary, but the PR comment couldn't be posted: ${(e as Error).message} Give the workflow "pull-requests: write" permission. Pull requests from forks can't receive comments.`,
    );
  }
}

async function main() {
  const url = input("url");
  const origin = previewOrigin(url);
  const results = resolve(
    input("results-dir") || join(env.RUNNER_TEMP || ".", "asbuilt-results"),
  );
  mkdirSync(results, { recursive: true, mode: 0o700 });
  // Configure before the runner loads: it reads these at import time.
  env.ASBUILT_DATA_DIR = results;
  if (origin !== "sample") env.ASBUILT_PREVIEW_ORIGINS = origin;
  output("results-dir", results);

  const planPath = resolve(input("plan", ".asbuilt/plan.json"));
  if (!existsSync(planPath))
    throw Error(
      `No plan found at ${input("plan", ".asbuilt/plan.json")}. Ask Claude or ChatGPT (with the AsBuilt skill) to draft one, review it, and commit it.`,
    );
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(planPath, "utf8"));
  } catch {
    throw Error(`${input("plan", ".asbuilt/plan.json")} isn't valid JSON.`);
  }
  const plan = preparePlan(
    raw,
    url,
    origin === "sample" ? undefined : await eventSource(),
  );
  if ((plan as any).execution === "interactive" && origin !== "sample") {
    env.ASBUILT_INTERACTIVE_PREVIEWS = "true";
    ensureWorkerImage();
  }

  const { startVerification } = await import("./runner.ts");
  const { getReport } = await import("./store.ts");
  const started = startVerification(plan);
  const deadline = Date.now() + Number(input("timeout-minutes", "10")) * 60_000;
  let report = getReport(started.id);
  while (["queued", "running"].includes(report.status)) {
    if (Date.now() > deadline)
      throw Error("Verification timed out. Nothing was marked as passed.");
    await new Promise((r) => setTimeout(r, 1000));
    report = getReport(started.id);
  }
  writeFileSync(join(results, "report.json"), JSON.stringify(report, null, 2));

  const runUrl = env.GITHUB_RUN_ID
    ? `${env.GITHUB_SERVER_URL || "https://github.com"}/${env.GITHUB_REPOSITORY}/actions/runs/${env.GITHUB_RUN_ID}`
    : undefined;
  summary(stepSummary(report, runUrl));
  await postComment(report, runUrl);

  const count = (s: string) =>
    report.results.filter((r) => r.status === s).length;
  output("status", report.status);
  output("passed", String(count("pass")));
  output("failed", String(count("fail")));
  output("not-verified", String(count("not_verified")));
  output("mismatch", String(count("fail") > 0));
  for (const r of report.results.filter((x) => x.status === "fail"))
    annotate(
      "error",
      `${r.viewport}: expected "${r.criterion.expected}". AsBuilt saw: ${r.observed.slice(0, 200)}`,
    );
  if (count("not_verified"))
    annotate(
      "warning",
      `${count("not_verified")} check(s) could not be verified. See the job summary for why.`,
    );
  if (report.status !== "complete")
    throw Error(
      `The run ended "${report.status}"${report.error ? `: ${report.error}` : ""}. Nothing was marked as passed.`,
    );
}

if (import.meta.url === `file://${process.argv[1]}`)
  main().catch((e) => {
    annotate("error", (e as Error).message);
    process.exitCode = 1;
  });
