import express from "express";
import { randomUUID, timingSafeEqual } from "node:crypto";
import { Readable } from "node:stream";
import { z } from "zod";
import { get, del } from "@vercel/blob";
import { waitUntil } from "@vercel/functions";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { cloudConfig } from "./config.ts";
import * as defaultStorage from "./database.ts";
import { runCloud } from "./worker.ts";
import { makeMcp } from "../mcp.ts";
import { productService } from "../product-review.ts";
import {
  planSchema,
  validateExecution,
  sampleIntent,
  interactiveSampleCriteria,
  journeySampleCriteria,
  generateCriteria,
  type Report,
} from "../schema.ts";
import { validateTarget } from "../safety.ts";
import { preparePlan, agentConfigured } from "../agent.ts";
import {
  inspectSource,
  listRepositories,
  githubConfigured,
} from "../github.ts";
const equal = (a: string, b: string) =>
  Buffer.byteLength(a) === Buffer.byteLength(b) &&
  timingSafeEqual(Buffer.from(a), Buffer.from(b));
const cookie = (req: express.Request) =>
  String(req.headers.cookie || "")
    .split(";")
    .map((x) => x.trim())
    .find((x) => x.startsWith("__Host-asbuilt="))
    ?.slice(15) || "";
export function createCloudApp(
  deps: {
    storage?: typeof defaultStorage;
    run?: typeof runCloud;
    schedule?: typeof waitUntil;
  } = {},
) {
  const storage = deps.storage || defaultStorage;
  const execute = deps.run || runCloud;
  const schedule = deps.schedule || waitUntil;
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    res.set({
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
    });
    try {
      const c = cloudConfig();
      if (
        req.headers.host !== new URL(c.origin).host ||
        (req.headers.origin && req.headers.origin !== c.origin)
      )
        return res
          .status(403)
          .json({ error: "This request is from an unapproved origin." });
      next();
    } catch {
      return res.status(503).json({
        error:
          "Online setup is incomplete. Follow docs/vercel.md to connect storage and configure the hosted access key.",
      });
    }
  });
  app.post("/api/session", async (req, res) => {
    if (!(await storage.loginAttempt()))
      return res.status(429).json({
        error: "Too many sign-in attempts. Try again in ten minutes.",
      });
    const c = cloudConfig();
    if (!equal(String(req.body?.token || ""), c.token))
      return res
        .status(401)
        .json({ error: "Use your hosted workspace access key." });
    const remember = req.body?.remember === true;
    const session = await storage.issueSession(c.token, remember);
    res.setHeader(
      "Set-Cookie",
      `__Host-asbuilt=${session.value}; Secure; HttpOnly; SameSite=Strict; Path=/${remember ? `; Max-Age=${session.seconds}` : ""}`,
    );
    res.json({ ok: true });
  });
  app.use(async (req, res, next) => {
    const c = cloudConfig();
    const bearer = String(req.headers.authorization || "").replace(
      /^Bearer /,
      "",
    );
    if (
      !equal(bearer, c.token) &&
      !(await storage.validSession(cookie(req), c.token))
    )
      return res
        .status(401)
        .json({ error: "Unlock your hosted workspace to continue." });
    next();
  });
  app.post("/api/logout", async (req, res) => {
    await storage.revoke(cookie(req));
    res.setHeader(
      "Set-Cookie",
      "__Host-asbuilt=; Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
    );
    res.json({ ok: true });
  });
  function status() {
    const c = cloudConfig();
    return {
      scope: "hosted single operator",
      githubConfigured: githubConfigured(),
      agentConfigured: agentConfigured(),
      previewOrigins: c.origins,
      interactivePreviewsEnabled: c.enabled && !!c.snapshot,
      limitations: [
        "Hosted browser runs require an enabled Vercel snapshot and remaining daily budget.",
        "No orders, submissions or credentials.",
        "This private bearer-authenticated service is not a public OAuth connector.",
      ],
    };
  }
  app.get("/api/config", (_req, res) => {
    const c = cloudConfig();
    res.json({
      hosting: "vercel",
      github: githubConfigured(),
      agent: agentConfigured(),
      comments: false,
      origins: c.origins,
      sampleIntent,
      interactiveSampleCriteria,
      journeySampleCriteria,
      interactivePreviews: c.enabled && !!c.snapshot,
      executionEnabled: c.enabled && !!c.snapshot,
      installUrl: null,
    });
  });
  app.get("/api/repositories", async (_req, res) =>
    res.json(await listRepositories()),
  );
  app.post("/api/source", async (req, res) =>
    res.json(await inspectSource(z.string().url().parse(req.body.url))),
  );
  app.post("/api/plan", async (req, res) =>
    res.json(await preparePlan(req.body)),
  );
  async function start(input: unknown) {
    const c = cloudConfig();
    if (!c.enabled || !c.snapshot)
      throw Error(
        "Online browser tests are not enabled yet. Complete the Vercel worker setup first.",
      );
    const plan = planSchema.parse(input);
    validateExecution(plan);
    if (plan.network === "browser")
      throw Error(
        "Normal browser networking is currently local-only. Paid cloud execution has not been enabled.",
      );
    if (plan.target !== "sample") validateTarget(plan.target, c.origins);
    if (plan.source) {
      const actual = await inspectSource(plan.source.url);
      if (
        actual.sha !== plan.source.sha ||
        actual.repository !== plan.source.repository ||
        actual.pr !== plan.source.pr
      )
        throw Error("Source changed. Review it again.");
    }
    const report: Report = {
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      status: "queued",
      mode: plan.target === "sample" ? "sample" : "preview",
      plan,
      results: [],
      blockedRequests: 0,
      limitations: [
        "Fresh isolated browser per check and viewport.",
        "Only approved GET documents and static assets are retrievable; blocked requests prevent verification.",
        "No API-driven behavior, form submission, purchases, passwords or real orders.",
        "Screenshots over 3 MB are not retained; those checks remain Not verified.",
        "Source commit is context, not proof of what is deployed.",
      ],
    };
    await storage.reserve(report, c.dailyLimit);
    schedule(
      execute(report).catch(() => {
        console.error("AsBuilt hosted run could not finalize.");
      }),
    );
    return report;
  }
  app.post("/api/runs", async (req, res) =>
    res.status(202).json(await start(req.body)),
  );
  app.get("/api/runs", async (_req, res) =>
    res.json(await storage.listReports()),
  );
  app.get("/api/runs/:id", async (req, res) =>
    res.json(await storage.getReport(z.string().uuid().parse(req.params.id))),
  );
  app.delete("/api/runs/:id", async (req, res) => {
    z.object({ confirmed: z.literal(true) })
      .strict()
      .parse(req.body);
    const id = z.string().uuid().parse(req.params.id);
    const report = await storage.getReport(id);
    if (["queued", "running"].includes(report.status))
      return res.status(409).json({ error: "Wait for the review to finish." });
    const paths = report.results.flatMap((r) =>
      r.screenshot ? [r.screenshot.slice(1)] : [],
    );
    if (paths.length) await del(paths);
    await storage.remove(id);
    res.json({ deleted: true });
  });
  app.get("/evidence/:id/:file", async (req, res) => {
    const id = z.string().uuid().parse(req.params.id);
    const file = z
      .string()
      .regex(/^(desktop|mobile)-\d{1,2}\.png$/)
      .parse(req.params.file);
    const report = await storage.getReport(id);
    const path = `evidence/${id}/${file}`;
    if (!report.results.some((r) => r.screenshot === `/${path}`))
      return res.sendStatus(404);
    const result = await get(path, { access: "private", useCache: false });
    if (!result || result.statusCode !== 200) return res.sendStatus(404);
    res.type("png");
    Readable.fromWeb(result.stream as any).pipe(res);
  });
  async function dispatch(name: string, args: any) {
    if (name === "establish_product_baseline") return products.establish(args);
    if (name === "get_product_context") return products.context(args.id);
    if (name === "revise_product_baseline") return products.revise(args);
    if (name === "save_product_review") return products.save(args);
    if (name === "list_product_reviews") return products.list();
    if (name === "get_product_review") return products.get(args.id);
    if (name === "run_product_scenario") return products.run(args);
    switch (name) {
      case "get_connection_status":
        return status();
      case "capture_intent": {
        const intent = z.string().min(3).max(5000).parse(args.intent);
        return {
          intent,
          status: "captured",
          criteria: generateCriteria(intent),
          note: "Draft only; not verified.",
        };
      }
      case "generate_criteria":
        return preparePlan(args);
      case "start_verification":
        if (args.source) throw Error("Attach source in the web review.");
        return start(args);
      case "get_report":
        return storage.getReport(z.string().uuid().parse(args.id));
      case "check_verification": {
        const r = await storage.getReport(z.string().uuid().parse(args.id));
        return {
          id: r.id,
          status: r.status,
          resultCount: r.results.length,
          error: r.error,
        };
      }
      default:
        throw Error("Unknown tool.");
    }
  }
  const products = productService(
    storage.productStorage,
    storage.getReport,
    start,
  );
  app.get("/api/products", async (_req, res) =>
    res.json(await products.list()),
  );
  app.post("/api/products", async (req, res) =>
    res.status(201).json(await products.save(req.body)),
  );
  app.post("/api/products/baseline", async (req, res) =>
    res.status(201).json(await products.establish(req.body)),
  );
  app.get("/api/products/:id/context", async (req, res) =>
    res.json(await products.context(req.params.id)),
  );
  app.post("/api/products/:id/revise", async (req, res) =>
    res
      .status(201)
      .json(await products.revise({ ...req.body, parentId: req.params.id })),
  );
  app.get("/api/products/:id", async (req, res) =>
    res.json(await products.get(req.params.id)),
  );
  app.post("/api/products/:id/run", async (req, res) =>
    res
      .status(202)
      .json(await products.run({ ...req.body, id: req.params.id })),
  );
  app.post("/mcp", async (req, res) => {
    if (
      !equal(
        String(req.headers.authorization || ""),
        `Bearer ${cloudConfig().token}`,
      )
    )
      return res.sendStatus(401);
    const server = makeMcp(dispatch);
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
  app.all("/mcp", (_req, res) => res.sendStatus(405));
  app.use((_req, res) => res.status(404).json({ error: "Not found." }));
  app.use(
    (
      error: unknown,
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      const message =
        error instanceof z.ZodError
          ? "Review the fields and try again."
          : error instanceof Error &&
              /^(Online browser|Another verification|Today’s|The report limit|Source changed|Report not found|Wait for|This preview|Use an HTTPS)/.test(
                error.message,
              )
            ? error.message
            : "The online service could not complete this request. Check its setup and logs.";
      res.status(400).json({ error: message });
    },
  );
  return app;
}
export const app = createCloudApp();
export default app;
