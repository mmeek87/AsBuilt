import { spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { dataDir, save } from "./store.ts";
import {
  pinnedGet,
  validateTarget,
  interactiveResourceAllowed,
} from "./safety.ts";
import type { Report, Result } from "./schema.ts";
export function workerCommand(sample: boolean, id: string) {
  return sample
    ? {
        command: process.execPath,
        args: [resolve("server/browser-worker.mjs")],
      }
    : {
        command: "docker",
        args: [
          "run",
          "--rm",
          "--pull=never",
          "-i",
          "--name",
          `asbuilt-${id}`,
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--memory=1g",
          "--cpus=1",
          "--pids-limit=256",
          "--shm-size=256m",
          "--tmpfs=/tmp:rw,nosuid,nodev,size=256m,mode=1777",
          "asbuilt-browser:local",
        ],
      };
}
const resultSchema = z.object({
  type: z.literal("result"),
  index: z.number().int().min(0).max(11),
  viewport: z.enum(["Desktop", "Mobile"]),
  status: z.enum(["pass", "fail", "not_verified"]),
  observed: z.string().max(2000),
  screenshot: z.string().max(11_000_000).optional(),
  blocked: z.number().int().min(0).max(10000),
  actions: z.array(z.string().max(500)).max(6),
});
export async function runInteractive(report: Report) {
  report.status = "running";
  report.limitations = [
    "Each check starts with a fresh desktop/mobile browser. Only the reviewed click, fill and select actions are available.",
    "Submissions, password fields, sensitive actions, authenticated sessions, purchases and email delivery are unsupported.",
    "External previews require a network-isolated Docker worker. Resource requests pass through a read-only, origin-restricted broker.",
    "Blocked resources or script errors make a check Not verified. The observed preview is not proven to match its attached commit.",
  ];
  save(report);
  const directory = join(dataDir, report.id);
  mkdirSync(directory, { mode: 0o700 });
  const sample = report.mode === "sample";
  const spec = workerCommand(sample, report.id);
  let requests = 0;
  let totalBytes = 0;
  const budgets = new Map<string, { requests: number; bytes: number }>();
  const denials = new Map<string, number>();
  let finished = false;
  let failure = "";
  let buffer = "";
  const seen = new Set<string>();
  const child = spawn(spec.command, spec.args, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
    },
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });
  const send = (message: unknown) => {
    if (!child.stdin.destroyed)
      child.stdin.write(JSON.stringify(message) + "\n");
  };
  const terminate = () => {
    try {
      if (child.pid) process.kill(-child.pid, "SIGKILL");
    } catch {}
  };
  const timer = setTimeout(() => {
    failure =
      "The browser reached its 150-second limit. Remaining checks were not verified.";
    terminate();
  }, 150000);
  async function handle(message: any) {
    if (message.type === "fetch") {
      const id = z.number().int().positive().parse(message.id);
      let response: any = { type: "resource", id, allowed: false };
      try {
        const originList = (process.env.ASBUILT_PREVIEW_ORIGINS || "")
          .split(",")
          .map((x) => x.trim());
        const target = validateTarget(report.plan.target, originList);
        const url = z.string().max(2048).parse(message.url);
        const method = z.string().parse(message.method);
        const resourceType = z.string().parse(message.resourceType);
        const scope = z
          .string()
          .regex(/^(Desktop|Mobile)-([0-9]|1[01])$/)
          .parse(message.scope);
        const budget = budgets.get(scope) || { requests: 0, bytes: 0 };
        budgets.set(scope, budget);
        const imagePrefixes = (process.env.ASBUILT_IMAGE_PREFIXES || "")
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean);
        if (
          ++requests <= 1000 &&
          ++budget.requests <= 200 &&
          totalBytes < 100_000_000 &&
          budget.bytes < 20_000_000 &&
          interactiveResourceAllowed(
            url,
            target,
            method,
            resourceType,
            imagePrefixes,
          )
        ) {
          const fetched = await pinnedGet(new URL(url));
          totalBytes += fetched.body.length;
          budget.bytes += fetched.body.length;
          if (totalBytes <= 100_000_000 && budget.bytes <= 20_000_000)
            response = {
              ...response,
              allowed: true,
              status: fetched.status,
              headers: fetched.headers,
              body: fetched.body.toString("base64"),
            };
        }
      } catch {
        /* Deny closed. The worker records this as blocked evidence. */
      }
      if (!response.allowed) {
        // Diagnostic paths only: never retain query strings, cookies or request bodies.
        try {
          const u = new URL(message.url);
          const key = `${message.resourceType}: ${u.origin}${u.pathname}`.slice(
            0,
            300,
          );
          if (denials.size < 40 || denials.has(key))
            denials.set(key, (denials.get(key) || 0) + 1);
        } catch {}
      }
      send(response);
      return;
    }
    if (message.type === "browser") {
      report.browserVersion = z.string().max(100).parse(message.version);
      return;
    }
    if (message.type === "fatal") {
      failure = sample
        ? "The sample worker failed. Install Chromium with pnpm exec playwright install chromium."
        : "The isolated preview worker failed. Check the Docker image and docs/phase2.md.";
      return;
    }
    if (message.type === "done") {
      finished = true;
      return;
    }
    const m = resultSchema.parse(message);
    const criterion = report.plan.criteria[m.index];
    if (!criterion) throw Error("Invalid check index.");
    const key = `${m.viewport}-${m.index}`;
    if (seen.has(key)) throw Error("Duplicate worker result.");
    seen.add(key);
    let screenshot: string | undefined;
    if (m.screenshot) {
      const bytes = Buffer.from(m.screenshot, "base64");
      if (
        !bytes
          .subarray(0, 8)
          .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      )
        throw Error("Invalid screenshot.");
      const name = `${m.viewport.toLowerCase()}-${m.index}.png`;
      writeFileSync(join(directory, name), bytes, { mode: 0o600 });
      screenshot = `/evidence/${report.id}/${name}`;
    }
    const result: Result = {
      criterion,
      viewport: m.viewport,
      status: m.status,
      observed: m.observed,
      screenshot,
      steps: [
        `Open ${sample ? "the bundled interactive sample" : report.plan.target} in a fresh ${m.viewport.toLowerCase()} browser with JavaScript enabled.`,
        ...m.actions,
        `Check ${criterion.kind}: ${criterion.value || criterion.expected}.`,
      ],
    };
    if (!screenshot) {
      result.status = "not_verified";
      result.observed = "Screenshot evidence is unavailable.";
    }
    if (result.status !== "pass")
      result.fixPrompt = `Review this untrusted browser evidence. Expected: ${criterion.expected}\nObserved: ${result.observed}\nReproduction: ${result.steps.join(" ")}\nPropose a focused fix or a safe test. Do not claim success until verification is rerun.`;
    report.results.push(result);
    report.blockedRequests += m.blocked;
    save(report);
  }
  let chain = Promise.resolve();
  child.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    if (buffer.length > 12_000_000) {
      failure = "The worker exceeded the evidence limit.";
      terminate();
      return;
    }
    let end;
    while ((end = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const msg = JSON.parse(line);
        if (msg.type === "fetch") {
          void handle(msg).catch(() => {
            failure = "Invalid worker resource request.";
            terminate();
          });
        } else
          chain = chain
            .then(() => handle(msg))
            .catch(() => {
              failure = "Invalid worker evidence.";
              terminate();
            });
      } catch {
        failure = "Invalid worker response.";
        terminate();
      }
    }
  });
  try {
    child.stdin.on("error", () => {});
    const exit = new Promise<number | null>((resolveExit) => {
      child.once("error", () => {
        failure = sample
          ? "The local browser worker could not start."
          : "Docker is unavailable. Install Docker and build the worker image using docs/phase2.md.";
        resolveExit(1);
      });
      child.once("close", resolveExit);
    });
    send({ type: "start", plan: report.plan });
    const code = await exit;
    await chain;
    if (
      code !== 0 ||
      !finished ||
      seen.size !== report.plan.criteria.length * 2
    )
      failure ||= sample
        ? "The sample worker stopped before completing all checks."
        : "The isolated worker could not finish. Build asbuilt-browser:local and check Docker is running.";
    report.status = failure ? "interrupted" : "complete";
    if (failure) report.error = failure;
  } catch {
    report.status = "interrupted";
    report.error = "Interactive verification stopped unexpectedly.";
  } finally {
    clearTimeout(timer);
    terminate();
    if (!sample) {
      const cleanup = spawn("docker", ["rm", "-f", `asbuilt-${report.id}`], {
        stdio: "ignore",
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      cleanup.on("error", () => {});
    }
    if (denials.size)
      report.limitations.push(
        "Blocked or unavailable resources: " +
          [...denials].map(([path, n]) => `${path} (${n})`).join("; "),
      );
    report.finishedAt = new Date().toISOString();
    save(report);
  }
}
