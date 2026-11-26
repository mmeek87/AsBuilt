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
