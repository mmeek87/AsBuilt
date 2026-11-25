import { runJourney } from "./journey-worker.mjs";
import { observe } from "./observation.mjs";
import { staticHtml } from "./static-fixture.mjs";
import { perform } from "./interaction-policy.mjs";
import { chromium, firefox, webkit } from "playwright";
import { createTunnelProxy } from "./tunnel-proxy.mjs";
import { createInterface } from "node:readline";
import { interactiveHtml } from "./interactive-fixture.mjs";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Map();
let seq = 0;
let started = false;
let tunnelProxy;
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
input.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.type.startsWith("tunnel-")) {
      tunnelProxy?.receive(message);
    } else if (message.type === "resource") {
      const resolve = pending.get(message.id);
      pending.delete(message.id);
      resolve?.(message);
    } else if (message.type === "start" && !started) {
      started = true;
      void run(message.plan)
        .then(() => process.stdout.write("", () => process.exit(0)))
        .catch(() => {
          send({
            type: "fatal",
            message: "The isolated browser worker could not complete this run.",
          });
          process.stdout.write("", () => process.exit(1));
        });
    }
  } catch {
    process.exit(1);
  }
});
async function resource(request, scope) {
  const id = ++seq;
  const result = await new Promise((resolve) => {
    pending.set(id, resolve);
    send({
      type: "fetch",
      scope,
      id,
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      headers: Object.fromEntries(
        Object.entries(request.headers()).filter(([k]) =>
          [
            "rsc",
            "next-router-state-tree",
            "next-router-prefetch",
            "next-router-segment-prefetch",
            "x-deployment-id",
            "next-url",
          ].includes(k),
        ),
      ),
    });
  });
  return result;
}
async function run(plan) {
  if (plan.network === "browser") tunnelProxy = await createTunnelProxy(send);
  const engine = { chromium, firefox, webkit }[plan.browser ?? "chromium"];
  const browser = await engine.launch({
    headless: true,
    ...(tunnelProxy
      ? { proxy: { server: tunnelProxy.url, bypass: "<-loopback>" } }
      : {}),
  });
  send({
    type: "browser",
    version: browser.version(),
    matchingVersion: 1,
    scopedAssertionsVersion: 1,
    journeyVersion: 1,
    networkVersion: 1,
  });
  try {
    if (plan.journey) {
      await runJourney(browser, plan, resource, send);
      send({ type: "done" });
      return;
    }
    for (const viewport of [
      { name: "Desktop", width: 1440, height: 960 },
      { name: "Mobile", width: 390, height: 844 },
    ]) {
      for (let index = 0; index < plan.criteria.length; index++) {
        const c = plan.criteria[index];
        const actions = c.actions || [];
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          javaScriptEnabled: plan.execution !== "static",
          serviceWorkers: "block",
          acceptDownloads: false,
          permissions: [],
        });
        let blocked = 0;
        let pageError = false;
        const log = [];
        if (plan.network !== "browser")
          await context.routeWebSocket("**/*", (ws) => {
            blocked++;
            ws.close();
          });
        await context.route("**/*", async (route) => {
          if (plan.network === "browser") {
            const req = route.request(),
              url = new URL(req.url());
            if (
              !["https:", "data:", "blob:"].includes(url.protocol) ||
              (req.isNavigationRequest() &&
                req.frame() === req.frame().page().mainFrame() &&
                url.origin !== new URL(plan.target).origin)
            ) {
              blocked++;
              await route.abort();
            } else await route.continue();
            return;
          }
          try {
            const req = route.request();
            if (plan.target === "sample") {
              if (
                req.url() === "https://sample.asbuilt.invalid/" &&
                req.method() === "GET"
              )
                await route.fulfill({
                  status: 200,
                  contentType: "text/html",
                  body:
                    plan.execution === "static" ? staticHtml : interactiveHtml,
                });
              else {
                blocked++;
                await route.abort();
              }
            } else {
              const response = await resource(req, `${viewport.name}-${index}`);
              if (!response.allowed) {
                blocked++;
                await route.abort();
              } else
                await route.fulfill({
                  status: response.status,
                  headers: response.headers,
                  body: Buffer.from(response.body, "base64"),
                });
            }
          } catch {
            blocked++;
            await route.abort();
          }
        });
        const page = await context.newPage();
        page.setDefaultTimeout(3000);
        page.on("pageerror", () => {
          pageError = true;
        });
        page.on("dialog", (dialog) => {
          void dialog.dismiss();
        });
        context.on("page", (p) => {
          if (p !== page) {
            blocked++;
            void p.close();
          }
        });
        let observation;
        let screenshot;
        try {
          const response = await page.goto(
            plan.target === "sample"
              ? "https://sample.asbuilt.invalid/"
              : plan.target,
            { waitUntil: "load", timeout: 20000 },
          );
          if (!response || response.status() >= 400)
            throw Error("The page did not load successfully.");
          if (c.kind === "manual") {
            if (plan.network === "browser") {
              try {
                await page
                  .getByRole("heading")
                  .first()
                  .waitFor({ state: "visible", timeout: 10000 });
              } catch {}
            }
            observation = {
              status: "not_verified",
              observed:
                "This outcome needs a separate test. No actions were attempted.",
            };
          } else {
            for (const action of actions) {
              await perform(page, action);
              log.push(
                `${action.type === "click" ? "Click" : action.type === "fill" ? "Fill" : "Select"} “${action.name}”${action.type === "click" ? "" : ` with “${action.value}”`}.`,
              );
            }
            observation = await observe(page, c, {
              staticMode:
                plan.execution === "static" && plan.target !== "sample",
              waitMs: plan.execution === "static" ? 0 : 3000,
            });
          }
        } catch (error) {
          observation = {
            status: "not_verified",
            observed:
              error.message?.includes("policy") ||
              error.message?.includes("permitted")
                ? error.message
                : "An action or navigation could not complete safely. Subsequent actions were not attempted.",
          };
        }
        try {
          screenshot = (
            await page.screenshot({ fullPage: true, timeout: 5000 })
          ).toString("base64");
        } catch {
          observation = {
            status: "not_verified",
            observed: "Screenshot evidence could not be captured.",
          };
        }
        await context.close();
        if (blocked || pageError)
          observation = {
            status: "not_verified",
            observed: `The page had ${blocked} blocked request(s)${pageError ? " and a script error" : ""}. This result cannot be treated as verified.`,
          };
        send({
          type: "result",
          index,
          viewport: viewport.name,
          ...observation,
          screenshot,
          blocked,
          actions: log,
        });
      }
    }
    send({ type: "done" });
  } finally {
    await browser.close();
    tunnelProxy?.close();
  }
}
