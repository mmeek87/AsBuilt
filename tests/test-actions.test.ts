import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { perform } from "../server/interaction-policy.mjs";
import { planSchema, validateExecution } from "../server/schema.ts";

const shop = (banner: boolean) =>
  `<!doctype html>${banner ? "<p>TEST SITE · Test database and test payments only</p>" : ""}
  <button onclick="document.body.insertAdjacentHTML('beforeend','<p>Added to cart</p>')">Add to cart</button>
  <form onsubmit="event.preventDefault();document.body.insertAdjacentHTML('beforeend','<p>Payment page</p>')"><button>Continue to payment</button></form>`;
const testActions = { siteMarker: "TEST SITE", approved: ["Add to cart", "Continue to payment"] };
const click = (name: string) => ({ type: "click" as const, name, value: "" });

test("cart and checkout steps stay blocked unless approved as test actions", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(shop(true));
    await assert.rejects(perform(page, click("Add to cart")), /user can approve it as a test action/);
    await assert.rejects(
      perform(page, click("Add to cart"), [], { siteMarker: "TEST SITE", approved: ["Something else"] }),
      /outside the allowed interaction policy/,
    );
  } finally {
    await browser.close();
  }
});

test("approved test actions run, including a form's submit button, only while the test-site marker shows", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(shop(true));
    await perform(page, click("Add to cart"), [], testActions);
    await perform(page, click("Continue to payment"), [], testActions);
    assert.equal(await page.getByText("Added to cart").count(), 1);
    assert.equal(await page.getByText("Payment page").count(), 1);

    await page.setContent(shop(false));
    await assert.rejects(perform(page, click("Add to cart"), [], testActions), /doesn't show the test-site marker/);
    assert.equal(await page.getByText("Added to cart").count(), 0, "nothing was clicked");
  } finally {
    await browser.close();
  }
});

const plan = (extra: Record<string, unknown> = {}) =>
  planSchema.parse({
    intent: "Shoppers can check out",
    target: "https://test.example.com/",
    approved: true,
    execution: "interactive",
    actionsApproved: true,
    journey: true,
    environment: "test",
    network: "browser",
    networkApproved: true,
    testActions,
    criteria: [
      { id: "add", expected: "Added", kind: "text", value: "Added to cart", actions: [click("Add to cart")] },
      {
        id: "checkout",
        expected: "Checkout opens",
        kind: "heading",
        value: "Checkout",
        expectedUrl: "https://test.example.com/checkout",
        actions: [click("Continue to payment")],
      },
    ],
    ...extra,
  });

test("test actions need the workflow switch, a test environment and approvals that match real steps", () => {
  const before = process.env.ASBUILT_ALLOW_TEST_ACTIONS;
  try {
    delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
    assert.throws(() => validateExecution(plan()), /allow-test-actions: true/);
    process.env.ASBUILT_ALLOW_TEST_ACTIONS = "true";
    assert.doesNotThrow(() => validateExecution(plan()), "checkout URLs are allowed with test actions");
    assert.throws(() => validateExecution(plan({ environment: "production" })), /[Pp]roduction|only on a test site/);
    assert.throws(() => validateExecution(plan({ network: "restricted", networkApproved: undefined })), /only on a test site/);
    assert.throws(() => validateExecution(plan({ testActions: { siteMarker: "TEST SITE", approved: ["Pay now"] } })), /isn't used by any step/);
    assert.throws(() => validateExecution(plan({ testActions: { siteMarker: "TEST SITE", approved: ["Sign in"] } })), /can't be a test action/);
    assert.throws(() => planSchema.parse({ ...plan(), testActions: { siteMarker: "TEST", approved: ["Add to cart"] } }), "marker must be specific");
    const { testActions: _t, ...without } = plan();
    assert.throws(() => validateExecution(planSchema.parse(without)), /sensitive operations/, "checkout URLs stay blocked without test actions");
  } finally {
    if (before === undefined) delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
    else process.env.ASBUILT_ALLOW_TEST_ACTIONS = before;
  }
});

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { applySettings, listPlans, readSettings } from "../server/action.ts";

test("a standing test-site approval covers every step except sign-in, only for test-site checks", async () => {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-settings-"));
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ testSite: { siteMarker: "TEST SITE", approveAllTestActions: true } }));
  writeFileSync(join(dir, "checkout.json"), "{}");
  assert.deepEqual(listPlans(dir).map((f) => f.split("/").pop()), ["checkout.json"], "settings.json is never run as a check");
  const settings = readSettings(dir);
  const { testActions: _t, ...base } = plan();
  const applied = applySettings(base, settings);
  assert.deepEqual(applied.testActions, { siteMarker: "TEST SITE", approved: "all" });
  assert.equal(applySettings({ ...base, environment: "production" }, settings).testActions, undefined);
  assert.equal(applySettings({ ...base, network: "restricted" }, settings).testActions, undefined);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(shop(true) + "<button>Sign in</button>");
    await perform(page, click("Add to cart"), [], applied.testActions);
    assert.equal(await page.getByText("Added to cart").count(), 1);
    await assert.rejects(perform(page, click("Sign in"), [], applied.testActions), /outside the allowed interaction policy/);
    await page.setContent(shop(false));
    await assert.rejects(perform(page, click("Add to cart"), [], applied.testActions), /test-site marker/);
  } finally {
    await browser.close();
  }
  writeFileSync(join(dir, "settings.json"), JSON.stringify({ testSite: { siteMarker: "TEST SITE", approveAllTestActions: false } }));
  assert.throws(() => readSettings(dir), /expected format/);
});

