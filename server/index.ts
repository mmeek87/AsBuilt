import { sessionStore } from "./sessions.ts";
import express from "express";
import { randomBytes, timingSafeEqual, createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { z } from "zod";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { dataDir, reports, getReport, deleteReport } from "./store.ts";
import { startVerification, allowedOrigins, isRunActive } from "./runner.ts";
import {
  sampleIntent,
  planSchema,
  interactiveSampleCriteria,
} from "./schema.ts";
import {
  githubConfigured,
  listRepositories,
  inspectSource,
  postComment,
} from "./github.ts";
import { preparePlan, agentConfigured } from "./agent.ts";
import { makeMcp, dispatch } from "./mcp.ts";
const app = express();
const port = Number(process.env.PORT || 4310);
const origin = `http://127.0.0.1:${port}`;
const tokenPath = join(dataDir, "token");
if (!process.env.ASBUILT_TOKEN && !existsSync(tokenPath))
  writeFileSync(tokenPath, randomBytes(32).toString("hex"), { mode: 0o600 });
const token =
  process.env.ASBUILT_TOKEN || readFileSync(tokenPath, "utf8").trim();
if (token.length < 32)
  throw Error("ASBUILT_TOKEN must be at least 32 characters.");
const sessions = sessionStore(join(dataDir, "sessions.json"), token);
const sessionCookie = (req: express.Request) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("asbuilt="))
    ?.slice(8) || "";
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
app.disable("x-powered-by");
app.use(express.json({ limit: "64kb" }));
app.use((req, res, next) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  });
  if (
    req.headers.host !== `127.0.0.1:${port}` &&
    req.headers.host !== `localhost:${port}`
  )
    return res.status(403).json({ error: "Invalid host." });
  if (
    req.headers.origin &&
    ![origin, `http://localhost:${port}`].includes(req.headers.origin)
  )
    return res
      .status(403)
      .json({ error: "Cross-origin requests are blocked." });
  next();
});
app.post("/api/session", (req, res) => {
  if (!equal(String(req.body?.token || ""), token))
    return res
      .status(401)
      .json({ error: "Use the access key from your local .data/token file." });
  const remembered = req.body?.remember === true;
  const session = sessions.issue(remembered);
  res.setHeader(
    "Set-Cookie",
    `asbuilt=${session.value}; HttpOnly; SameSite=Strict; Path=/${remembered ? `; Max-Age=${session.seconds}` : ""}`,
  );
  res.json({ ok: true });
});
app.use(["/api", "/evidence", "/mcp"], (req, res, next) => {
  const bearer = String(req.headers.authorization || "").replace(
    /^Bearer /,
    "",
  );
  const cookie = sessionCookie(req);
  if (!equal(bearer, token) && !sessions.valid(cookie))
    return res
      .status(401)
      .json({ error: "Unlock your local workspace to continue." });
  next();
});
app.post("/api/logout", (req, res) => {
  sessions.revoke(sessionCookie(req));
  res.setHeader(
    "Set-Cookie",
    "asbuilt=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
  );
  res.json({ ok: true });
});
app.get("/api/config", (_req, res) =>
  res.json({
    github: githubConfigured(),
    agent: agentConfigured(),
    comments: process.env.GITHUB_ALLOW_COMMENTS === "true",
    origins: allowedOrigins(),
    sampleIntent,
    interactiveSampleCriteria,
    interactivePreviews: process.env.ASBUILT_INTERACTIVE_PREVIEWS === "true",
    installUrl: process.env.GITHUB_APP_SLUG
      ? `https://github.com/apps/${encodeURIComponent(process.env.GITHUB_APP_SLUG)}/installations/new`
      : null,
  }),
);
app.get("/api/repositories", async (_req, res) =>
  res.json(await listRepositories()),
);
app.post("/api/source", async (req, res) =>
  res.json(await inspectSource(z.string().url().parse(req.body.url))),
);
app.post("/api/plan", async (req, res) =>
  res.json(await preparePlan(req.body)),
);
app.post("/api/runs", async (req, res) => {
  const plan = planSchema.parse(req.body);
  if (plan.source) {
    const actual = await inspectSource(plan.source.url);
    if (
      actual.sha !== plan.source.sha ||
      actual.repository !== plan.source.repository ||
      actual.pr !== plan.source.pr
    )
      throw Error("GitHub source changed or does not match. Review it again.");
  }
  res.status(202).json(startVerification(plan));
});
app.get("/api/runs", (_req, res) =>
  res.json(
    [...reports.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .map((r) => ({
        id: r.id,
        status: r.status,
        createdAt: r.createdAt,
        mode: r.mode,
        intent: r.plan.intent,
      })),
  ),
);
app.get("/api/runs/:id", (req, res) => {
  if (!reports.has(req.params.id))
    return res.status(404).json({ error: "Report not found." });
  res.json(getReport(req.params.id));
});
app.delete("/api/runs/:id", (req, res) => {
  z.object({ confirmed: z.literal(true) })
    .strict()
    .parse(req.body);
  const id = z.string().uuid().parse(req.params.id);
  if (isRunActive(id))
    return res
      .status(409)
      .json({ error: "Wait for this review to finish before deleting it." });
  deleteReport(id);
  res.json({ deleted: true });
});
app.post("/api/tools/:name", async (req, res) =>
  res.json(await dispatch(req.params.name, req.body)),
);
function commentBody(id: string) {
  const r = getReport(id);
  if (r.status !== "complete" || r.mode === "sample" || !r.plan.source?.pr)
    throw Error(
      "Only a completed preview report attached to a pull request can be posted.",
    );
  return `## AsBuilt verification\n\nCommit: ${r.plan.source.sha}\nTarget: ${r.plan.target}\n\n${r.results.map((x) => `- **${x.status.toUpperCase()} · ${x.viewport}** ${x.criterion.expected}\n  Observed: ${x.observed}`).join("\n")}\n\nLimitations: ${r.limitations.join(" ")}\n\nReport ID: ${r.id}. Screenshots are stored locally and are not uploaded to GitHub.`;
}
const approvals = new Map<
  string,
  { id: string; hash: string; expires: number }
>();
app.post("/api/runs/:id/comment-preview", (req, res) => {
  const body = commentBody(req.params.id);
  const nonce = randomBytes(24).toString("hex");
  approvals.clear();
  approvals.set(nonce, {
    id: req.params.id,
    hash: createHash("sha256").update(body).digest("hex"),
    expires: Date.now() + 300000,
  });
  res.json({ body, nonce });
});
app.post("/api/runs/:id/comment", async (req, res) => {
  const { nonce, approved } = z
    .object({ nonce: z.string(), approved: z.literal(true) })
    .strict()
    .parse(req.body);
  const a = approvals.get(nonce);
  approvals.delete(nonce);
  const body = commentBody(req.params.id);
  if (
    !a ||
    a.id !== req.params.id ||
    a.expires < Date.now() ||
    a.hash !== createHash("sha256").update(body).digest("hex")
  )
    throw Error("Review the report comment again before posting.");
  const source = getReport(req.params.id).plan.source!;
  res.json(await postComment(source.url, source.sha, body));
});
app.get("/evidence/:id/:file", (req, res) => {
  const id = z.string().uuid().parse(req.params.id);
  const file = z
    .string()
    .regex(/^(desktop|mobile)(-\d{1,2})?\.png$/)
    .parse(req.params.file);
  getReport(id);
  res.sendFile(join(dataDir, id, file), { dotfiles: "allow" });
});
app.post("/mcp", async (req, res) => {
  const server = makeMcp();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on("close", () => {
    void transport.close();
    void server.close();
  });
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
});
app.all("/mcp", (_req, res) => res.status(405).end());
app.use(express.static(resolve("dist"), { etag: false }));
app.get("/", (_req, res) => {
  if (!existsSync(resolve("dist/index.html")))
    return res.status(503).send("Build AsBuilt first: pnpm build");
  res.sendFile(resolve("dist/index.html"));
});
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const message =
      error instanceof z.ZodError
        ? "Some fields are missing or invalid. Review the plan and try again."
        : error instanceof Error
          ? error.message
          : "The request could not be completed.";
    res.status(400).json({ error: message });
  },
);
app.listen(port, "127.0.0.1", () =>
  console.log(
    `AsBuilt is ready at ${origin}\nUnlock with ${process.env.ASBUILT_TOKEN ? "your configured ASBUILT_TOKEN" : `the key in ${tokenPath}`}.\nLocal single-operator mode; do not expose this server publicly.`,
  ),
);
