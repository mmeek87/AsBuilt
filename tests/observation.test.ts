import test from "node:test";
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { observe } from "../server/observation.mjs";
import {
  criterionSchema,
  type Criterion,
  type Report,
} from "../server/schema.ts";
import { recordBlockedResource } from "../server/resource-evidence.ts";

const fixture = `<!doctype html><html><body>
<div role="status">TEST SITE · Test database and test payments only</div>
<p style="text-transform:uppercase">Shop for family back home</p>
<h2>You shop online. They pick up at a store nearby.</h2>
<a href="/products">Start shopping</a>
<button>🇩🇴Dominican Republic</button><button>🇯🇲Jamaica</button>
<footer><button>🇩🇴Dominican Republic</button><button>🇯🇲Jamaica</button></footer>
<span hidden>Start shopping</span>
<label>Email<input required></label><label>Email<input></label>
<script type="application/json">{ "serverData": true }</script>
</body></html>`;
const check = (
  kind: Criterion["kind"],
  value: string,
  extra: Partial<Criterion> = {},
): Criterion => ({
  id: "fixture",
  expected: "Visible content",
  kind,
  value,
  ...extra,
});

test("real browser: banners, flags, duplicate labels and semantic roles in static and JS modes", async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const javaScriptEnabled of [false, true]) {
      const context = await browser.newContext({ javaScriptEnabled });
      const page = await context.newPage();
      await page.setContent(fixture);
      const options = { staticMode: !javaScriptEnabled };
      const banner = await observe(page, check("text", "TEST SITE"), options);
      assert.equal(banner.status, "not_verified");
      assert.match(banner.observed, /No visible exact/);
      assert.doesNotMatch(banner.observed, /client-rendered/);
      assert.equal(
        (
          await observe(
            page,
            check("text", "TEST SITE", { match: "contains" }),
            options,
          )
        ).status,
        "pass",
      );
      assert.equal(
        (
          await observe(
            page,
            check("heading", "Shop for family back home"),
            options,
          )
        ).status,
        "not_verified",
      );
      assert.match(
        (await observe(page, check("button", "Start shopping"), options))
          .observed,
        /matching link role/,
      );
      assert.equal(
        (await observe(page, check("link", "Start shopping"), options)).status,
        "pass",
      );
      assert.equal(
        (await observe(page, check("text", "Start shopping"), options)).status,
        "pass",
        "hidden copies do not create ambiguity",
      );
      for (const country of ["Dominican Republic", "Jamaica"]) {
        assert.equal(
          (
            await observe(
              page,
              check("text", country, { match: "contains" }),
              options,
            )
          ).status,
          "not_verified",
        );
        assert.equal(
          (
            await observe(
              page,
              check("text", country, {
                match: "contains",
                occurrence: "at_least_one",
              }),
              options,
            )
          ).status,
          "pass",
        );
      }
      assert.equal(
        (await observe(page, check("required", "Email"), options)).status,
        "not_verified",
      );
      assert.equal(
        (
          await observe(
            page,
            check("required", "Email", { occurrence: "at_least_one" }),
            options,
          )
        ).status,
        "pass",
      );
      assert.equal(
        (
          await observe(
            page,
            check("text", "Does not exist", {
              match: "contains",
              occurrence: "at_least_one",
            }),
            options,
          )
        ).status,
        javaScriptEnabled ? "fail" : "not_verified",
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
});

test("matching schema preserves old plans and rejects unsupported settings", () => {
  assert.ok(criterionSchema.safeParse(check("text", "Hello")).success);
  assert.ok(
    criterionSchema.safeParse(
      check("link", "Shop", { match: "contains", occurrence: "at_least_one" }),
    ).success,
  );
  assert.equal(
    criterionSchema.safeParse({ ...check("text", "Hello"), match: "regex" })
      .success,
    false,
  );
});

