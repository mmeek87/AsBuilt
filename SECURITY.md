# Security model

AsBuilt drives a real browser against websites and can read your GitHub repositories, so its security model matters more than its size suggests. This page covers what it protects, how, and what's still open.

## Trust boundaries

| Boundary | Trusted? | How it's handled |
| --- | --- | --- |
| The operator (you) on your own computer | Yes | One shared access key. Single operator; no per-user accounts. |
| The AI host (Claude, Codex) calling MCP tools | Partly | Same access key. A host can assert approval flags, so keep approvals enabled in the host. Approval is never read from saved files or saved reviews. |
| Websites being verified | **No** | Treated as hostile: network policy, isolation, and every observation is data, never instructions. |
| Repository content, PR text, page text | **No** | Data only. The planning agent is told so, and its tools are allow-listed outside the model. |
| GitHub, OpenAI APIs | Yes, over TLS | Credentials are server-side only. |

## Controls

**Access.** The service binds to `127.0.0.1` and rejects unknown `Host` and `Origin` headers, which blocks DNS rebinding and cross-site requests. The UI exchanges the key for an opaque, HttpOnly, `SameSite=Strict` session cookie; only SHA-256 digests are stored. Comparisons are constant-time. The hosted mode adds `__Host-`/`Secure` cookies and sign-in rate limiting.

**Network (SSRF).** Targets must be HTTPS origins on an operator allowlist (`ASBUILT_PREVIEW_ORIGINS`). There are no wildcards, credentials, query strings, literal IPs, `localhost` or `.local` names. Every DNS answer is checked; any private, reserved or mapped address rejects the request before a connection is made. The TLS socket is then pinned to the checked address. Redirects re-enter the same policy. Requests are bounded in count, size (5 MB each, 100 MB total) and time.

**Browser isolation.** Each check uses a fresh profile with no permissions or downloads, and service workers and WebSockets are blocked. External interactive pages run in a Docker container with `--network=none`, a read-only filesystem, all capabilities dropped, `no-new-privileges`, and memory, CPU and PID limits. No host mounts or environment variables are passed. Network access goes only through a broker in the parent process.

**Actions.** Only reviewed click, fill, select, navigate and menu actions run. Submit buttons, password fields, ambiguous controls and unreviewed destinations are refused. No purchases, submissions, sign-ins or deletions. Approval is separate for checks, actions and normal network traffic, and editing a plan clears approval.

**Integrity of results.** A pass requires an observation plus a screenshot. Blocked resources, script errors, HTTP errors and sign-in walls make a missing outcome Not verified, never Fail or Pass. Product coverage only counts runs whose recorded plan matches the frozen scenario exactly, on both viewports, with screenshots. Deleted or interrupted evidence never counts.

**GitHub.** It's a GitHub App with Contents and Pull requests read-only. Installation tokens are minted per request, narrowed to the one repository, and kept in memory only; they are never sent to the browser or the AI host. Posting a PR comment is off by default. Turning it on needs write permission, an operator setting, an exact preview, a single-use five-minute approval nonce matched to a hash of the comment, and an unchanged PR head. Page text in comments is rendered inert (see below).

**Secrets.** `.env`, keys, `.data/` and reports are git-ignored. The GitHub private key is read from a path outside the repo. Subprocesses get a minimal environment. API errors never include file paths, database details or tokens (`server/errors.ts`).

## Fixed in this release

| Issue | Severity | Fix |
| --- | --- | --- |
| API errors returned raw system messages, including absolute local file paths (e.g. `/Users/<name>/…/.data/product-<id>.json`) | Medium (information disclosure) | `publicError()` maps system and database errors to a generic 500 and missing items to 404; user-facing validation text is kept. Tested in `tests/errors.test.ts`. |
| Untrusted page text was pasted into PR comments as Markdown, so a site could inject @mentions, links, images or a fake "Approved" heading | Medium (content injection into your repository) | Observations and criteria are rendered as single inline code spans with backticks and newlines removed. Tested with a hostile payload in `tests/github-comments.test.ts`. |
| Posting to a repository the app had lost access to crashed with a `TypeError` | Low | Explicit "no longer has access" error. |
| Hosted product reviews had no storage cap | Low (resource exhaustion by an authenticated operator) | Capped at 100, matching local mode. |

## Residual risks and limits

- **Single shared key.** Anyone with the key has full operator rights, including through MCP. There are no per-user identities, roles or audit log. Don't share the key, and don't expose the service publicly.
- **Normal browser networking** (`network:"browser"`) lets the page make its own requests, including writes. Use staging environments, test accounts and sandbox services. A preview URL doesn't prove database isolation.
- **Prompt injection** can still distort a *proposed* plan from the planning agent or an AI host. Human review of the plan is the control. The executor itself ignores page instructions (see EVALS.md, misleading-content scenario).
- **Local storage** is plain JSON files with owner-only permissions. It isn't encrypted at rest or tamper-evident. Screenshots may contain whatever the preview shows.
- **Hosted mode** (`server/cloud`) uses the same shared-key model. It is not an OAuth connector and hasn't been security-reviewed for multi-user use.
- **Dependencies:** 11 runtime packages. `pnpm audit --prod` (November 26, 2026) reports **one high advisory**: Zod below 4.6.6 can exhaust memory while validating oversized constrained collections ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)). AsBuilt uses Zod 3.25 directly and through the MCP SDK. Exposure is limited: every request needs the access key, and JSON bodies are capped at 1 MB (64 KB in the helper). Fixing it means migrating to Zod 4 and confirming MCP SDK compatibility. That's tracked as a pre-launch item, not done here. Run `pnpm audit` before each release.

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability), and include steps to reproduce. Redact credentials, source code, screenshots and personal data.
