import test from "node:test";
import assert from "node:assert/strict";
import { setupNeeds, runMinutes, MAX_CHECK_FILES } from "../server/preflight.ts";
import { setupLines, brokenCommentBody } from "../server/pr-comment.ts";
import { applySettings } from "../server/action.ts";

const signIn = { path: "/login", emailLabel: "Email", passwordLabel: "Password", submit: "Sign in", signedInText: "Sign out" };

test("a check that signs in without a test account is a setup step with the exact fix, not a failure", () => {
  const needs = setupNeeds("orders", { signIn }, {});
  assert.equal(needs.length, 1);
  assert.match(needs[0].problem, /doesn't pass a test account/);
  assert.match(needs[0].fix, /gh secret set ASBUILT_TEST_EMAIL/);
  assert.match(needs[0].fix, /never shows on screen or in a chat/);
  assert.deepEqual(setupNeeds("orders", { signIn }, { ASBUILT_TEST_EMAIL: "t@example.com", ASBUILT_TEST_PASSWORD: "x" }), []);
  assert.equal(setupNeeds("orders", { signIn }, { ASBUILT_TEST_EMAIL: "t@example.com", ASBUILT_TEST_PASSWORD: " " }).length, 1, "a blank secret counts as missing");
});

test("a second account and test-site steps each name their own setup step", () => {
  const env = { ASBUILT_TEST_EMAIL: "a", ASBUILT_TEST_PASSWORD: "b" };
  const needs = setupNeeds("pickup", { signIn, secondSignIn: signIn, testActions: { siteMarker: "TEST", approved: ["Add to cart"] } }, env);
  assert.equal(needs.length, 2);
  assert.match(needs[0].fix, /ASBUILT_SECOND_EMAIL/);
  assert.match(needs[1].fix, /allow-test-actions: true/);
  assert.match(needs[1].fix, /#test-site/);
  assert.deepEqual(setupNeeds("pickup", { testActions: {} }, { ASBUILT_ALLOW_TEST_ACTIONS: "true" }), []);
  assert.deepEqual(setupNeeds("home", { criteria: [] }, {}), [], "a look-only check needs nothing");
});

test("setup steps are grouped into one to-do per fix and read as setup, not findings", () => {
  const needs = [
    ...setupNeeds("orders", { signIn }, {}),
    ...setupNeeds("profile", { signIn }, {}),
  ];
  const text = setupLines(needs).join("\n");
  assert.match(text, /Needs setup: 2 checks skipped/);
  assert.match(text, /Nothing is wrong with your app/);
  assert.equal(text.match(/\*\*Fix:\*\*/g)?.length, 1);
  assert.match(text, /`orders`, `profile`/);
  assert.match(brokenCommentBody([], { setup: needs }), /Needs setup/);
  assert.deepEqual(setupLines([]), []);
});

test("bigger apps fit in one run, with time that grows with the number of checks", () => {
  assert.ok(MAX_CHECK_FILES >= 40);
  assert.equal(runMinutes("", 3), 10);
  assert.equal(runMinutes("", 34), 68);
  assert.equal(runMinutes("25", 34), 25, "an explicit limit wins");
  assert.equal(runMinutes("nonsense", 34), 68);
});

test("a standing approval does nothing where the workflow doesn't allow test actions", () => {
  const plan = { environment: "test", execution: "interactive", network: "browser", networkApproved: true, actionsApproved: true, criteria: [] };
  const settings = { testSite: { siteMarker: "TEST SITE", approveAllTestActions: true } } as any;
  const before = process.env.ASBUILT_ALLOW_TEST_ACTIONS;
  try {
    delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
    assert.equal(applySettings(plan, settings).testActions, undefined);
    process.env.ASBUILT_ALLOW_TEST_ACTIONS = "true";
    assert.deepEqual(applySettings(plan, settings).testActions, { siteMarker: "TEST SITE", approved: "all" });
  } finally {
    if (before === undefined) delete process.env.ASBUILT_ALLOW_TEST_ACTIONS;
    else process.env.ASBUILT_ALLOW_TEST_ACTIONS = before;
  }
});

import { productionDeployment, productionNeed, siteCheck } from "../server/preflight.ts";

test("cart and checkout steps are refused on a production deployment, judged from GitHub's event, not the page", () => {
  assert.equal(productionDeployment({ deployment: { environment: "Production" } }), "Production");
  assert.equal(productionDeployment({ deployment: { environment: "Production – ebarrel" } }), "Production – ebarrel");
  assert.equal(productionDeployment({ deployment: { environment: "Preview" } }), undefined);
  assert.equal(productionDeployment({ deployment: { environment: "staging" } }), undefined);
  assert.equal(productionDeployment(undefined), undefined, "no event (a fixed address) relies on the page's marker");
  assert.match(productionNeed("checkout", "Production").problem, /never takes cart, checkout or order steps on a production deployment/);
});

const page = (status: number, headers: Record<string, string>, html = "") => async () => ({ status, headers, body: Buffer.from(html) });

test("pre-flight names a password-protected Vercel preview and how to fix it, before any check runs", async () => {
  const r = await siteCheck("https://app-git-x.vercel.app/", [], {}, page(401, { "x-vercel-id": "iad1::abc", server: "Vercel" }));
  assert.match(r.protected!.problem, /password-protected/);
  assert.match(r.protected!.fix, /gh secret set VERCEL_AUTOMATION_BYPASS_SECRET/);
  assert.equal((await siteCheck("https://app.vercel.app/", [], { ASBUILT_VERCEL_BYPASS_SECRET: "s" }, page(401, { server: "Vercel" }))).protected, undefined, "a configured bypass is trusted");
  assert.equal((await siteCheck("https://example.com/", [], {}, page(403, { server: "cloudflare" }))).protected, undefined, "only Vercel's own protection is treated as setup");
  assert.deepEqual(await siteCheck("https://example.com/", ["TEST"], {}, async () => { throw Error("down"); }), { markerMissing: [] });
});

test("pre-flight warns when the test-site marker isn't in the page, without skipping anything", async () => {
  const html = "<div>TEST SITE &middot; Test data only</div><p>Shop</p>";
  assert.deepEqual((await siteCheck("https://t.example.com/", ["TEST SITE · Test data only", "TEST SITE · Test data only"], {}, page(200, {}, html))).markerMissing, []);
  assert.deepEqual((await siteCheck("https://t.example.com/", ["STAGING"], {}, page(200, {}, html))).markerMissing, ["STAGING"]);
});
