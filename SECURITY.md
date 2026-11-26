# Security model

AsBuilt drives a real browser against websites and can read your GitHub repositories, so its security model matters more than its size suggests. This page covers what it protects, how, and what's still open.

## Trust boundaries

| Boundary | Trusted? | How it's handled |
| --- | --- | --- |
| The operator (you) on your own computer | Yes | One shared access key. Single operator; no per-user accounts. |
| The GitHub Action's workflow and committed plan files | Yes, as reviewed code | The preview address comes from the workflow, never the plan. Plans can't pre-approve themselves; wider permissions must be written in the file, where they show in the PR diff. The built-in token is used only to find the PR and post one comment. |
| The AI host (Claude, Codex) calling MCP tools | Partly | Same access key. A host can assert approval flags, so keep approvals enabled in the host. Approval is never read from saved files or saved reviews. |
| Websites being verified | **No** | Treated as hostile: network policy, isolation, and every observation is data, never instructions. |
| Repository content, PR text, page text | **No** | Data only. The planning agent is told so, and its tools are allow-listed outside the model. |
| GitHub, OpenAI APIs | Yes, over TLS | Credentials are server-side only. |

## Controls

**Access.** The service binds to `127.0.0.1` and rejects unknown `Host` and `Origin` headers, which blocks DNS rebinding and cross-site requests. The UI exchanges the key for an opaque, HttpOnly, `SameSite=Strict` session cookie; only SHA-256 digests are stored. Comparisons are constant-time. The GitHub Action needs no key at all: it runs inside the repository's own workflow with GitHub's short-lived token.

**Network (SSRF).** Targets must be HTTPS origins on an operator allowlist (`ASBUILT_PREVIEW_ORIGINS`). There are no wildcards, credentials, query strings, literal IPs, `localhost` or `.local` names. Every DNS answer is checked; any private, reserved or mapped address rejects the request before a connection is made. The TLS socket is then pinned to the checked address. Redirects re-enter the same policy. Requests are bounded in count, size (5 MB each, 100 MB total) and time.

**Browser isolation.** Each check uses a fresh profile with no permissions or downloads, and service workers and WebSockets are blocked. External interactive pages run in a Docker container with `--network=none`, a read-only filesystem, all capabilities dropped, `no-new-privileges`, and memory, CPU and PID limits. No host mounts or environment variables are passed. Network access goes only through a broker in the parent process.

**Actions.** Only reviewed click, fill, select, navigate and menu actions run. Submit buttons, password fields, ambiguous controls and unreviewed destinations are refused. No purchases, submissions, sign-ins or deletions. Approval is separate for checks, actions and normal network traffic, and editing a plan clears approval.

**Integrity of results.** A pass requires an observation plus a screenshot. Blocked resources, script errors, HTTP errors and sign-in walls make a missing outcome Not verified, never Fail or Pass. Product coverage only counts runs whose recorded plan matches the frozen scenario exactly, on both viewports, with screenshots. Deleted or interrupted evidence never counts.

**GitHub.** It's a GitHub App with Contents and Pull requests read-only. Installation tokens are minted per request, narrowed to the one repository, and kept in memory only; they are never sent to the browser or the AI host. Posting a PR comment is off by default. Turning it on needs write permission, an operator setting, an exact preview, a single-use five-minute approval nonce matched to a hash of the comment, and an unchanged PR head. Page text in comments is rendered inert (see below).

**Test accounts and preview secrets.** A test account (`ASBUILT_TEST_EMAIL`/`ASBUILT_TEST_PASSWORD`) and Vercel's bypass secret come only from secrets or the environment, never from plans. They reach the browser worker over its private channel and never appear in plans, reports, results, summaries or comments; sign-in failure messages are tested not to echo them. The account is typed only into exactly one password-type field and one email field on the preview's own sign-in page, re-checked before every keystroke batch, so a page that redirects to another site gets nothing. Password fields are masked in screenshots. The bypass secret is sent only to the approved preview origin, checked per request; in browser-networking mode, AsBuilt fetches Vercel's bypass cookie itself and gives the browser only that cookie, for that origin.

