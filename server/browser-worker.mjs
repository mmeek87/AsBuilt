import { perform } from "./interaction-policy.mjs";
import { chromium } from "playwright";
import { createInterface } from "node:readline";
import { interactiveHtml } from "./interactive-fixture.mjs";
const input = createInterface({ input: process.stdin, crlfDelay: Infinity });
const pending = new Map();
let seq = 0;
let started = false;
const send = (message) => process.stdout.write(JSON.stringify(message) + "\n");
input.on("line", (line) => {
  try {
    const message = JSON.parse(line);
    if (message.type === "resource") {
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
    });
  });
  return result;
}
async function observe(page, c) {
  if (c.kind === "manual" || !c.value.trim())
    return {
      status: "not_verified",
      observed: "This outcome needs a separate test.",
    };
  const locator =
    c.kind === "text"
      ? page.getByText(c.value, { exact: true })
      : c.kind === "required"
        ? page.getByLabel(c.value, { exact: true })
        : page.getByRole(c.kind, { name: c.value, exact: true });
  try {
    await locator.first().waitFor({ state: "visible", timeout: 3000 });
  } catch {
    return {
      status: "fail",
      observed: `No visible exact match for “${c.value}” after the reviewed actions.`,
    };
  }
  if ((await locator.count()) !== 1)
    return {
      status: "not_verified",
      observed: "Multiple matches make this observation ambiguous.",
    };
  if (c.kind === "required") {
    const required = await locator.evaluate((el) =>
      "required" in el ? el.required : null,
    );
    return {
      status: required === null ? "not_verified" : required ? "pass" : "fail",
      observed:
        required === null
          ? "Custom field validation is not supported."
          : required
            ? "The visible field has native required validation. Submission was not exercised."
            : "The visible field does not have native required validation.",
    };
  }
  return {
    status: "pass",
    observed: `One visible ${c.kind} matches “${c.value}” after the reviewed actions.`,
  };
}
async function run(plan) {
  const browser = await chromium.launch({ headless: true });
  send({ type: "browser", version: browser.version() });
  try {
    for (const viewport of [
      { name: "Desktop", width: 1440, height: 960 },
      { name: "Mobile", width: 390, height: 844 },
    ]) {
      for (let index = 0; index < plan.criteria.length; index++) {
        const c = plan.criteria[index];
        const actions = c.actions || [];
        const context = await browser.newContext({
          viewport: { width: viewport.width, height: viewport.height },
          javaScriptEnabled: true,
          serviceWorkers: "block",
          acceptDownloads: false,
          permissions: [],
        });
        let blocked = 0;
        let pageError = false;
        const log = [];
        await context.routeWebSocket("**/*", (ws) => {
          blocked++;
          ws.close();
        });
        await context.route("**/*", async (route) => {
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
                  body: interactiveHtml,
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
            observation = await observe(page, c);
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
  }
}
