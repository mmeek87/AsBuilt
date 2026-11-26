// Sign in with a dedicated test account before a journey.
//
// The page is untrusted, so this is deliberately narrow:
// - Only on the preview's own origin, at the reviewed path.
// - Only the two reviewed fields (exact accessible labels), and the password
//   field must really be type=password.
// - Only the reviewed button (exact accessible name).
// - Success is observed, not assumed: the reviewed "signed in" text must
//   appear afterwards, still on the preview.
// Credentials arrive over the worker's private channel, are never logged,
// never put into results, and every reason returned here omits them.

import { totp } from "./totp.mjs";

const timeout = 10000;
const onPreview = (page, origin) => {
  try {
    return new URL(page.url()).origin === origin;
  } catch {
    return false;
  }
};

export async function signIn(page, config, credentials, origin) {
  // Hosts whose requests failed while signing in: names only, for a useful
  // explanation when sign-in doesn't stick.
  const failedHosts = new Set();
  const onFailed = (req) => {
    try {
      failedHosts.add(new URL(req.url()).hostname);
    } catch {}
  };
  page.on("requestfailed", onFailed);
  try {
    return await signInSteps(page, config, credentials, origin, failedHosts);
  } finally {
    page.off("requestfailed", onFailed);
  }
}

// Close a consent banner that could cover the page, only if it's showing.
async function dismissBanner(page, config) {
  if (!config.dismiss) return;
  const banner = page
    .getByRole("button", { name: config.dismiss, exact: true })
    .filter({ visible: true });
  if ((await banner.count().catch(() => 0)) === 1) {
    await banner.click({ timeout }).catch(() => {});
    await banner.waitFor({ state: "hidden", timeout: 3000 }).catch(() => {});
  }
}

function where(page, failedHosts) {
  let path = "";
  try {
    path = new URL(page.url()).pathname;
  } catch {}
  const hosts = [...failedHosts].slice(0, 4).join(", ");
  return ` AsBuilt ended up on ${path || "an unknown page"}.${hosts ? ` Requests that failed while signing in: ${hosts}.` : ""}`;
}

