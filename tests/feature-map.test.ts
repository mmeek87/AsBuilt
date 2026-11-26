import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { coverage, featureMapSchema } from "../server/feature-map.ts";
import { coverageLines, LIMITS_LINE } from "../server/pr-comment.ts";
import { listPlans, readFeatureMap } from "../server/action.ts";

const map = featureMapSchema.parse({
  app: "Fern & Field",
  features: [
    { id: "checkout-total", name: "Checkout shows the total", check: "checkout", confirmed: true },
    { id: "pay", name: "One clear Pay button", check: "checkout", confirmed: true },
    { id: "emails", name: "Order email", why: "Emails can't be checked in a browser", confirmed: true },
    { id: "referrals", name: "Refer a friend", where: "/buyer/referrals", confirmed: false },
    { id: "signup", name: "Sign up", check: "signup" },
  ],
});

test("a feature counts as checked only when its check file ran", () => {
  const c = coverage(map, new Set(["checkout"]));
  assert.equal(c.total, 5);
  assert.equal(c.checked, 2);
  assert.deepEqual(
    c.unchecked.map((f) => f.name),
    ["Order email", "Refer a friend", "Sign up"],
  );
  assert.equal(c.unchecked.find((f) => f.name === "Sign up")?.why, "check file signup.json didn't run");
  assert.equal(c.unconfirmed, 1);
});

test("coverage renders inertly, flags unconfirmed features, and caps the list", () => {
  const lines = coverageLines(coverage(map, new Set(["checkout"]), "https://github.com/o/r/blob/abc/.asbuilt/features.json")).join("\n");
  assert.match(lines, /\*\*Coverage: 2 of 5 features\*\* in your \[feature map\]\(https:\/\/github\.com\/o\/r\/blob\/abc\/\.asbuilt\/features\.json\) have checks\. Not checked yet:/);
  assert.match(lines, /- `Refer a friend` · _unconfirmed_/);
  assert.match(lines, /1 feature was found in your code but not confirmed/);
  assert.ok(lines.indexOf("Order email") < lines.indexOf("Refer a friend"), "confirmed gaps come first");
  assert.match(lines, /- `Order email` \(`Emails can't be checked in a browser`\)/);
  const big = featureMapSchema.parse({ features: Array.from({ length: 12 }, (_, i) => ({ id: `f${i}`, name: `[x](https://evil.example) @me ${i}` })) });
  const out = coverageLines(coverage(big, new Set())).join("\n");
  assert.match(out, /…and 4 more/);
  assert.ok(!/[^`]\[x\]\(https/.test(out), "names stay inside code spans");
  assert.match(coverageLines(coverage(featureMapSchema.parse({ features: [{ id: "a", name: "A", check: "a" }] }), new Set(["a"]))).join("\n"), /Every feature is checked/);
});

test("the map rejects unknown fields, bad ids and duplicates", () => {
  assert.throws(() => featureMapSchema.parse({ features: [{ id: "a", name: "A", approved: true }] }));
  assert.throws(() => featureMapSchema.parse({ features: [{ id: "../x", name: "A" }] }));
  assert.throws(() => featureMapSchema.parse({ features: [{ id: "a", name: "A" }, { id: "a", name: "B" }] }));
});

test("features.json is never run as a check, and a bad map is reported, not fatal", () => {
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-map-"));
  writeFileSync(join(dir, "checkout.json"), "{}");
  writeFileSync(join(dir, "features.json"), "{ not json");
  assert.deepEqual(listPlans(dir).map((f) => f.split("/").pop()), ["checkout.json"]);
  assert.match(readFeatureMap(dir)?.error ?? "", /isn't valid JSON/);
  writeFileSync(join(dir, "features.json"), JSON.stringify({ features: [{ id: "a", name: "A" }] }));
  assert.equal(readFeatureMap(dir)?.map?.features.length, 1);
  assert.equal(readFeatureMap(join(dir, "checkout.json")), undefined);
});

test("the comment's limits line is one plain sentence with a help link", () => {
  assert.match(LIMITS_LINE, /signs in only with a test account you add/);
  assert.match(LIMITS_LINE, /help\/#limits/);
  assert.ok(!/unsupported/.test(LIMITS_LINE));
});
