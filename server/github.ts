import { readFileSync } from "node:fs";
import { createPrivateKey, sign } from "node:crypto";
export function githubConfigured() {
  return Boolean(
    process.env.GITHUB_APP_ID &&
    process.env.GITHUB_INSTALLATION_ID &&
    process.env.GITHUB_PRIVATE_KEY_PATH,
  );
}
export function parseSource(raw: string) {
  const u = new URL(raw);
  const m = u.pathname.match(
    /^\/([\w.-]+)\/([\w.-]+)\/(pull|commit)\/([a-f0-9]+)\/?$/,
  );
  if (
    u.origin !== "https://github.com" ||
    u.username ||
    u.password ||
    u.search ||
    u.hash ||
    !m ||
    (m[3] === "pull" && !/^\d+$/.test(m[4])) ||
    (m[3] === "commit" && !/^[a-f0-9]{40}$/.test(m[4]))
  )
    throw Error(
      "Paste a GitHub pull request URL or a full 40-character commit URL.",
    );
  return { repository: `${m[1]}/${m[2]}`, kind: m[3], ref: m[4] };
}
async function api(path: string, token: string, body?: unknown) {
  const r = await fetch(`https://api.github.com${path}`, {
    method: body ? "POST" : "GET",
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000),
    redirect: "error",
  });
  if (!r.ok)
    throw Error(
      `GitHub returned ${r.status}. Check the app installation and permissions.`,
    );
  return await r.json();
}
async function installationToken(write = false, repositoryId?: number) {
  if (!githubConfigured())
    throw Error(
      "GitHub is not connected. Follow the GitHub App setup in README.",
    );
  if (write && process.env.GITHUB_ALLOW_COMMENTS !== "true")
    throw Error("PR comments are disabled by the operator.");
  const now = Math.floor(Date.now() / 1000);
  const enc = (x: unknown) =>
    Buffer.from(JSON.stringify(x)).toString("base64url");
  const data = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iat: now - 60, exp: now + 540, iss: process.env.GITHUB_APP_ID })}`;
  const jwt = `${data}.${sign("RSA-SHA256", Buffer.from(data), createPrivateKey(readFileSync(process.env.GITHUB_PRIVATE_KEY_PATH!))).toString("base64url")}`;
  const token = await api(
    `/app/installations/${process.env.GITHUB_INSTALLATION_ID}/access_tokens`,
    jwt,
    {
      permissions: {
        contents: "read",
        pull_requests: write ? "write" : "read",
      },
      ...(repositoryId ? { repository_ids: [repositoryId] } : {}),
    },
  );
  return token.token as string;
}
export async function listRepositories() {
  const token = await installationToken();
  const r = await api("/installation/repositories?per_page=100", token);
  return {
    repositories: r.repositories.map((x: any) => ({
      id: x.id,
      name: x.full_name,
    })),
    truncated: r.total_count > 100,
  };
}
export async function inspectSource(url: string) {
  const p = parseSource(url);
  const list = await listRepositories();
  const repo = list.repositories.find((r: any) => r.name === p.repository);
  if (!repo)
    throw Error(
      "Repository is not in this app installation (first 100 repositories). Install on selected repositories only.",
    );
  const token = await installationToken(false, repo.id);
  const source = await api(
    `/repos/${p.repository}/${p.kind === "pull" ? "pulls" : "commits"}/${p.ref}`,
    token,
  );
  return {
    url,
    repository: p.repository,
    sha: p.kind === "pull" ? source.head.sha : source.sha,
    ...(p.kind === "pull" ? { pr: Number(p.ref) } : {}),
    title:
      p.kind === "pull" ? source.title : source.commit.message.split("\n")[0],
  };
}
export async function postComment(url: string, sha: string, body: string) {
  const p = parseSource(url);
  if (p.kind !== "pull") throw Error("Only pull requests support comments.");
  const current = await inspectSource(url);
  if (current.sha !== sha)
    throw Error(
      "The pull request changed. Verify its new commit before posting.",
    );
  const repos = await listRepositories();
  const repo = repos.repositories.find((r: any) => r.name === p.repository);
  const token = await installationToken(true, repo.id);
  const result = await api(
    `/repos/${p.repository}/issues/${p.ref}/comments`,
    token,
    { body },
  );
  return { url: result.html_url };
}

export async function repositoryReader(source: {
  repository: string;
  sha: string;
}) {
  const list = await listRepositories();
  const repo = list.repositories.find((r: any) => r.name === source.repository);
  if (!repo) throw Error("Repository is not installed.");
  const token = await installationToken(false, repo.id);
  const tree = await api(
    `/repos/${source.repository}/git/trees/${source.sha}?recursive=1`,
    token,
  );
  const paths = tree.tree
    .filter(
      (x: any) =>
        x.type === "blob" &&
        x.size < 30000 &&
        /\.(tsx?|jsx?|html|css|md|json)$/.test(x.path) &&
        !/(^|\/)(\.env|node_modules|vendor|package-lock|pnpm-lock|secrets?|credentials)/i.test(
          x.path,
        ),
    )
    .slice(0, 500)
    .map((x: any) => ({ path: x.path, sha: x.sha }));
  let readCount = 0;
  return {
    tree: {
      paths: paths.map((x: any) => x.path),
      truncated: Boolean(tree.truncated) || tree.tree.length > 500,
    },
    read: async (path: string) => {
      if (++readCount > 8) throw Error("Repository reading budget reached.");
      const file = paths.find((x: any) => x.path === path);
      if (!file) throw Error("File is not in the readable source list.");
      const blob = await api(
        `/repos/${source.repository}/git/blobs/${file.sha}`,
        token,
      );
      if (blob.encoding !== "base64" || blob.size > 30000)
        throw Error("File is too large or unsupported.");
      return Buffer.from(blob.content, "base64").toString("utf8");
    },
  };
}