test("blocked resource evidence aggregates origins without retaining URL secrets", () => {
  const report = { blockedRequests: 0 } as Report;
  recordBlockedResource(
    report,
    "https://user:password@images.example/private-token/file.png?key=secret#fragment",
    "image",
    "network policy",
  );
  recordBlockedResource(
    report,
    "https://images.example/another-secret.png",
    "image",
    "network policy",
  );
  assert.deepEqual(report.blockedResources, [
    {
      origin: "https://images.example",
      resourceType: "image",
      reason: "network policy",
      count: 2,
    },
  ]);
  for (let n = 0; n < 50; n++)
    recordBlockedResource(
      report,
      `https://host${n}.example/secret`,
      "image",
      "network policy",
    );
  assert.equal(report.blockedResources?.length, 40);
  assert.doesNotMatch(
    JSON.stringify(report),
    /password|private-token|key=|secret|fragment/,
  );
});

test("sign-in walls and HTTP errors make a missing outcome Not verified, never a defect", async () => {
  const { blocker } = await import("../server/observation.mjs");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(
      '<h1>Sign in</h1><label>Password<input type="password"></label>',
    );
    assert.match(await blocker(page), /asks for a password/);
    await page.setContent(
      '<h1>Notebook</h1><input type="password" style="display:none">',
    );
    assert.equal(
      await blocker(page),
      "",
      "hidden password fields are not a wall",
    );
    assert.match(await blocker(page, 503), /HTTP 503/);
    // An ordinary missing outcome on a working page stays a real failure.
    await page.setContent("<h1>Notebook</h1><p>Sold by Pine Depot</p>");
    assert.equal(await blocker(page, 200), "");
  } finally {
    await browser.close();
  }
});

test('"must not be visible" fails when shown, passes only when really absent, never from a static page', async () => {
  const { observe } = await import("../server/observation.mjs");
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    const nav = {
      id: "nav",
      expected: "Account menu is hidden",
      kind: "link",
      value: "Referrals",
      occurrence: "none",
    } as const;
    await page.setContent(
      '<nav><a href="/r">Referrals</a></nav><h1>Sign in</h1>',
    );
    const shown = await observe(page, nav as any, {});
    assert.equal(shown.status, "fail");
    assert.match(shown.observed, /should not be shown/);
    await page.setContent(
      '<a href="/r" style="display:none">Referrals</a><h1>Sign in</h1>',
    );
    assert.equal(
      (await observe(page, nav as any, {})).status,
      "pass",
      "hidden counts as not shown",
    );
    await page.setContent("<h1>Sign in</h1>");
    assert.equal((await observe(page, nav as any, {})).status, "pass");
    assert.equal(
      (await observe(page, nav as any, { staticMode: true })).status,
      "not_verified",
    );
  } finally {
    await browser.close();
  }
});

test("a failure says what the page was doing: still busy, and the closest wording it did see", async () => {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(`<main><h1>Verify a pickup</h1><form><input aria-label="Pickup code"><button disabled>Verifying...</button></form><h2>Recent pickups</h2></main>`);
    const stuck = await observe(page, { id: "ok", expected: "Pickup verified", kind: "text", value: "Pickup Verified!" } as any);
    assert.equal(stuck.status, "fail", "context never turns a failure into a pass or a Not verified");
    assert.match(stuck.observed, /still looked busy: button “Verifying\.\.\.” was disabled; “Verifying\.\.\.” was showing/);

    await page.setContent(`<main><h1>Stores in the Dominican Republic</h1><h2>Shop by store type</h2></main>`);
    const reworded = await observe(page, { id: "h", expected: "Stores page", kind: "heading", value: "Stores in Dominican Republic" } as any);
    assert.equal(reworded.status, "fail");
    assert.match(reworded.observed, /Closest visible heading: “Stores in the Dominican Republic”/);
    assert.doesNotMatch(reworded.observed, /busy/);

    await page.setContent(`<header><span>Sending to</span><span>no region</span><p>Sending to no region</p></header><main><p>Nothing related</p></main>`);
    const plain = await observe(page, { id: "x", expected: "x", kind: "heading", value: "Order total" } as any);
    assert.doesNotMatch(plain.observed, /Closest|busy/, "no context when nothing relevant is on the page");
  } finally {
    await browser.close();
  }
});