test("pays with Stripe's public test card inside Stripe's frame, only when approved and on the test site", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    let posted = "";
    await page.route("https://shop.asbuilt.invalid/**", (route) =>
      route.fulfill({
        contentType: "text/html",
        body: new URL(route.request().url()).pathname === "/success"
          ? "<p>TEST SITE</p><h1>Thank you</h1>"
          : `<p>TEST SITE · test payments only</p><h1>Checkout</h1><iframe src="https://js.stripe.com/v3/fake" style="width:400px;height:300px"></iframe>`,
      }),
    );
    await page.route("https://js.stripe.com/**", (route) => {
      if (route.request().method() === "POST") {
        posted = route.request().postData() ?? "";
        return route.fulfill({ contentType: "text/html", body: "<script>top.location='https://shop.asbuilt.invalid/success'</script>" });
      }
      return route.fulfill({
        contentType: "text/html",
        body: `<form method="post" action="https://js.stripe.com/pay">
          <input id="cardNumber" name="n"><input id="cardExpiry" name="e"><input id="cardCvc" name="c"><input id="billingName" name="name">
          <button type="submit">Pay</button></form>`,
      });
    });
    await page.goto("https://shop.asbuilt.invalid/checkout");
    const pay = { type: "testPayment" as const, name: "Pay with the Stripe test card", value: "" };
    await assert.rejects(perform(page, pay), /allowed interaction policy/);
    await assert.rejects(perform(page, pay, [], { siteMarker: "TEST SITE", approved: ["Something else"] }), /allowed interaction policy/);
    assert.equal(posted, "", "nothing was paid without approval");
    await perform(page, pay, [], { siteMarker: "TEST SITE", approved: ["Pay with the Stripe test card"] });
    await page.waitForURL("https://shop.asbuilt.invalid/success");
    const form = new URLSearchParams(posted);
    assert.equal(form.get("n"), "4242424242424242");
    assert.equal(form.get("c"), "123");
    assert.equal(form.get("name"), "AsBuilt Test");
  } finally {
    await browser.close();
  }
});

test("a test payment never takes card details from the check", () => {
  process.env.ASBUILT_ALLOW_TEST_ACTIONS = "true";
  try {
    const p = (value: string) =>
      plan({
        testActions: { siteMarker: "TEST SITE", approved: ["Add to cart", "Continue to payment", "Pay with the Stripe test card"] },
        criteria: [
          ...plan().criteria,
          { id: "pay", expected: "Paid", kind: "heading", value: "Thank you", actions: [{ type: "testPayment", name: "Pay with the Stripe test card", value }] },
        ],
      });
    assert.doesNotThrow(() => validateExecution(p("")));
    assert.throws(() => validateExecution(p("5555555555554444")), /never takes card details/);
  } finally {
    delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
  }
});

test("opens the newest matching link under a reviewed address, never elsewhere", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.route("https://shop.asbuilt.invalid/**", (route) => {
      const path = new URL(route.request().url()).pathname;
      return route.fulfill({
        contentType: "text/html",
        body: path === "/merchant/orders"
          ? `<a href="https://evil.invalid/merchant/orders/x">Order for E2E Recipient</a><a href="/merchant/orders/abc-123">Order for E2E Recipient</a><a href="/merchant/orders/old-1">Order for E2E Recipient</a>`
          : `<h1>Order ${path.split("/").pop()}</h1>`,
      });
    });
    await page.goto("https://shop.asbuilt.invalid/merchant/orders");
    const open = { type: "navigate" as const, name: "E2E Recipient", match: "contains" as const, value: "https://shop.asbuilt.invalid/merchant/orders/*" };
    await assert.rejects(perform(page, open, []), /outside the reviewed policy/);
    await perform(page, open, [open.value]);
    assert.equal(new URL(page.url()).pathname, "/merchant/orders/abc-123", "first link under the reviewed address, not the off-site one");
    await perform(page, { type: "reload", name: "page", value: "" });
    assert.equal(await page.getByRole("heading", { name: "Order abc-123" }).count(), 1);
  } finally {
    await browser.close();
  }
});

test("a second account and newest-link opening need test actions and a secondSignIn", () => {
  process.env.ASBUILT_ALLOW_TEST_ACTIONS = "true";
  try {
    const signIn = { path: "/login", emailLabel: "Email", passwordLabel: "Password", submit: "Sign in", signedInText: "Sign out" };
    const store = { id: "store", expected: "Store sees it", kind: "heading" as const, value: "Order", as: "second" as const };
    assert.throws(() => validateExecution(plan({ signIn, criteria: [...plan().criteria, store] })), /need a secondSignIn/);
    assert.doesNotThrow(() => validateExecution(plan({ signIn, secondSignIn: signIn, criteria: [...plan().criteria, store] })));
    const { testActions: _t, ...noTest } = plan({ signIn, secondSignIn: signIn });
    assert.throws(() => validateExecution(planSchema.parse(noTest)), /test-site features/);
  } finally {
    delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
  }
});
