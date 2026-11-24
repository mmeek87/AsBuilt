import { observe } from "./observation.mjs";
import { perform } from "./interaction-policy.mjs";
import { journeyFixture } from "./journey-fixture.mjs";

// One browser context per viewport. Checkpoints run in order and retain only this run's state.
export async function runJourney(browser, plan, resource, send) {
  const destinations = plan.criteria.flatMap((c) =>
    (c.actions ?? []).filter((a) => a.type === "navigate").map((a) => a.value),
  );
  for (const viewport of [
    { name: "Desktop", width: 1440, height: 960 },
    { name: "Mobile", width: 390, height: 844 },
  ]) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      javaScriptEnabled: true,
      serviceWorkers: "block",
      acceptDownloads: false,
      permissions: [],
    });
    let index = 0,
      blocked = 0,
      criticalBlocked = 0,
      pageErrors = 0,
      stopped = false;
    const page = await context.newPage();
    const scriptErrorMessages = [];
    page.on("pageerror", (error) => {
      pageErrors++;
      if (scriptErrorMessages.length < 3)
        scriptErrorMessages.push(
          String(error.message)
            .replace(/https?:\/\/[^\s]+/g, "[URL omitted]")
            .slice(0, 300),
        );
    });
    page.on("dialog", (dialog) => void dialog.dismiss());
    context.on("page", (popup) => {
      if (popup !== page) {
        blocked++;
        criticalBlocked++;
        void popup.close();
      }
    });
    await context.routeWebSocket("**/*", (ws) => {
      blocked++;
      criticalBlocked++;
      ws.close();
    });
    await context.route("**/*", async (route) => {
      const req = route.request();
      try {
        if (plan.target === "sample") {
          const url = new URL(req.url());
          if (
            req.method() === "GET" &&
            url.origin === "https://sample.asbuilt.invalid" &&
            ["/", "/store", "/product"].includes(url.pathname) &&
            !url.search
          ) {
            await route.fulfill({
              status: 200,
              contentType: "text/html",
              body: journeyFixture(url.pathname),
            });
            return;
          }
        } else {
          const response = await resource(req, `${viewport.name}-${index}`);
          if (response.allowed) {
            await route.fulfill({
              status: response.status,
              headers: response.headers,
              body: Buffer.from(response.body, "base64"),
            });
            return;
          }
        }
      } catch {}
      blocked++;
      if (!["image", "font"].includes(req.resourceType())) criticalBlocked++;
      await route.abort();
    });
    let initialError = false;
    try {
      const response = await page.goto(
        plan.target === "sample"
          ? "https://sample.asbuilt.invalid/"
          : plan.target,
        { waitUntil: "load", timeout: 25000 },
      );
      initialError = !response || response.status() >= 400;
    } catch {
      initialError = true;
    }
    let previousBlocked = 0;
    try {
      for (index = 0; index < plan.criteria.length; index++) {
        const c = plan.criteria[index],
          actions = [];
        let observation, screenshot;
        if (stopped)
          observation = {
            status: "not_verified",
            observed:
              "Not attempted: an earlier journey checkpoint did not pass. No later actions were performed.",
          };
        else if (initialError)
          observation = {
            status: "not_verified",
            observed: "The initial journey page could not be loaded safely.",
          };
        else {
          try {
            if (c.kind === "manual") observation = await observe(page, c);
            else {
              for (const action of c.actions ?? []) {
                actions.push(
                  `Attempt ${action.type} “${action.name}” (completion not verified).`,
                );
                await perform(page, action, destinations);
                actions[actions.length - 1] =
                  `${action.type} “${action.name}”${action.type === "navigate" ? " to " + action.value : action.type === "click" ? "" : " with “" + action.value + "”"}.`;
              }
              if (c.expectedUrl)
                await page.waitForURL(c.expectedUrl, {
                  waitUntil: "domcontentloaded",
                  timeout: 10000,
                });
              observation = await observe(page, c, { waitMs: 10000 });
              if (c.expectedUrl)
                observation.observed += ` URL checkpoint: ${page.url() === c.expectedUrl ? "matches the reviewed destination" : "does not match the reviewed destination"}.`;
              if (page.url() !== c.expectedUrl && c.expectedUrl)
                observation = {
                  status: "fail",
                  observed: "The URL did not match the reviewed checkpoint.",
                };
            }
          } catch (error) {
            observation = {
              status: "not_verified",
              observed: `Journey action or URL checkpoint could not complete. ${/policy|permitted|ambiguous|reviewed/i.test(error.message ?? "") ? error.message : "No later actions were attempted."}`,
            };
          }
        }
        if (observation.status === "fail" && (criticalBlocked || pageErrors))
          observation = {
            status: "not_verified",
            observed:
              observation.observed +
              " Blocked functional resources or script errors prevent attributing this missing outcome to the app.",
          };
        try {
          screenshot = (
            await page.screenshot({
              fullPage: false,
              animations: "disabled",
              timeout: 10000,
            })
          ).toString("base64");
        } catch {
          observation = {
            status: "not_verified",
            observed: "Checkpoint screenshot evidence is unavailable.",
          };
        }
        if (scriptErrorMessages.length)
          observation.observed +=
            " Script errors: " + scriptErrorMessages.join("; ");
        if (blocked || pageErrors)
          observation.observed += ` Coverage limits: ${blocked} blocked request(s), ${pageErrors} script error(s) so far; this observation does not verify blocked functionality or complete rendering.`;
        send({
          type: "result",
          index,
          viewport: viewport.name,
          ...observation,
          screenshot,
          blocked: blocked - previousBlocked,
          actions,
        });
        previousBlocked = blocked;
        if (observation.status !== "pass") stopped = true;
      }
    } finally {
      await context.close();
    }
  }
}
