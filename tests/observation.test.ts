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