async function signInSteps(page, config, credentials, origin, failedHosts) {
  if (!credentials?.email || !credentials?.password)
    return {
      ok: false,
      reason:
        "This plan signs in with a test account, but no test account was provided. Add ASBUILT_TEST_EMAIL and ASBUILT_TEST_PASSWORD as repository secrets.",
    };
  let url;
  try {
    url = new URL(config.path, origin);
  } catch {
    return { ok: false, reason: "The sign-in path isn't a valid page path." };
  }
  if (url.origin !== origin)
    return {
      ok: false,
      reason: "The sign-in page must be on the preview itself.",
    };
  try {
    await page.goto(url.href, { waitUntil: "load", timeout: 25000 });
  } catch {
    return {
      ok: false,
      reason: "The sign-in page didn't load, so AsBuilt couldn't sign in.",
    };
  }
  // Let client-side redirects happen before deciding where we are.
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  if (!onPreview(page, origin))
    return {
      ok: false,
      reason:
        "The sign-in page sent AsBuilt to another site (for example Google or an identity provider). AsBuilt only types a test account into the preview itself, so it stopped. Use email and password sign-in on the preview for test accounts.",
    };
  await dismissBanner(page, config);
  const email = page.getByLabel(config.emailLabel, { exact: true });
  const password = page.getByLabel(config.passwordLabel, { exact: true });
  const button = page.getByRole("button", { name: config.submit, exact: true });
  try {
    await password.first().waitFor({ state: "visible", timeout });
  } catch {}
  const counts = await Promise.all([
    email.count(),
    password.count(),
    button.count(),
  ]);
  if (counts.some((n) => n !== 1))
    return {
      ok: false,
      reason: `AsBuilt couldn't find exactly one "${config.emailLabel}" field, one "${config.passwordLabel}" field and one "${config.submit}" button on the sign-in page, so it didn't type anything. Check the labels in the plan.`,
    };
  if ((await password.getAttribute("type")) !== "password")
    return {
      ok: false,
      reason: `The "${config.passwordLabel}" field isn't a password field, so AsBuilt didn't type the password into it.`,
    };
  // Re-check right before each step: a page can redirect at any moment,
  // and the account must only ever be typed into the preview.
  const away = {
    ok: false,
    reason:
      "The sign-in page sent AsBuilt to another site (for example Google or an identity provider). AsBuilt only types a test account into the preview itself, so it stopped. Use email and password sign-in on the preview for test accounts.",
  };
  // Apps that render on the client can wipe a field typed before the page
  // finishes loading. Type, confirm the value stuck, and retry briefly.
  for (let attempt = 0; ; attempt++) {
    if (!onPreview(page, origin)) return away;
    await email.fill(credentials.email, { timeout });
    if (!onPreview(page, origin)) return away;
    await password.fill(credentials.password, { timeout });
    if (!onPreview(page, origin)) return away;
    await page.waitForTimeout(300);
    const kept =
      (await email.inputValue().catch(() => "")) === credentials.email &&
      (await password.inputValue().catch(() => "")).length ===
        credentials.password.length;
    if (kept) break;
    if (attempt === 2)
      return {
        ok: false,
        reason:
          "The sign-in form kept clearing what AsBuilt typed (the page may still have been loading), so it didn't submit.",
      };
    await page.waitForTimeout(1000);
  }
  await Promise.all([
    page.waitForLoadState("load", { timeout: 25000 }).catch(() => {}),
    button.click({ timeout }),
  ]);
  // Many apps sign in with a background request and only then move on.
  // Wait for the app to leave the sign-in page (or show an error) before
  // checking, or the session cookie may not exist yet.
  // (An error message with text also ends the wait. Empty alert regions,
  // like a framework's route announcer, don't count.)
  const errorShown = page
    .getByRole("alert")
    .filter({ hasText: /\S/, visible: true })
    .first();
  await Promise.race([
    page.waitForURL((u) => u.pathname !== url.pathname, { timeout: 20000 }),
    errorShown.waitFor({ state: "visible", timeout: 20000 }),
  ]).catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  if (
    onPreview(page, origin) &&
    new URL(page.url()).pathname === url.pathname
  ) {
    const said = await errorShown.innerText({ timeout: 1000 }).catch(() => "");
    const message = said.replace(/\s+/g, " ").trim().slice(0, 160);
    if (message && !message.includes(credentials.email))
      return {
        ok: false,
        reason: `Sign-in didn't go through. The site said: “${message}”. Check the test account in your repository secrets.`,
      };
  }
  if (config.codeLabel) {
    const step = await codeStep(page, config, credentials, origin);
    if (!step.ok) return step;
  }
  if (config.signedInPath) {
    const proof = new URL(config.signedInPath, origin);
    if (proof.origin !== origin)
      return {
        ok: false,
        reason: "The signed-in check page must be on the preview itself.",
      };
    try {
      // The app may still be redirecting after sign-in; if that interrupts
      // opening the proof page, let it settle and try once more.
      await page
        .goto(proof.href, { waitUntil: "load", timeout: 25000 })
        .catch(async () => {
          await page
            .waitForLoadState("networkidle", { timeout: 5000 })
            .catch(() => {});
          await page.goto(proof.href, { waitUntil: "load", timeout: 25000 });
        });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
    } catch {
      return {
        ok: false,
        reason: `After signing in, AsBuilt couldn't open ${config.signedInPath} to confirm it worked.${where(page, failedHosts)}`,
      };
    }
  }
  try {
    await page
      .getByText(config.signedInText, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
  } catch {
    return {
      ok: false,
      reason: `After signing in, AsBuilt didn't see "${config.signedInText}"${config.signedInPath ? ` on ${config.signedInPath}` : ""}. The test account may be wrong or locked, or sign-in needs a step AsBuilt doesn't support (such as a one-time code or CAPTCHA).${where(page, failedHosts)}`,
    };
  }
  if (new URL(page.url()).origin !== origin)
    return {
      ok: false,
      reason:
        "After signing in, the browser left the preview, so AsBuilt stopped.",
    };
  return { ok: true };
}

// The authenticator-app step of a two-step sign-in, for test accounts whose
// setup key is a repository secret. Same narrowness as the password step:
// one exactly labeled field and one exactly named button, on the preview.
async function codeStep(page, config, credentials, origin) {
  if (!credentials.totp)
    return {
      ok: false,
      reason:
        "This sign-in asks for an authenticator code, but no setup key was provided. Add the test account's authenticator setup key as the repository secret ASBUILT_TEST_TOTP (or ASBUILT_SECOND_TOTP for the second account).",
    };
  const field = page
    .getByLabel(config.codeLabel, { exact: true })
    .filter({ visible: true });
  const button = page
    .getByRole("button", {
      name: config.codeSubmit ?? config.submit,
      exact: true,
    })
    .filter({ visible: true });
  try {
    await field.first().waitFor({ state: "visible", timeout: 15000 });
  } catch {
    return {
      ok: false,
      reason: `After the password, AsBuilt didn't see a "${config.codeLabel}" field for the authenticator code. Check codeLabel in the check, or whether this account uses two-step sign-in.`,
    };
  }
  if ((await field.count()) !== 1 || (await button.count()) !== 1)
    return {
      ok: false,
      reason: `AsBuilt couldn't find exactly one "${config.codeLabel}" field and one "${config.codeSubmit ?? config.submit}" button for the authenticator code, so it didn't type anything.`,
    };
  if (!onPreview(page, origin))
    return {
      ok: false,
      reason: "The code step isn't on the preview, so AsBuilt stopped.",
    };
  let code;
  try {
    code = totp(credentials.totp);
  } catch {
    return {
      ok: false,
      reason:
        "The authenticator setup key in the repository secret isn't valid. It should be the text key shown when setting up the authenticator (letters A–Z and digits 2–7).",
    };
  }
  const before = new URL(page.url()).pathname;
  await field.fill(code, { timeout });
  if (!onPreview(page, origin))
    return {
      ok: false,
      reason: "The code step left the preview, so AsBuilt stopped.",
    };
  await button.click({ timeout });
  await page
    .waitForURL((u) => u.pathname !== before, { timeout: 20000 })
    .catch(() => {});
  await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
  return { ok: true };
}

/**
 * Is this browser already signed in? Used to reuse one sign-in across checks
 * and viewports in a run, so a test account isn't signed in dozens of times
 * (sites rate-limit that). Observes the same proof as signIn.
 */
export async function alreadySignedIn(page, config, origin) {
  try {
    const proof = new URL(config.signedInPath ?? "/", origin);
    if (proof.origin !== origin) return false;
    await page.goto(proof.href, { waitUntil: "load", timeout: 25000 });
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    if (!onPreview(page, origin)) return false;
    await page
      .getByText(config.signedInText, { exact: false })
      .first()
      .waitFor({ state: "visible", timeout });
    // A reused session starts in a fresh browser, so a consent banner may
    // be back; close it the same way sign-in does.
    await dismissBanner(page, config);
    return onPreview(page, origin);
  } catch {
    return false;
  }
}
