import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
const token = "asbuilt-test-token-not-a-production-secret-123";
test("auth, origin and approval boundaries", async ({ request }) => {
  expect((await request.get("/api/config")).status()).toBe(401);
  expect(
    (await request.post("/api/session", { data: { token: "wrong" } })).status(),
  ).toBe(401);
  expect(
    (
      await request.post("/api/session", {
        data: { token },
        headers: { Origin: "https://evil.test" },
      })
    ).status(),
  ).toBe(403);
  expect(
    (
      await request.get("/api/config", {
        headers: { Authorization: `Bearer ${token}` },
      })
    ).status(),
  ).toBe(200);
  expect(
    (
      await request.post("/api/runs", {
        headers: { Authorization: `Bearer ${token}` },
        data: {
          intent: "Show hello",
          target: "sample",
          approved: false,
          criteria: [
            { id: "1", expected: "Show hello", kind: "text", value: "hello" },
          ],
        },
      })
    ).status(),
  ).toBe(400);
});
test("guided sample delivers actual pass, fail and not-verified evidence with accessible responsive UI", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page.getByRole("heading", { name: "New review" })).toBeVisible();
  await page.getByRole("button", { name: "Use an example" }).click();
  await expect(page.locator("body")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/asbuilt-desktop.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/asbuilt-mobile.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Create review plan" }).click();
  await expect(
    page.getByRole("heading", { name: "Review your checks" }),
  ).toBeVisible();
  await expect(page.getByText("Guided draft · no AI analysis")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Run reviewed checks" }),
  ).toBeDisabled();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.getByLabel("I’ve reviewed these checks", { exact: false }).check();
  await page.getByRole("button", { name: "Run reviewed checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Verification report" }),
  ).toBeVisible({ timeout: 45000 });
  const response = await page.request.get("/api/runs");
  const runs = await response.json();
  const report = await (
    await page.request.get(`/api/runs/${runs[0].id}`)
  ).json();
  expect(report.mode).toBe("sample");
  expect(report.results.filter((x: any) => x.status === "pass")).toHaveLength(
    6,
  );
  expect(report.results.filter((x: any) => x.status === "fail")).toHaveLength(
    2,
  );
  expect(
    report.results.filter((x: any) => x.status === "not_verified"),
  ).toHaveLength(2);
  expect(report.browserVersion).toBeTruthy();
  for (const r of report.results)
    expect((await page.request.get(r.screenshot)).status()).toBe(200);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/asbuilt-report-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: "test-results/asbuilt-report-desktop.png",
    fullPage: true,
  });
  await page.reload();
  await page.getByRole("button", { name: /Past reviews/ }).click();
  await expect(
    page.getByRole("heading", { name: "Past reviews" }),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page
    .getByRole("button", { name: /Sample verification/ })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Verification report" }),
  ).toBeVisible();
});
test("MCP initializes, exposes shared tools and returns honest drafts", async () => {
  const client = new Client({ name: "asbuilt-test", version: "1.0" });
  await client.connect(
    new StreamableHTTPClientTransport(new URL("http://127.0.0.1:4320/mcp"), {
      requestInit: { headers: { Authorization: `Bearer ${token}` } },
    }),
  );
  const tools = await client.listTools();
  expect(tools.tools.map((t) => t.name).sort()).toEqual([
    "capture_intent",
    "check_verification",
    "establish_product_baseline",
    "generate_criteria",
    "get_connection_status",
    "get_product_context",
    "get_product_review",
    "get_report",
    "list_product_reviews",
    "revise_product_baseline",
    "run_product_scenario",
    "save_product_review",
    "start_verification",
  ]);
  const byName = Object.fromEntries(tools.tools.map((t) => [t.name, t]));
  // Read tools are marked read-only; nothing is destructive; only runs reach the web.
  for (const name of [
    "get_product_context",
    "get_product_review",
    "list_product_reviews",
  ])
    expect(byName[name].annotations?.readOnlyHint).toBe(true);
  for (const t of tools.tools)
    expect(t.annotations?.destructiveHint).toBe(false);
  expect(byName.run_product_scenario.annotations?.openWorldHint).toBe(true);
  // Approval is a required literal true, never optional or defaulted.
  expect(byName.run_product_scenario.inputSchema.required).toContain(
    "approved",
  );
  const r = await client.callTool({
    name: "generate_criteria",
    arguments: { intent: 'Show a heading called "Welcome".' },
  });
  const parsed = JSON.parse((r.content as any)[0].text);
  expect(parsed.mode).toBe("guided");
  expect(parsed.verificationStatus).toBe("not_run");
  const run = await client.callTool({
    name: "start_verification",
    arguments: {
      intent: "Show Welcome",
      target: "sample",
      approved: true,
      criteria: [
        {
          id: "one",
          expected: "Show Plan your visit",
          kind: "heading",
          value: "Plan your visit",
        },
      ],
    },
  });
  const runId = JSON.parse((run.content as any)[0].text).id;
  await expect
    .poll(
      async () => {
        const state = await client.callTool({
          name: "check_verification",
          arguments: { id: runId },
        });
        return JSON.parse((state.content as any)[0].text).status;
      },
      { timeout: 20000 },
    )
    .toBe("complete");
  const report = await client.callTool({
    name: "get_report",
    arguments: { id: runId },
  });
  expect(JSON.parse((report.content as any)[0].text).results).toHaveLength(2);
  await client.close();
});
test("keyboard can reach the sample action and inputs", async ({ page }) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.keyboard.press("Tab");
  let sawInput = false;
  for (let i = 0; i < 12; i++) {
    if (
      await page
        .locator("#intent")
        .evaluate((el) => document.activeElement === el)
    )
      sawInput = true;
    await page.keyboard.press("Tab");
  }
  expect(sawInput).toBe(true);
});

