import { observe, blocker } from "./observation.mjs";
import { perform } from "./interaction-policy.mjs";
import { journeyFixture } from "./journey-fixture.mjs";
import { signIn } from "./sign-in.mjs";

// One browser context per viewport. Checkpoints run in order and retain only this run's state.
export async function runJourney(
  browser,
  plan,
  resource,
  send,
  credentials,
  cookies = [],
) {
  const destinations = plan.criteria.flatMap((c) =>
    (c.actions ?? [])
      .filter((a) => a.type === "navigate" || (a.type === "menu" && !!a.value))
      .map((a) => a.value),
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
    // Vercel bypass cookie (preview origin only), when provided.
    if (cookies.length) await context.addCookies(cookies);
    let index = 0,
      blocked = 0,
      criticalBlocked = 0,
      pageErrors = 0,
      stopped = false;
    const page = await context.newPage();
    // Status of the document currently shown, so a 5xx page isn't read as a missing feature.
    let documentStatus;
    page.on("response", (response) => {
      if (
        response.request().isNavigationRequest() &&
        response.frame() === page.mainFrame()
      )
        documentStatus = response.status();
    });
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
    if (plan.network !== "browser")
      await context.routeWebSocket("**/*", (ws) => {
        blocked++;
        criticalBlocked++;
        ws.close();
      });
    await context.route("**/*", async (route) => {
      const req = route.request();
      if (plan.network === "browser") {
        const url = new URL(req.url());
        if (
          !["https:", "data:", "blob:"].includes(url.protocol) ||
          (req.isNavigationRequest() &&
            req.frame() === page.mainFrame() &&
            url.origin !== new URL(plan.target).origin)
        ) {
          blocked++;
          criticalBlocked++;
          await route.abort();
        } else await route.continue();
        return;
      }
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
    let signInError = "";
    if (plan.signIn && plan.target !== "sample") {
      const outcome = await signIn(
        page,
        plan.signIn,
        credentials,
        new URL(plan.target).origin,
      ).catch(() => ({
        ok: false,
        reason: "Signing in with the test account didn't complete.",
      }));
      if (!outcome.ok) signInError = outcome.reason;
    }
    try {
      if (signInError) throw Error("sign-in failed");
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
        else if (signInError)
          observation = { status: "not_verified", observed: signInError };
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
                await perform(page, action, destinations, plan.testActions);
                actions[actions.length - 1] =
                  `${action.type} “${action.name}”${action.type === "navigate" ? " to " + action.value : action.type === "click" ? "" : " with “" + action.value + "”"}.`;
              }
              if (c.expectedUrl)
                await page.waitForURL(c.expectedUrl, {
                  waitUntil: "domcontentloaded",
                  timeout: 10000,
                });
              // Look first: if it's already there, don't wait at all.
              // Otherwise wait for the page to go quiet, then allow a short
              // grace period for late rendering. Busy pages (constant
              // polling) keep a long allowance.
              // Absence checks always settle first: "not there yet" isn't "not there".
              if (c.occurrence === "none") {
                await page
                  .waitForLoadState("networkidle", { timeout: 5000 })
                  .catch(() => {});
                await page.waitForTimeout(1500);
                observation = await observe(page, c, { waitMs: 0 });
              } else observation = await observe(page, c, { waitMs: 300 });
              if (observation.status !== "pass" && c.occurrence !== "none") {
                const settled = await page
                  .waitForLoadState("networkidle", { timeout: 5000 })
                  .then(
                    () => true,
                    () => false,
                  );
                observation = await observe(page, c, {
                  waitMs: settled ? 2000 : 8000,
                });
              }
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
        // A visible item that must not be shown is a definite observation;
        // blocked resources can't make something appear.
        if (observation.status === "fail" && c.occurrence !== "none") {
          const reason = await blocker(page, documentStatus);
          if (reason)
            observation = {
              status: "not_verified",
              observed: `${reason} What AsBuilt saw: ${observation.observed}`,
            };
        }
        // An absence "pass" proves nothing if the page errored, was blocked or
        // is a sign-in/HTTP-error page.
        if (observation.status === "pass" && c.occurrence === "none") {
          const reason =
            (await blocker(page, documentStatus)) ||
            (criticalBlocked || pageErrors
              ? "Blocked resources or script errors mean the page may not have finished rendering."
              : "");
          if (reason)
            observation = {
              status: "not_verified",
              observed: `${reason} So "not shown" can't be confirmed. What AsBuilt saw: ${observation.observed}`,
            };
        }
        if (
          observation.status === "fail" &&
          c.occurrence !== "none" &&
          (criticalBlocked || pageErrors)
        )
          observation = {
            status: "not_verified",
            observed:
              observation.observed +
              " Blocked functional resources or script errors prevent attributing this missing outcome to the app.",
          };
        // Busy pages (carousels, late fonts) can stall a capture once; retry.
        const capture = (ms) =>
          page.screenshot({
            fullPage: false,
            animations: "disabled",
            timeout: ms,
            // Never show typed passwords in evidence.
            mask: [page.locator('input[type="password"]')],
          });
        try {
          screenshot = (
            await capture(10000).catch(async () => {
              await page.waitForTimeout(1000);
              return capture(20000);
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
