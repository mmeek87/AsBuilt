import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inspectSource,
  repositoryReader,
  postComment,
} from "../server/github.ts";

test("GitHub App narrows read tokens, reads immutable blobs, and refuses unapproved writes", async () => {
  const directory = mkdtempSync(join(tmpdir(), "asbuilt-github-test-"));
  const keyPath = join(directory, "test.pem");
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  writeFileSync(keyPath, privateKey.export({ type: "pkcs8", format: "pem" }));
  const keys = [
    "GITHUB_APP_ID",
    "GITHUB_INSTALLATION_ID",
    "GITHUB_PRIVATE_KEY_PATH",
    "GITHUB_ALLOW_COMMENTS",
  ] as const;
  const old = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
  const originalFetch = globalThis.fetch;
  const tokenRequests: any[] = [];
  const paths: string[] = [];
  const sha = "a".repeat(40);
  let commentPosts = 0;
  Object.assign(process.env, {
    GITHUB_APP_ID: "123",
    GITHUB_INSTALLATION_ID: "456",
    GITHUB_PRIVATE_KEY_PATH: keyPath,
    GITHUB_ALLOW_COMMENTS: "false",
  });
  globalThis.fetch = async (input: any, init?: any) => {
    const url = new URL(String(input));
    assert.equal(url.origin, "https://api.github.com");
    paths.push(url.pathname);
    let body: any;
    if (url.pathname.endsWith("/access_tokens")) {
      tokenRequests.push(JSON.parse(init.body));
      body = { token: "fake-installation-token" };
    } else if (url.pathname === "/installation/repositories")
      body = {
        total_count: 1,
        repositories: [{ id: 42, full_name: "team/sample" }],
      };
    else if (url.pathname.endsWith("/pulls/12/files"))
      body = [
        {
          filename: "src/page.tsx",
          status: "modified",
          additions: 1,
          deletions: 0,
        },
      ];
    else if (url.pathname.endsWith("/pulls/12"))
      body = { head: { sha }, title: "Example change" };
    else if (url.pathname.includes("/git/trees/")) {
      assert.ok(url.pathname.endsWith(sha));
      body = {
        truncated: false,
        tree: [
          { path: "src/page.tsx", type: "blob", size: 16, sha: "blob-id" },
          {
            path: "credentials.json",
            type: "blob",
            size: 12,
            sha: "secret-id",
          },
        ],
      };
    } else if (url.pathname.endsWith("/git/blobs/blob-id"))
      body = {
        encoding: "base64",
        size: 16,
        content: Buffer.from("<h1>Welcome</h1>").toString("base64"),
      };
    else if (url.pathname.endsWith("/comments")) {
      commentPosts++;
      body = { html_url: "https://github.com/team/sample/pull/12#comment" };
    } else throw Error("Unexpected mock API call: " + url.pathname);
    return Response.json(body);
  };
  try {
    const source = await inspectSource(
      "https://github.com/team/sample/pull/12",
    );
    assert.equal(source.sha, sha);
    const reader = await repositoryReader(source);
    assert.deepEqual(reader.tree.paths, ["src/page.tsx"]);
    assert.equal(reader.changed?.files[0].path, "src/page.tsx");
    assert.equal(await reader.read("src/page.tsx"), "<h1>Welcome</h1>");
    await assert.rejects(
      () => reader.read("credentials.json"),
      /not in the readable/,
    );
    await assert.rejects(
      () => postComment(source.url, sha, "Report"),
      /disabled/,
    );
    assert.equal(commentPosts, 0);
    assert.ok(tokenRequests.some((x) => x.repository_ids?.[0] === 42));
    assert.ok(
      tokenRequests.every(
        (x) =>
          x.permissions.contents === "read" &&
          x.permissions.pull_requests === "read",
      ),
    );
    assert.ok(paths.some((x) => x.endsWith("/git/blobs/blob-id")));
    await assert.rejects(
      () => inspectSource("https://github.com/not-installed/project/pull/12"),
      /not in this app installation/,
    );
  } finally {
    globalThis.fetch = originalFetch;
    for (const k of keys) {
      if (old[k] === undefined) delete process.env[k];
      else process.env[k] = old[k];
    }
    rmSync(directory, { recursive: true, force: true });
  }
});