test("workspace navigation preserves the draft and explains connection setup", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page
    .getByLabel("What should happen?", { exact: true })
    .fill('Show a heading called "Welcome".');
  await page.getByRole("button", { name: "Connections", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Connections", exact: true }),
  ).toBeVisible();
  await page.getByText("Setup steps", { exact: true }).first().click();
  await expect(
    page.getByText(
      "Create a GitHub App with read-only Contents and Pull requests permissions.",
    ),
  ).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/asbuilt-connections.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New review", exact: true }).click();
  await expect(
    page.getByLabel("What should happen?", { exact: true }),
  ).toHaveValue('Show a heading called "Welcome".');
});

test("editor focus is continuous across the text field and footer", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByLabel("What should happen?", { exact: true }).focus();
  await page
    .locator(".intent-editor")
    .screenshot({ path: "test-results/asbuilt-editor-focus.png" });
  await expect(
    page.getByLabel("What should happen?", { exact: true }),
  ).toBeFocused();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});

test("deleting a review requires confirmation and removes its evidence", async ({
  page,
  request,
}) => {
  const auth = { Authorization: `Bearer ${token}` };
  const response = await request.post("/api/runs", {
    headers: auth,
    data: {
      intent: "Delete test fixture",
      target: "sample",
      approved: true,
      criteria: [
        {
          id: "delete-test",
          expected: "Show Plan your visit",
          kind: "heading",
          value: "Plan your visit",
        },
      ],
    },
  });
  const run = await response.json();
  await expect
    .poll(async () => {
      const r = await request.get(`/api/runs/${run.id}`, { headers: auth });
      return (await r.json()).status;
    })
    .toBe("complete");
  const saved = await (
    await request.get(`/api/runs/${run.id}`, { headers: auth })
  ).json();
  expect(
    (
      await request.delete(`/api/runs/${run.id}`, {
        headers: auth,
        data: { confirmed: false },
      })
    ).status(),
  ).toBe(400);
  expect(
    (
      await request.delete(`/api/runs/${run.id}`, { data: { confirmed: true } })
    ).status(),
  ).toBe(401);
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: /Past reviews/ }).click();
  const row = page.getByTestId(`review-${run.id}`);
  page.once("dialog", (dialog) => dialog.dismiss());
  await row.getByRole("button", { name: /Delete sample review/ }).click();
  await expect(row).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await row.getByRole("button", { name: /Delete sample review/ }).click();
  await expect(row).toHaveCount(0);
  await expect(page.getByRole("status")).toContainText(
    "Review and screenshots deleted.",
  );
  expect(
    (await request.get(`/api/runs/${run.id}`, { headers: auth })).status(),
  ).toBe(404);
  expect(
    (await request.get(saved.results[0].screenshot, { headers: auth })).ok(),
  ).toBe(false);
  await page.reload();
  await page.getByRole("button", { name: /Past reviews/ }).click();
  await expect(page.getByTestId(`review-${run.id}`)).toHaveCount(0);
});

