import test from "node:test";
import assert from "node:assert/strict";
import { chromium, type Page } from "playwright";
import { signIn } from "../server/sign-in.mjs";
import { validateExecution, planSchema } from "../server/schema.ts";

const origin = "https://shop.asbuilt.invalid";
const config = {
  path: "/login",
  emailLabel: "Email",
  passwordLabel: "Password",
  submit: "Sign in",
  signedInText: "Sign out",
};
const account = { email: "buyer@test.example", password: "Correct-Horse-9" };
const form = (extra = "", passwordType = "password") =>
  `<!doctype html><title>Sign in</title><form method="post" action="/session"><label>Email <input name="email" type="email"></label><label>Password <input name="password" type="${passwordType}"></label>${extra}<button>Sign in</button></form>`;

async function shop(
  page: Page,
  login: string,
  onPost?: (body: string) => void,
) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    if (url.pathname === "/login")
      return route.fulfill({ contentType: "text/html", body: login });
    if (url.pathname === "/session" && route.request().method() === "POST") {
      const body = route.request().postData() ?? "";
      onPost?.(body);
      const ok = body.includes(encodeURIComponent(account.password));
      return route.fulfill({
        contentType: "text/html",
        body: ok
          ? "<h1>Your orders</h1><button>Sign out</button>"
          : form("<p>Wrong email or password.</p>"),
      });
    }
    if (url.pathname === "/account")
      return route.fulfill({
        contentType: "text/html",
        body: "<h1>Your orders</h1><button>Sign out</button>",
      });
    return route.fulfill({ contentType: "text/html", body: login });
  });
}

test("signs in with the test account on the preview and confirms it by observation", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let posted = "";
    await shop(page, form(), (b) => (posted = b));
    const outcome = await signIn(page, config, account, origin);
    assert.deepEqual(outcome, { ok: true });
    assert.match(posted, /buyer%40test\.example/);
    assert.equal(
      new URL(page.url()).origin,
      origin,
      "still on the preview after signing in",
    );
  } finally {
    await browser.close();
  }
});

test("confirms sign-in on a separate proof page when the header hides it (e.g. on mobile)", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.pathname === "/login")
        return route.fulfill({ contentType: "text/html", body: form() });
      if (url.pathname === "/session")
        return route.fulfill({
          contentType: "text/html",
          body: '<header><span style="display:none">Hi, Buyer</span></header><h1>Home</h1>',
        });
      if (url.pathname === "/buyer/orders")
        return route.fulfill({
          contentType: "text/html",
          body: "<h1>Your pickups</h1>",
        });
      return route.fulfill({ contentType: "text/html", body: "<h1>Home</h1>" });
    });
    const withProof = {
      ...config,
      signedInText: "Your pickups",
      signedInPath: "/buyer/orders",
    };
    assert.deepEqual(await signIn(page, withProof, account, origin), {
      ok: true,
    });
    const hiddenOnly = { ...config, signedInText: "Hi, Buyer" };
    const outcome = await signIn(page, hiddenOnly, account, origin);
    assert.equal(outcome.ok, false, "hidden text is never accepted as proof");
  } finally {
    await browser.close();
  }
});

test("closes a consent banner that covers the form, and refuses action-like dismiss names", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({
      viewport: { width: 390, height: 500 },
    });
    const banner =
      '<div id="b" style="position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.6)"><button onclick="document.getElementById(\'b\').remove()">Essential Only</button></div>';
    await shop(page, form(banner));
    const outcome = await signIn(
      page,
      { ...config, dismiss: "Essential Only" },
      account,
      origin,
    );
    assert.deepEqual(outcome, { ok: true });
  } finally {
    await browser.close();
  }
  for (const bad of ["Place order", "Pay now", "Delete account", "Submit"])
    assert.throws(
      () =>
        planSchema.parse({
          intent: "x",
          target: "https://shop.example.com/",
          approved: true,
          criteria: [{ id: "a", expected: "a", kind: "text", value: "a" }],
          signIn: { ...config, dismiss: bad },
        }),
      /banner/,
      bad,
    );
});

test("sign-in failures are explained, never passed, and never echo the account", async () => {
  const browser = await chromium.launch();
  try {
    const cases: [string, string, typeof account | undefined, RegExp][] = [
      [
        "wrong password",
        form(),
        { ...account, password: "Wrong-Pass-77" },
        /didn't see "Sign out"/,
      ],
      [
        "fake password field",
        form("", "text"),
        account,
        /isn't a password field/,
      ],
      [
        "ambiguous form",
        form('<label>Email <input type="email"></label>'),
        account,
        /exactly one "Email" field/,
      ],
      ["no account configured", form(), undefined, /ASBUILT_TEST_EMAIL/],
    ];
    for (const [label, html, creds, reason] of cases) {
      const page = await browser.newPage();
      await shop(page, html);
      const outcome = await signIn(page, config, creds, origin);
      assert.equal(outcome.ok, false, label);
      assert.match(outcome.reason, reason, label);
      assert.ok(
        !/Correct-Horse-9|Wrong-Pass-77|buyer@test\.example/.test(
          outcome.reason,
        ),
        `${label}: no secrets in reasons`,
      );
      await page.close();
    }
  } finally {
    await browser.close();
  }
});

test("never types the account into another site, such as an outside identity provider", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let typedElsewhere = false;
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      // Loads on the preview, then redirects with JavaScript: the harder case.
      if (url.origin === origin)
        return route.fulfill({
          contentType: "text/html",
          body: form(
            '<script>setTimeout(() => location.href = "https://idp.evil.invalid/authorize", 300)</script>',
          ),
        });
      if (route.request().method() === "POST") typedElsewhere = true;
      return route.fulfill({ contentType: "text/html", body: form() });
    });
    const outcome = await signIn(page, config, account, origin);
    assert.equal(outcome.ok, false);
    assert.match(outcome.reason, /another site/);
    assert.equal(typedElsewhere, false);
    assert.equal(new URL(page.url()).origin, "https://idp.evil.invalid");
    assert.equal(
      await page.locator('input[type="password"]').inputValue(),
      "",
      "nothing was typed on the other site",
    );
  } finally {
    await browser.close();
  }
});

test("sign-in plans require a test environment, a journey and approved browser networking", () => {
  const base = {
    intent: "Buyers can see their orders.",
    target: "https://shop.example.com/account",
    approved: true,
    execution: "interactive",
    journey: true,
    criteria: [
      {
        id: "orders",
        expected: "Orders are listed",
        kind: "heading",
        value: "Your orders",
      },
    ],
    signIn: config,
  };
  assert.throws(
    () => validateExecution(planSchema.parse(base)),
    /test environment/,
  );
  const approved = {
    network: "browser",
    networkApproved: true,
    environment: "test",
    actionsApproved: true,
  };
  const ok = planSchema.parse({ ...base, ...approved });
  assert.doesNotThrow(() => validateExecution(ok));
  assert.throws(() =>
    validateExecution(
      planSchema.parse({ ...base, ...approved, environment: "production" }),
    ),
  );
  assert.throws(
    () => planSchema.parse({ ...base, signIn: { ...config, password: "x" } }),
    "credentials can't be in a plan",
  );
  assert.throws(() =>
    planSchema.parse({
      ...base,
      signIn: { ...config, path: "https://evil.example/login" },
    }),
  );
});
