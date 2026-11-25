import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdirSync, writeFileSync } from "node:fs";
import { observe } from "../server/observation.mjs";
import { criterionSchema } from "../server/schema.ts";

const check = criterionSchema.parse({
  id: "location",
  expected: "Every visible result belongs to Ontario",
  kind: "text",
  value: "Ontario",
  within: { role: "article", name: "", each: true },
});
const card = (place: string, hidden = false) =>
  `<article ${hidden ? "hidden" : ""}><h2>Example shop</h2><p>${place}</p></article>`;
const cases = [
  {
    name: "correct",
    body: card("Ontario") + card("Ontario"),
    expected: "pass",
  },
  {
    name: "mixed-results",
    body: card("Ontario") + card("Quebec"),
    expected: "fail",
  },
  { name: "empty-results", body: "<p>No shops</p>", expected: "fail" },
  {
    name: "hidden-result",
    body: card("Ontario") + card("Quebec", true),
    expected: "pass",
  },
  { name: "outside-text", body: card("Quebec"), expected: "fail" },
];

test("scoped checks reject mixed and empty collections without borrowing outside text", async () => {
  const directory = ".data/scoped-assertions";
  mkdirSync(directory, { recursive: true });
  const results: any[] = [];
  const browser = await chromium.launch({ headless: true });
  try {
    for (const viewport of [
      { width: 1440, height: 960 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      for (const scenario of cases) {
        await page.setContent(
          `<html><title>AsBuilt fictional fixture</title><style>body{font:18px system-ui;padding:24px}article{padding:12px;background:#eef4ef;margin:12px 0}</style><h1>Shops in Ontario</h1><p>Ontario</p>${scenario.body}</html>`,
        );
        const result = await observe(page, check);
        assert.equal(result.status, scenario.expected, scenario.name);
        const image = `${scenario.name}-${viewport.width}.png`;
        await page.screenshot({ path: `${directory}/${image}` });
        results.push({
          scenario: scenario.name,
          viewport: viewport.width,
          ...result,
          image,
        });
      }
      await page.setContent(
        '<main><section aria-label="Pickup"><p>Quebec</p></section><footer>Ontario</footer></main>',
      );
      const scoped = {
        ...check,
        within: { role: "region" as const, name: "Pickup" },
      };
      assert.equal((await observe(page, scoped)).status, "fail");
      assert.equal(
        (await observe(page, scoped, { staticMode: true })).status,
        "not_verified",
      );
      await page.setContent(
        '<section aria-label="Pickup"><p>Ontario</p></section><section aria-label="Pickup"><p>Ontario</p></section>',
      );
      assert.equal(
        (await observe(page, scoped)).status,
        "not_verified",
        "ambiguous single scope must not pass",
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
  writeFileSync(`${directory}/results.json`, JSON.stringify(results, null, 2));
  const escape = (s: unknown) =>
    String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll('"', "&quot;");
  writeFileSync(
    `${directory}/review.html`,
    `<!doctype html><meta charset="utf-8"><title>AsBuilt scoped assertion evidence</title><style>body{font:17px system-ui;max-width:950px;margin:40px auto;padding:20px}img{max-width:100%;border:1px solid #ccc}article{margin:40px 0}</style><h1>AsBuilt scoped assertion evidence</h1><p>Local fictional fixtures — not eBarrel or a live-site report. Generated ${escape(new Date().toISOString())}. Mixed and empty results are intentionally broken: FAIL is the expected detection. Hidden members are explicitly outside coverage.</p>${results.map((r) => `<article><h2>${escape(r.scenario)} · ${r.viewport}px · ${r.status.toUpperCase()}</h2><p>${escape(r.observed)}</p><img alt="Fixture screenshot" src="${r.image}"></article>`).join("")}`,
  );
});

test("scope schema bounds supported roles and rejects arbitrary selectors", () => {
  assert.equal(
    criterionSchema.safeParse({
      ...check,
      within: { role: "article", name: "", selector: "body" },
    }).success,
    false,
  );
  assert.equal(
    criterionSchema.safeParse({
      ...check,
      within: { role: "iframe", name: "" },
    }).success,
    false,
  );
});
