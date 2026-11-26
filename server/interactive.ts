import { createBrowserNetwork } from "./browser-network.ts";
import { journeyResourceAllowed, reviewedDestinations } from "./safety.ts";
import {
  recordBlockedResource,
  resourceFailureReason,
} from "./resource-evidence.ts";
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
          "--tmpfs=/home/pwuser:rw,nosuid,nodev,size=32m,mode=1777",
          "asbuilt-browser:local",
        ],
      };
}
/**
 * Minimal environment for the browser worker. Host secrets are never passed.
 * The local sample worker also needs Playwright's browser location when the
 * operator (or CI) installs browsers outside the default cache; without it
 * every interactive sample run ends "interrupted". The Docker worker is
 * unaffected: its image bundles browsers and docker receives no -e flags.
 */
export function workerEnv(
  sample: boolean,
  source: NodeJS.ProcessEnv = process.env,
) {
  const env: Record<string, string | undefined> = {
    PATH: source.PATH,
    HOME: source.HOME,
    TMPDIR: source.TMPDIR,
  };
  if (sample && source.PLAYWRIGHT_BROWSERS_PATH)
    env.PLAYWRIGHT_BROWSERS_PATH = source.PLAYWRIGHT_BROWSERS_PATH;
  return env;
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
  if (report.plan.journey)
    report.limitations = [
      "One fresh browser session per viewport; checkpoints share location and navigation state only within this run.",
      "Only reviewed links, controls, document destinations and exact read-only data URLs are permitted. No credentials, submissions, cart changes or purchases.",
      "A failed or uncertain checkpoint stops subsequent actions. Screenshots are captured at each checkpoint.",
      "Positive observations describe only their exact checkpoint; blocked resources and script errors remain coverage limits. Missing outcomes with functional blockers are Not verified.",
    ];
  if (report.plan.publicReadOnly)
    report.limitations = [
      "Public read-only inspection: fresh signed-out browser, no user actions, credentials, API grants or persisted browser state.",
      "Only the approved origin's page and permitted static assets may load. Cross-origin assets, API requests and writes remain blocked.",
      "This inspection does not certify application behavior or full rendering; blocked resources may prevent client rendering.",
    ];
  if (report.plan.network === "browser")
    report.limitations = [
      "Normal browser networking: HTTPS dependencies, APIs, cookies and page-initiated writes are allowed. No guarantee of zero server-side changes.",
      "Use staging, isolated test data and sandbox external services. A preview URL alone is not proof of database isolation.",
      "Fresh browser session in a network-isolated container; public HTTPS connections are DNS-validated and pinned. Private networks, non-HTTPS traffic, downloads and unreviewed top-level origins remain blocked.",
      "Only the reviewed user actions execute. Production inspection has no user actions. No personal browser session or host credentials are imported.",
      "Browser engine and exact observations define coverage. WebKit is not an installed Safari test.",
    ];
  save(report);
  const directory = join(dataDir, report.id);
  mkdirSync(directory, { mode: 0o700 });
  const sample = report.mode === "sample";
  const spec = workerCommand(sample, report.id);
  let requests = 0;
  let totalBytes = 0;
  const budgets = new Map<string, { requests: number; bytes: number }>();
  let finished = false;
  let failure = "";
  let buffer = "";
  const seen = new Set<string>();
  const child = spawn(spec.command, spec.args, {
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
    env: workerEnv(sample),
  });
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr = (stderr + chunk.toString()).slice(-2000);
  });
  const send = (message: unknown) => {
    if (!child.stdin.destroyed)
      child.stdin.write(JSON.stringify(message) + "\n");
  };
  const network =
    report.plan.network === "browser"
      ? createBrowserNetwork(send, (origin, reason) =>
          recordBlockedResource(report, origin, "connection", reason),
        )
      : null;
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
    if (
      typeof message.type === "string" &&
      message.type.startsWith("tunnel-")
    ) {
      if (!network) throw Error("Unapproved browser networking.");
      await network.receive(message);
      return;
    }
    if (message.type === "fetch") {
      const id = z.number().int().positive().parse(message.id);
      let response: any = { type: "resource", id, allowed: false };
      let deniedReason = "network policy or resource budget";
      try {
        const originList = (
          (report.plan.publicReadOnly
            ? process.env.ASBUILT_PUBLIC_READONLY_ORIGINS
            : process.env.ASBUILT_PREVIEW_ORIGINS) || ""
        )
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
          (report.plan.journey
            ? journeyResourceAllowed(
                url,
                target,
                method,
                resourceType,
                reviewedDestinations(report.plan),
                report.plan.readUrls ?? [],
                imagePrefixes,
              )
            : interactiveResourceAllowed(
                url,
                target,
                method,
                resourceType,
                imagePrefixes,
              ))
        ) {
          const fetched = await pinnedGet(
            new URL(url),
            undefined,
            report.plan.journey
              ? z.record(z.string().max(12000)).parse(message.headers ?? {})
              : {},
          );
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
      } catch (error) {
        deniedReason = resourceFailureReason(error);
      }
      if (!response.allowed) {
        recordBlockedResource(
          report,
          String(message.url),
          String(message.resourceType),
          deniedReason,
        );
      }
      send(response);
      return;
    }
    if (message.type === "browser") {
      if (
        report.plan.criteria.some((c) => c.within) &&
        message.scopedAssertionsVersion !== 1
      )
        throw Error("Rebuild the browser worker for scoped assertions.");
      if (report.plan.network === "browser" && message.networkVersion !== 1)
        throw Error("Rebuild the browser worker for browser networking.");
      if (report.plan.journey && message.journeyVersion !== 1)
        throw Error("Rebuild the browser worker for journeys.");
      if (message.matchingVersion !== 1)
        throw Error(
          "Rebuild the browser worker: matching capabilities are outdated.",
        );
      report.browserVersion = z.string().max(100).parse(message.version);
      return;
    }
    if (message.type === "fatal") {
      failure = sample
        ? `The sample worker failed. Install the selected engine with pnpm exec playwright install ${report.plan.browser ?? "chromium"}.`
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
        if (
          msg.type === "fetch" ||
          (typeof msg.type === "string" && msg.type.startsWith("tunnel-"))
        ) {
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
    network?.close();
    terminate();
    if (!sample) {
      const cleanup = spawn("docker", ["rm", "-f", `asbuilt-${report.id}`], {
        stdio: "ignore",
        env: { PATH: process.env.PATH, HOME: process.env.HOME },
      });
      cleanup.on("error", () => {});
    }
    report.finishedAt = new Date().toISOString();
    save(report);
  }
}