test("interactive sample executes reviewed click, fill and select steps on both viewports", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Create review plan" }).click();
  await page
    .getByLabel("Browser mode", { exact: true })
    .selectOption("interactive");
  await page.getByRole("button", { name: "Load interaction example" }).click();
  await expect(page.getByLabel("Field label", { exact: true })).toHaveCount(3);
  await page.getByLabel("I’ve reviewed these checks", { exact: false }).check();
  await expect(
    page.getByRole("button", { name: "Run reviewed checks" }),
  ).toBeDisabled();
  await page
    .getByLabel("I approve the exact actions", { exact: false })
    .check();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/asbuilt-interactive-plan.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/asbuilt-interactive-plan-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 960 });
  await page.getByRole("button", { name: "Run reviewed checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Verification report" }),
  ).toBeVisible({ timeout: 45000 });
  const runs = await (await page.request.get("/api/runs")).json();
  const report = await (
    await page.request.get(`/api/runs/${runs[0].id}`)
  ).json();
  expect(report.plan.execution).toBe("interactive");
  expect(report.status).toBe("complete");
  expect(report.results).toHaveLength(6);
  expect(report.results.every((r: any) => r.status === "pass")).toBe(true);
  expect(new Set(report.results.map((r: any) => r.screenshot)).size).toBe(6);
  expect(
    report.results.some((r: any) =>
      r.steps.some((s: string) => s.includes("Select")),
    ),
  ).toBe(true);
  for (const r of report.results)
    expect((await page.request.get(r.screenshot)).status()).toBe(200);
  await page.screenshot({
    path: "test-results/asbuilt-interactive-report.png",
    fullPage: true,
  });
});
test("interactive failures and policy refusals never become passes; checks start fresh", async ({
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const body = {
    intent: "Phase 2 isolation test",
    target: "sample",
    approved: true,
    execution: "interactive",
    actionsApproved: true,
    criteria: [
      {
        id: "fill",
        expected: "Preview Alex",
        kind: "text",
        value: "Studio tour for Alex",
        actions: [
          { type: "fill", name: "First name", value: "Alex" },
          { type: "click", name: "Preview visit", value: "" },
        ],
      },
      {
        id: "fresh",
        expected: "A fresh session has no name",
        kind: "text",
        value: "Studio tour for a guest",
        actions: [{ type: "click", name: "Preview visit", value: "" }],
      },
      {
        id: "missing",
        expected: "An intentionally incorrect outcome",
        kind: "text",
        value: "This text is intentionally missing",
        actions: [],
      },
      {
        id: "blocked",
        expected: "A prohibited booking must not run",
        kind: "text",
        value: "Booked",
        actions: [{ type: "click", name: "Book a visit", value: "" }],
      },
    ],
  };
  expect(
    (
      await request.post("/api/runs", {
        headers,
        data: { ...body, actionsApproved: false },
      })
    ).status(),
  ).toBe(400);
  const created = await (
    await request.post("/api/runs", { headers, data: body })
  ).json();
  await expect
    .poll(
      async () => {
        const r = await request.get(`/api/runs/${created.id}`, { headers });
        return (await r.json()).status;
      },
      { timeout: 45000 },
    )
    .toBe("complete");
  const report = await (
    await request.get(`/api/runs/${created.id}`, { headers })
  ).json();
  expect(report.results.filter((r: any) => r.status === "pass")).toHaveLength(
    4,
  );
  expect(report.results.filter((r: any) => r.status === "fail")).toHaveLength(
    2,
  );
  expect(
    report.results.filter((r: any) => r.status === "not_verified"),
  ).toHaveLength(2);
  expect(
    report.results
      .filter((r: any) => r.criterion.id === "blocked")
      .every((r: any) => r.observed.includes("policy")),
  ).toBe(true);
});

test("interaction policy refuses submit controls, password fields, and ambiguous buttons", async ({
  page,
}) => {
  const { perform } = await import("../../server/interaction-policy.mjs");
  await page.setContent(
    '<form><button>Continue</button></form><label for="access">Access code</label><input id="access" type="password"><button type="button">Show details</button><button type="button">Show details</button>',
  );
  await expect(
    perform(page, { type: "click", name: "Continue", value: "" }),
  ).rejects.toThrow(/permitted/);
  await expect(
    perform(page, { type: "fill", name: "Access code", value: "synthetic" }),
  ).rejects.toThrow(/permitted/);
  await expect(
    perform(page, { type: "click", name: "Show details", value: "" }),
  ).rejects.toThrow(/ambiguous/);
  await expect(page.getByLabel("Access code")).toHaveValue("");
});

test("remember device uses a protected persistent cookie and sign out revokes it", async ({
  page,
  context,
  request,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await expect(
    page.getByLabel("Remember this device for 30 days"),
  ).toBeChecked();
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  const cookie = (await context.cookies()).find((c) => c.name === "asbuilt")!;
  expect(cookie.httpOnly).toBe(true);
  expect(cookie.sameSite).toBe("Strict");
  expect(cookie.expires).toBeGreaterThan(Date.now() / 1000 + 29 * 86400);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByLabel("Workspace access key")).toBeVisible();
  expect(
    (
      await request.get("/api/config", {
        headers: { Cookie: `asbuilt=${cookie.value}` },
      })
    ).status(),
  ).toBe(401);
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByLabel("Remember this device for 30 days").uncheck();
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(
    page.getByRole("button", { name: "Sign out", exact: true }),
  ).toBeVisible();
  expect(
    (await context.cookies()).find((c) => c.name === "asbuilt")!.expires,
  ).toBe(-1);
});

test("stdio MCP bridge works from another directory and shares HTTP reports", async () => {
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { resolve } = await import("node:path");
  const client = new Client({ name: "asbuilt-stdio-test", version: "1.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      "--import",
      resolve("node_modules/tsx/dist/loader.mjs"),
      resolve("server/stdio.ts"),
    ],
    cwd: "/tmp",
    env: {
      PATH: process.env.PATH!,
      ASBUILT_URL: "http://127.0.0.1:4320",
      ASBUILT_TOKEN: token,
    },
    stderr: "pipe",
  });
  try {
    await client.connect(transport);
    expect((await client.listTools()).tools).toHaveLength(13);
    const status = await client.callTool({
      name: "get_connection_status",
      arguments: {},
    });
    expect(status.isError).not.toBe(true);
    expect(JSON.parse((status.content as any)[0].text).scope).toBe(
      "local single operator",
    );
    const run = await client.callTool({
      name: "start_verification",
      arguments: {
        intent: "Verify sample heading",
        target: "sample",
        approved: true,
        criteria: [
          {
            id: "heading",
            kind: "heading",
            expected: "Sample heading appears",
            value: "Plan your visit",
          },
        ],
      },
    });
    const id = JSON.parse((run.content as any)[0].text).id;
    expect(id).toBeTruthy();
    await expect
      .poll(
        async () =>
          JSON.parse(
            (
              (
                await client.callTool({
                  name: "check_verification",
                  arguments: { id },
                })
              ).content as any
            )[0].text,
          ).status,
        { timeout: 20000 },
      )
      .toBe("complete");
    const result = await client.callTool({
      name: "get_report",
      arguments: { id },
    });
    expect(JSON.parse((result.content as any)[0].text).results).toHaveLength(2);
    const response = await fetch(`http://127.0.0.1:4320/api/runs/${id}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    expect((await response.json()).id).toBe(id);
  } finally {
    await client.close();
  }
});

test("journey review clears approval on edits and preserves location across checkpoint pages", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Create review plan" }).click();
  await page
    .getByLabel("Browser mode", { exact: true })
    .selectOption("interactive");
  await page.getByRole("button", { name: "Load journey example" }).click();
  await expect(
    page.getByLabel("Keep one session for this journey"),
  ).toBeChecked();
  await page
    .getByLabel("I approve the exact actions", { exact: false })
    .check();
  await page.getByLabel("I’ve reviewed these checks", { exact: false }).check();
  await page
    .getByLabel("Reviewed read-only data URLs", { exact: false })
    .fill("https://sample.asbuilt.invalid/api/example");
  await expect(
    page.getByLabel("I approve the exact actions", { exact: false }),
  ).not.toBeChecked();
  await page
    .getByLabel("Reviewed read-only data URLs", { exact: false })
    .fill("");
  await page
    .getByLabel("I approve the exact actions", { exact: false })
    .check();
  await page.getByLabel("I’ve reviewed these checks", { exact: false }).check();
  await page.getByRole("button", { name: "Run reviewed checks" }).click();
  await expect(
    page.getByRole("heading", { name: "Verification report" }),
  ).toBeVisible({ timeout: 45000 });
  const runs = await (await page.request.get("/api/runs")).json();
  const report = await (
    await page.request.get(`/api/runs/${runs[0].id}`)
  ).json();
  expect(report.plan.journey).toBe(true);
  expect(report.results).toHaveLength(6);
  expect(report.results.every((r: any) => r.status === "pass")).toBe(true);
});

test("implicit cookie button outside forms is allowed but explicit and associated submits are refused", async ({
  page,
}) => {
  const { perform } = await import("../../server/interaction-policy.mjs");
  await page.setContent(
    `<button onclick="this.textContent='Accepted'">Essential Only</button><button type="submit">Explicit submit</button><form id="f"></form><button form="f">Associated submit</button>`,
  );
  await perform(page, { type: "click", name: "Essential Only", value: "" });
  await expect(page.getByRole("button", { name: "Accepted" })).toBeVisible();
  await expect(
    perform(page, { type: "click", name: "Explicit submit", value: "" }),
  ).rejects.toThrow();
  await expect(
    perform(page, { type: "click", name: "Associated submit", value: "" }),
  ).rejects.toThrow();
});

test("named sections disambiguate duplicate action labels without choosing the first match", async ({
  page,
}) => {
  const { perform } = await import("../../server/interaction-policy.mjs");
  await page.setContent(
    `<section aria-label="Location"><button type="button" onclick="this.textContent='Selected Jamaica'">Jamaica</button></section><section aria-label="Other"><button type="button">Jamaica</button></section>`,
  );
  await expect(
    perform(page, { type: "click", name: "Jamaica", value: "" }),
  ).rejects.toThrow(/ambiguous/);
  await perform(page, {
    type: "click",
    name: "Jamaica",
    value: "",
    within: { role: "region", name: "Location" },
  });
  await expect(
    page
      .getByRole("region", { name: "Location" })
      .getByRole("button", { name: "Selected Jamaica" }),
  ).toBeVisible();
  await expect(
    page
      .getByRole("region", { name: "Other" })
      .getByRole("button", { name: "Jamaica" }),
  ).toBeVisible();
});

test("navigation accepts equivalent links but rejects conflicting destinations before clicking", async ({
  page,
}) => {
  const { perform } = await import("../../server/interaction-policy.mjs");
  await page.route("https://fixture.example/**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/html",
      body: "<h1>Destination</h1>",
    }),
  );
  await page.goto("https://fixture.example/");
  await page.setContent('<a href="/store">Store</a><a href="/other">Store</a>');
  await expect(
    perform(
      page,
      {
        type: "navigate",
        name: "Store",
        value: "https://fixture.example/store",
      },
      ["https://fixture.example/store"],
    ),
  ).rejects.toThrow(/reviewed destination/);
  expect(page.url()).toBe("https://fixture.example/");
  await page.setContent('<a href="/store">Store</a><a href="/store">Store</a>');
  await perform(
    page,
    { type: "navigate", name: "Store", value: "https://fixture.example/store" },
    ["https://fixture.example/store"],
  );
  expect(page.url()).toBe("https://fixture.example/store");
});

test("reviewed menus open submenus and restrict navigation choices", async ({
  page,
}) => {
  const { perform } = await import("../../server/interaction-policy.mjs");
  await page.route("https://fixture.example/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<h1>Stores</h1>" }),
  );
  await page.goto("https://fixture.example/");
  await page.setContent(
    `<div role="menu"><div role="menuitem" aria-haspopup="menu" onclick="document.querySelector('#choices').hidden=false">Island</div></div><div id="choices" hidden role="menu"><div role="menuitem" onclick="location.href='/stores?region=North'">North</div></div>`,
  );
  await perform(page, { type: "menu", name: "Island", value: "" });
  await expect(
    perform(page, { type: "menu", name: "North", value: "" }),
  ).rejects.toThrow(/reviewed destination/);
  await expect(
    perform(page, {
      type: "menu",
      name: "North",
      value: "https://elsewhere.example/",
    }),
  ).rejects.toThrow(/policy/);
  await perform(
    page,
    {
      type: "menu",
      name: "North",
      value: "https://fixture.example/stores?region=North",
    },
    ["https://fixture.example/stores?region=North"],
  );
  expect(page.url()).toBe("https://fixture.example/stores?region=North");
  await page.setContent(
    '<form><div role="menuitem" aria-haspopup="menu">Island</div></form>',
  );
  await expect(
    perform(page, { type: "menu", name: "Island", value: "" }),
  ).rejects.toThrow(/policy/);
  await page.setContent(
    '<div role="menuitem" aria-haspopup="menu">Delete account</div>',
  );
  await expect(
    perform(page, { type: "menu", name: "Delete account", value: "" }),
  ).rejects.toThrow(/policy/);
});

test("changing browser engine invalidates reviewed approvals", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Use an example" }).click();
  await page.getByRole("button", { name: "Create review plan" }).click();
  await page
    .getByLabel("Browser mode", { exact: true })
    .selectOption("interactive");
  const engine = page.getByLabel("Browser engine", { exact: true });
  await expect(engine.locator("option")).toHaveCount(3);
  await page
    .getByLabel("I approve the exact actions", { exact: false })
    .check();
  await page.getByLabel("I’ve reviewed these checks", { exact: false }).check();
  await expect(
    page.getByRole("button", { name: "Run reviewed checks" }),
  ).toBeEnabled();
  await engine.selectOption("firefox");
  await expect(
    page.getByLabel("I approve the exact actions", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("I’ve reviewed these checks", { exact: false }),
  ).not.toBeChecked();
  await expect(
    page.getByRole("button", { name: "Run reviewed checks" }),
  ).toBeDisabled();
  await engine.selectOption("webkit");
  await expect(engine).toHaveValue("webkit");
});

test("product coverage leads with what needs attention and links real run evidence", async ({
  page,
  request,
}) => {
  const headers = { Authorization: `Bearer ${token}` };
  const name = `Sample studio ${Date.now()}`;
  const content =
    'Visitors see a heading called "Plan your visit".\nThe page promises free cancellation.\nBookings send a confirmation email.';
  const saved = await (
    await request.post("/api/products", {
      headers,
      data: {
        title: name,
        understanding: "A fictional studio booking page.",
        sources: [
          {
            id: "ask",
            title: "Founder request",
            kind: "user_request",
            reference: "chat",
            content,
          },
        ],
        missingContext: ["Email delivery is not observable in a browser."],
        decisions: [],
        requirements: [
          {
            id: "heading",
            title: "Welcome heading",
            actor: "Visitor",
            priority: "critical",
            citations: [{ sourceId: "ask", line: 1, quote: "Plan your visit" }],
            outcomes: [
              {
                id: "heading-visible",
                expected: "The heading is visible",
                checks: [{ scenarioId: "page", criterionId: "heading" }],
              },
            ],
          },
          {
            id: "cancel",
            title: "Cancellation promise",
            actor: "Visitor",
            priority: "important",
            citations: [
              { sourceId: "ask", line: 2, quote: "free cancellation" },
            ],
            outcomes: [
              {
                id: "cancel-text",
                expected: "Free cancellation is promised",
                checks: [{ scenarioId: "page", criterionId: "cancel" }],
              },
            ],
          },
          {
            id: "email",
            title: "Confirmation email",
            actor: "Visitor",
            priority: "important",
            citations: [
              { sourceId: "ask", line: 3, quote: "confirmation email" },
            ],
            outcomes: [
              {
                id: "email-sent",
                expected: "An email arrives",
                checks: [],
                gap: "Email delivery is outside browser coverage.",
              },
            ],
          },
        ],
        scenarios: [
          {
            id: "page",
            title: "Booking page",
            plan: {
              intent: "Booking page content",
              target: "sample",
              execution: "static",
              criteria: [
                {
                  id: "heading",
                  expected: "The heading is visible",
                  kind: "heading",
                  value: "Plan your visit",
                },
                {
                  id: "cancel",
                  expected: "Free cancellation is promised",
                  kind: "text",
                  value: "Free cancellation",
                },
              ],
            },
          },
        ],
      },
    })
  ).json();
  expect(saved.id).toBeTruthy();

  await page.goto("/");
  await page.getByLabel("Workspace access key").fill(token);
  await page.getByRole("button", { name: "Open workspace" }).click();
  await page.getByRole("button", { name: "Product coverage" }).click();
  await expect(
    page.getByRole("heading", { name: "Product coverage", level: 1 }),
  ).toBeFocused();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(page.getByRole("heading", { name })).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "0 of 3 requirements verified" }),
  ).toBeVisible();
  await expect(page.getByText("3 haven’t been checked yet.")).toBeVisible();
  await expect(
    page.getByText("Your request", { exact: false }).first(),
  ).toBeAttached();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  // Nothing runs without the explicit per-scenario approval.
  await page.getByText("Booking page", { exact: true }).click();
  const run = page.getByRole("button", { name: "Run this scenario" });
  await expect(run).toBeDisabled();
  await page.getByLabel("I approve this scenario", { exact: false }).check();
  await run.click();
  await expect(
    page.getByRole("heading", { name: "Verification report" }),
  ).toBeVisible({ timeout: 45000 });
  await expect
    .poll(
      async () =>
        (
          await (
            await request.get(`/api/products/${saved.id}`, { headers })
          ).json()
        ).runs.length,
    )
    .toBe(1);
  await expect
    .poll(
      async () => {
        const runs = (
          await (
            await request.get(`/api/products/${saved.id}`, { headers })
          ).json()
        ).runs;
        return (
          await (
            await request.get(`/api/runs/${runs[0].runId}`, { headers })
          ).json()
        ).status;
      },
      { timeout: 45000 },
    )
    .toBe("complete");

  const coverage = await (
    await request.get(`/api/products/${saved.id}`, { headers })
  ).json();
  const status = Object.fromEntries(
    coverage.requirements.map((r: any) => [r.id, r.status]),
  );
  // Real sample evidence: heading present, cancellation text absent, email untestable.
  expect(status).toEqual({
    heading: "verified",
    cancel: "mismatch",
    email: "not_tested",
  });
  // A plain mismatch is already reported; it is not an "unclear" failure.
  expect(coverage.observedMismatches).toBe(0);

  await page.getByRole("button", { name: "Product coverage" }).click();
  await page.getByRole("button", { name: new RegExp(name) }).click();
  await expect(
    page.getByRole("heading", { name: "1 of 3 requirements verified" }),
  ).toBeVisible();
  await expect(
    page.getByText("1 didn’t behave as described. Review the evidence."),
  ).toBeVisible();
  await expect(page.getByText(/also failed a check/)).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: "View run evidence for: Free cancellation is promised",
    }),
  ).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({
    path: "test-results/product-coverage-mobile.png",
    fullPage: true,
  });
});
