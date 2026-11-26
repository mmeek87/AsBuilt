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

const timeout = 10000;
const onPreview = (page, origin) => {
  try {
    return new URL(page.url()).origin === origin;
  } catch {
    return false;
  }
};

export async function signIn(page, config, credentials, origin) {
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
  if (!onPreview(page, origin)) return away;
  await email.fill(credentials.email, { timeout });
  if (!onPreview(page, origin)) return away;
  await password.fill(credentials.password, { timeout });
  if (!onPreview(page, origin)) return away;
  await Promise.all([
    page.waitForLoadState("load", { timeout: 25000 }).catch(() => {}),
    button.click({ timeout }),
  ]);
  if (config.signedInPath) {
    const proof = new URL(config.signedInPath, origin);
    if (proof.origin !== origin)
      return {
        ok: false,
        reason: "The signed-in check page must be on the preview itself.",
      };
    try {
      await page.goto(proof.href, { waitUntil: "load", timeout: 25000 });
      await page
        .waitForLoadState("networkidle", { timeout: 5000 })
        .catch(() => {});
    } catch {
      return {
        ok: false,
        reason: `After signing in, AsBuilt couldn't open ${config.signedInPath} to confirm it worked.`,
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
      reason: `After signing in, AsBuilt didn't see "${config.signedInText}"${config.signedInPath ? ` on ${config.signedInPath}` : ""}. The test account may be wrong or locked, or sign-in needs a step AsBuilt doesn't support (such as a one-time code or CAPTCHA).`,
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