**Secrets.** `.env`, keys, `.data/` and reports are git-ignored. The GitHub private key is read from a path outside the repo. Subprocesses get a minimal environment. API errors never include file paths, database details or tokens (`server/errors.ts`).

## Fixed in this release

| Issue | Severity | Fix |
| --- | --- | --- |
| API errors returned raw system messages, including absolute local file paths (e.g. `/Users/<name>/…/.data/product-<id>.json`) | Medium (information disclosure) | `publicError()` maps system and database errors to a generic 500 and missing items to 404; user-facing validation text is kept. Tested in `tests/errors.test.ts`. |
| Untrusted page text was pasted into PR comments as Markdown, so a site could inject @mentions, links, images or a fake "Approved" heading | Medium (content injection into your repository) | Observations and criteria are rendered as single inline code spans with backticks and newlines removed. Tested with a hostile payload in `tests/github-comments.test.ts`. |
| Posting to a repository the app had lost access to crashed with a `TypeError` | Low | Explicit "no longer has access" error. |
| Hosted product reviews had no storage cap | Low | Moot: the hosted version was removed. |
| Zod below 4.6.6 could exhaust memory on oversized collections ([GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)) | High (advisory) | Upgraded to Zod 4.6.7; removing the hosted Vercel packages also removed a second vulnerable copy. `pnpm audit --prod`: no known vulnerabilities (November 26, 2026). |
| A full artifact quota failed the whole check | Low (availability) | Screenshot upload is best effort and never changes results. |

### Test actions

Cart, checkout, order and payment-like steps are refused unless a check file lists each one under `testActions.approved` (visible in review), the workflow sets `allow-test-actions: true`, the plan targets a test environment with approved browser networking, and the page shows the plan's test-site marker immediately before each action. Sign-in labels can't be approved as test actions. The `testPayment` step fills only Stripe's public test card into frames served from js.stripe.com or checkout.stripe.com; card details are never read from a plan, and a stalled payment is reported as Not verified. A second test account's credentials come only from the `second-email` / `second-password` inputs and are typed only on the preview's sign-in page. Opening a link by pattern (`/*`) clicks only links on the preview whose address is exactly one segment under the reviewed prefix.

## Residual risks and limits

- **Single shared key.** Anyone with the key has full operator rights, including through MCP. There are no per-user identities, roles or audit log. Don't share the key, and don't expose the service publicly.
- **Normal browser networking** (`network:"browser"`) lets the page make its own requests, including writes. Use staging environments, test accounts and sandbox services. A preview URL doesn't prove database isolation.
- **Prompt injection** can still distort a *proposed* plan from the planning agent or an AI host. Human review of the plan is the control. The executor itself ignores page instructions (see EVALS.md, misleading-content scenario).
- **Local storage** is plain JSON files with owner-only permissions. It isn't encrypted at rest or tamper-evident. Screenshots may contain whatever the preview shows.
- **Signed-in runs** use normal browser networking, so the page, including any third-party scripts it loads, can see what's typed and can reach other public sites, as in any real browser or Playwright login test. Use a dedicated test account with no real data, payment methods or admin rights, on a test environment. Revoke it if it's ever exposed.
- **Plans from pull requests.** A PR can change `.asbuilt/*.json`, including asking for clicks or sign-in. Review plan changes like code. For forked PRs, GitHub withholds secrets and gives a read-only token, so fork PRs can't sign in or comment.
- **Dependencies:** 7 runtime packages after removing the hosted stack. `pnpm audit --prod` reports no known vulnerabilities (November 26, 2026). Run it before each release.

## Reporting a vulnerability

Please don't open a public issue. Use GitHub's private vulnerability reporting on this repository (Security → Report a vulnerability), and include steps to reproduce. Redact credentials, source code, screenshots and personal data.
