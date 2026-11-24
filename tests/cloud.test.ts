import test from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { cloudConfig } from "../server/cloud/config.ts";
import { sandboxOptions } from "../server/cloud/worker.ts";
import { createCloudApp } from "../server/cloud/app.ts";
import * as storage from "../server/cloud/database.ts";
test("cloud setup fails closed and restricts budget and public origin", () => {
  assert.throws(() => cloudConfig({}));
  const env = {
    DATABASE_URL: "postgres://example",
    BLOB_READ_WRITE_TOKEN: "test",
    ASBUILT_TOKEN: "x".repeat(40),
    ASBUILT_PUBLIC_ORIGIN: "https://asbuilt.example",
  };
  assert.equal(cloudConfig(env).enabled, false);
  assert.equal(cloudConfig(env).dailyLimit, 5);
  for (const origin of [
    "http://asbuilt.example",
    "https://user:secret@asbuilt.example",
    "https://asbuilt.example/other",
  ])
    assert.throws(() => cloudConfig({ ...env, ASBUILT_PUBLIC_ORIGIN: origin }));
  assert.throws(() => cloudConfig({ ...env, ASBUILT_DAILY_RUN_LIMIT: "500" }));
  const options = sandboxOptions("snap_test");
  assert.equal(options.networkPolicy, "deny-all");
  assert.equal(options.timeout, 180000);
  assert.ok(!("env" in options));
  assert.ok(!("ports" in options));
});
test("hosted HTTP boundary, persistent session adapter, disabled runs and explicit approval", async () => {
  const original = { ...process.env };
  Object.assign(process.env, {
    DATABASE_URL: "postgres://fixture",
    BLOB_READ_WRITE_TOKEN: "fixture",
    ASBUILT_TOKEN: "x".repeat(40),
    ASBUILT_PUBLIC_ORIGIN: "https://asbuilt.example",
    ASBUILT_CLOUD_RUNS_ENABLED: "false",
    ASBUILT_PREVIEW_ORIGINS: "https://preview.example",
  });
  const sessions = new Set<string>();
  const reports = new Map<string, any>();
  let runs = 0;
  const fake = {
    ...storage,
    loginAttempt: async () => true,
    issueSession: async () => {
      sessions.add("a".repeat(64));
      return { value: "a".repeat(64), seconds: 2592000 };
    },
    validSession: async (value: string) => sessions.has(value),
    revoke: async (value: string) => {
      sessions.delete(value);
    },
    listReports: async () => [...reports.values()],
    reserve: async (r: any) => {
      reports.set(r.id, r);
    },
    getReport: async (id: string) => reports.get(id),
  };
  const app = createCloudApp({
    storage: fake,
    run: async () => {
      runs++;
    },
    schedule: (p) => {
      void p;
    },
  });
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as any;
  const { request: httpRequest } = await import("node:http");
  const request = (
    path: string,
    method = "GET",
    body?: any,
    headers: Record<string, string> = {},
  ) =>
    new Promise<Response>((resolve, reject) => {
      const req = httpRequest(
        {
          hostname: "127.0.0.1",
          port: address.port,
          path,
          method,
          headers: {
            Host: "asbuilt.example",
            "Content-Type": "application/json",
            ...headers,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on("data", (chunk) => chunks.push(chunk));
          res.on("end", () =>
            resolve(
              new Response(Buffer.concat(chunks), {
                status: res.statusCode,
                headers: Object.fromEntries(
                  Object.entries(res.headers).map(([k, v]) => [
                    k,
                    Array.isArray(v) ? v.join(",") : String(v),
                  ]),
                ),
              }),
            ),
          );
        },
      );
      req.on("error", reject);
      if (body !== undefined) req.write(JSON.stringify(body));
      req.end();
    });
  try {
    assert.equal((await request("/api/config")).status, 401);
    assert.equal(
      (
        await request(
          "/api/session",
          "POST",
          { token: process.env.ASBUILT_TOKEN },
          { Origin: "https://evil.example" },
        )
      ).status,
      403,
    );
    assert.equal(
      (await request("/api/session", "POST", { token: "wrong" })).status,
      401,
    );
    const login = await request("/api/session", "POST", {
      token: process.env.ASBUILT_TOKEN,
      remember: true,
    });
    assert.equal(login.status, 200);
    const setCookie = login.headers.get("set-cookie")!;
    assert.match(setCookie, /Secure; HttpOnly; SameSite=Strict/);
    assert.match(setCookie, /Max-Age=2592000/);
    const headers = { Cookie: setCookie.split(";")[0] };
    const config = await (
      await request("/api/config", "GET", undefined, headers)
    ).json();
    assert.equal(config.hosting, "vercel");
    assert.equal(config.executionEnabled, false);
    const plan = {
      intent: "Check fixture",
      target: "sample",
      approved: true,
      criteria: [
        {
          id: "one",
          kind: "heading",
          value: "Plan your visit",
          expected: "Sample heading",
        },
      ],
    };
    assert.equal(
      (await request("/api/runs", "POST", plan, headers)).status,
      400,
    );
    assert.equal(runs, 0);
    process.env.ASBUILT_CLOUD_RUNS_ENABLED = "true";
    process.env.ASBUILT_SANDBOX_SNAPSHOT_ID = "snap_test";
    assert.equal(
      (
        await request(
          "/api/runs",
          "POST",
          { ...plan, approved: false },
          headers,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await request(
          "/api/runs",
          "POST",
          { ...plan, target: "https://not-approved.example" },
          headers,
        )
      ).status,
      400,
    );
    assert.equal(
      (await request("/api/runs", "POST", plan, headers)).status,
      202,
    );
    assert.equal(runs, 1);
    assert.equal(reports.size, 1);
    assert.equal(
      (await request("/api/logout", "POST", {}, headers)).status,
      200,
    );
    assert.equal(
      (await request("/api/config", "GET", undefined, headers)).status,
      401,
    );
  } finally {
    server.close();
    process.env = original;
  }
});
