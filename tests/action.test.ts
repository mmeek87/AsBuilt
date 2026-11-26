import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  eventSource,
  postComment,
  preparePlan,
  previewOrigin,
  stepSummary,
} from "../server/action.ts";
import type { Report } from "../server/schema.ts";

test("the preview address comes from the workflow and must be https", () => {
  assert.equal(
    previewOrigin("https://shop-git-pr-7.vercel.app/store?x=1"),
    "https://shop-git-pr-7.vercel.app",
  );
  assert.equal(previewOrigin("sample"), "sample");
  assert.throws(() => previewOrigin("http://shop.example.com"), /https/);
  assert.throws(() => previewOrigin(""), /full https/);
});

test("a plan file cannot choose its own target or pre-approve itself", () => {
  const plan = preparePlan(
    {
      intent: "x",
      criteria: [],
      target: "https://169.254.169.254/",
      approved: false,
    },
    "https://preview.example.com/",
  ) as any;
  assert.equal(plan.target, "https://preview.example.com/");
  assert.equal(plan.approved, true);
  assert.throws(() => preparePlan([], "sample"), /one JSON object/);
});

const sha = "c".repeat(40);
function report(): Report {
  return {
    id: "6f1d6c0e-5b0a-4d55-9f43-2f8f0c8b7a11",
    status: "complete",
    createdAt: new Date().toISOString(),
    mode: "preview",
    plan: {
      intent: "x",
      target: "https://preview.example.com/",
      approved: true,
      criteria: [
        {
          id: "h",
          expected: "Heading | visible",
          kind: "heading",
          value: "Shop",
        },
      ],
      source: {
        url: "https://github.com/me/shop/pull/5",
        sha,
        repository: "me/shop",
        pr: 5,
      },
    } as any,
    results: [
      {
        criterion: {
          id: "h",
          expected: "Heading | visible",
          kind: "heading",
          value: "Shop",
        },
        viewport: "Desktop",
        status: "fail",
        observed: "No heading @team",
        steps: [],
        screenshot: "/evidence/x/desktop.png",
      },
    ],
    blockedRequests: 0,
    limitations: ["Static."],
  };
}

test("the job summary escapes table-breaking text and links screenshots", () => {
  const md = stepSummary(report(), "https://github.com/me/shop/actions/runs/1");
  assert.match(md, /Heading \\\| visible/);
  assert.match(md, /\*\*0 passed · 1 failed · 0 not verified\*\*/);
  assert.match(md, /asbuilt-evidence\*\* artifact on \[this workflow run\]/);
});

test("finds the PR from a Vercel deployment event, then posts one comment and updates it on reruns", async () => {
  const calls: string[] = [];
  const comments: { id: number; body: string }[] = [];
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      calls.push(`${req.method} ${req.url}`);
      assert.equal(req.headers.authorization, "Bearer test-token");
      res.setHeader("content-type", "application/json");
      if (req.url === `/repos/me/shop/commits/${sha}/pulls`)
        return res.end(
          JSON.stringify([
            { number: 4, state: "closed" },
            { number: 5, state: "open" },
          ]),
        );
      if (
        req.url?.startsWith("/repos/me/shop/issues/5/comments") &&
        req.method === "GET"
      )
        return res.end(
          JSON.stringify([{ id: 1, body: "Nice work!" }, ...comments]),
        );
      if (
        req.url === "/repos/me/shop/issues/5/comments" &&
        req.method === "POST"
      ) {
        comments.push({ id: 99, body: JSON.parse(body).body });
        res.statusCode = 201;
        return res.end("{}");
      }
      if (
        req.url === "/repos/me/shop/issues/comments/99" &&
        req.method === "PATCH"
      ) {
        comments[0].body = JSON.parse(body).body;
        return res.end("{}");
      }
      res.statusCode = 404;
      res.end("{}");
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const dir = mkdtempSync(join(tmpdir(), "asbuilt-action-"));
  const eventPath = join(dir, "event.json");
  writeFileSync(
    eventPath,
    JSON.stringify({
      deployment: { sha },
      deployment_status: { state: "success" },
    }),
  );
  const saved = { ...process.env };
  Object.assign(process.env, {
    GITHUB_API_URL: `http://127.0.0.1:${(server.address() as any).port}`,
    GITHUB_REPOSITORY: "me/shop",
    GITHUB_EVENT_PATH: eventPath,
    INPUT_GITHUB_TOKEN: "test-token",
    INPUT_COMMENT: "true",
  });
  try {
    const source = await eventSource();
    assert.deepEqual(source, {
      url: "https://github.com/me/shop/pull/5",
      sha,
      repository: "me/shop",
      pr: 5,
    });
    await postComment(report(), "https://github.com/me/shop/actions/runs/1");
    await postComment(report(), "https://github.com/me/shop/actions/runs/2");
    assert.equal(comments.length, 1, "reruns update the same comment");
    assert.match(comments[0].body, /^<!-- asbuilt-verification -->/);
    assert.match(comments[0].body, /actions\/runs\/2/);
    assert.match(
      comments[0].body,
      /Observed: `No heading @team`/,
      "page text stays inert",
    );
    assert.equal(calls.filter((c) => c.startsWith("POST")).length, 1);
    assert.equal(calls.filter((c) => c.startsWith("PATCH")).length, 1);
  } finally {
    process.env = saved;
    server.close();
  }
});
