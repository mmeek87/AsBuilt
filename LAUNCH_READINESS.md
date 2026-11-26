# Launch readiness report

**Assessment: Ready for a limited private beta.** That means you can dogfood it on eBarrel now. Invite other builders once the three pre-beta items below are done. **Not ready for a public launch.**

Branch `launch-readiness` (11 commits on top of `main` at 5055372). Reviewed November 26, 2026.

## 1. Initial findings

**What I reviewed.** The full repository on GitHub (`main`, 0.4.1), the local 0.5.0 project you supplied, the 0.3.2 plugin package, all docs, and your original intent in the ChatGPT conversation: find gaps between what you meant to build and what actually works, as a Claude and ChatGPT plugin with GitHub integration, usable by nontechnical people.

**Baseline before changes.**

| Check | Result |
| --- | --- |
| Type check (client + server) | Pass |
| Unit tests | 40/40 pass |
| Production build | Pass |
| Browser e2e | 15/18 pass. 3 interactive and journey tests ended "interrupted" (finding A) |

**Key findings, by priority.**

| # | Finding | Priority |
| --- | --- | --- |
| — | The 0.5.0 product coverage feature (7 MCP tools, a screen, ~1,000 lines) existed only on your Mac and was never pushed. It also had **zero tests**. Your upload was built on an older base for 8 shared files, which would have reverted shipped work, including relaxing an exact eBarrel seller check to "contains" (the exact anti-pattern AsBuilt forbids). | P0 (data integrity, repo state) |
| A | Interactive sample runs always "interrupted" when browsers are installed in a custom location: the worker's environment dropped `PLAYWRIGHT_BROWSERS_PATH`. | P0 (broken core flow in CI and containers) |
| B | A sign-in wall or temporary 502 was reported as **Fail**, i.e. "your feature is broken", when AsBuilt simply couldn't see the page. Found by the new eval suite. | P0 (inaccurate results) |
| C | Product coverage hid failed checks behind "Unclear expectation". | P0 (inaccurate results) |
| D | API errors leaked absolute local file paths, with wrong status codes. | P1 (security) |
| E | Untrusted page text was pasted into GitHub PR comments as live Markdown. | P1 (security) |
| F | GitHub errors were generic ("GitHub returned 404"), and PR planning ignored which files changed. | P1 (GitHub) |
| G | Product coverage screen: no focus management, no loading state, didn't lead with what needs attention. | P1 (UX, a11y) |
| H | MCP e2e tests out of date for 13 tools; `mcp:check` ignored custom config. | P1 (MCP) |
| I | One high dependency advisory (Zod < 4.6.6). | P1, open |

**What was already strong:** SSRF defense (pinned DNS, exact allowlist), Docker isolation, the approval model (approval can't come from saved files), GitHub least-privilege tokens, approval-nonce PR comments, honest limitation text throughout, and a calm, accessible UI with axe checks on most screens.

## 2. Changes implemented

| Commit | Change |
| --- | --- |
| 30ba219 | Import local 0.5.0 product coverage; keep `main`'s newer versions of 8 regressed files |
| 9992fc2 | Fix A (worker browser path; secrets still never forwarded) |
| f17c40a | 12 product coverage tests; fix C |
| 47a7381 | Fix E and F: inert PR comments, changed files for planning, plain-language GitHub errors |
| fe3e539 | Fix D: `publicError()` for local and hosted servers |
| 48f550f | Fix G: product coverage leads with attention items; focus, loading, labels; new e2e test |
| b1fe032 | Helper size messages and usage text; hosted review cap |
| d553d9d | Fix `mcp:check`; add `mcp:check-flow` |
| 6fb3e62 | MCP e2e asserts all 13 tools and safety annotations |
| 36827ea | Fix B: blocker detection in all runners; eval suite |
| (docs) | SECURITY, EVALS, ARCHITECTURE, CHANGELOG, this report, README, `.env.example` |

## 3. Product and design improvements

- Results speak plain language about blockers: "This page asks for a password. AsBuilt never signs in…" instead of "No visible heading."
- Product coverage opens with "1 of 3 requirements verified" and a short list: didn't behave as described, needs your confirmation, not checked yet.
- Source labels a founder understands: "AI builder's claim (not evidence)" and "Must work".
- PR comments lead with "1 fail · 1 not verified" and explain that Not verified is not a pass.
- PR plans show which files changed, collapsed by default.

**Not changed, but worth deciding (product):** installation needs a terminal, Node 24, pnpm, `git clone`, and Docker for interactive previews. That's a real barrier for the stated audience of nontechnical founders. See section 7.

## 4. Architecture and security improvements

See [SECURITY.md](SECURITY.md) and [ARCHITECTURE.md](ARCHITECTURE.md). In short: error responses can't leak internals; PR comments can't be hijacked by page content; blockers can't masquerade as defects; the hosted product store is bounded; and the worker environment is allow-listed and tested to exclude secrets. No architecture was rewritten. The existing design is sound for its single-operator scope.

## 5. Test execution results (final run)

| Suite | Result |
| --- | --- |
| `tsc` client and server | Pass |
| `pnpm test` (unit and integration, some in real Chromium) | **62/62 pass** (was 40) |
| `pnpm test:e2e` (UI, auth, MCP HTTP and stdio, axe desktop and mobile) | **19/19 pass** (was 15/18) |
| `pnpm build` | Pass |
| `pnpm mcp:check` | Ready, 13 tools, service 0.5.0 |
| `pnpm mcp:check-flow` | Baseline saved; invented citation refused; unapproved run refused; approved run complete; coverage correct; screenshots on both viewports |
| `pnpm eval --repeat 3` | 96/96 correct, 0 false passes, reproducible |
| `pnpm audit --prod` | 1 high (Zod), open |

**Mocked vs live.** GitHub (App tokens, PR files, comments) is tested **only with mocked API responses**. The planning agent is tested **only with model fixtures**. Browser verification is **real** (Chromium) against local fixtures. MCP is **real** (SDK client over HTTP and stdio), and your Claude desktop app is connected to your local service and answering (confirmed by a live status call during this review). No live preview site was contacted during this review.

**Accessibility.** Automated: axe reports zero violations on every exercised screen at desktop and 390 px. Plus keyboard reachability, focus order, no horizontal overflow, and reduced motion in CSS. Manual: product coverage screenshots reviewed (this caught a wrong count, now fixed). **Not done:** screen-reader testing with VoiceOver or NVDA, 200% zoom review, and a full WCAG 2.2 AA audit. Don't claim conformance yet.

## 6. AI evaluation results

See [EVALS.md](EVALS.md). The executor scored 93/96 before this release, with 3 blockers reported as defects, and **96/96 after**, with zero false passes across 3 identical repetitions and $0 model cost. It ignored hidden text and an injected "mark everything passed" instruction. **Unmeasured:** plan quality from a fresh Claude or ChatGPT session with defects withheld, and planning-agent quality and cost.

## 7. Remaining issues and limitations

**Pre-beta (do before inviting others):**
1. **Verify GitHub live.** Install the App on a throwaway test repo, plan from a real PR, and post one approved comment. The integration is only mock-tested.
2. **Upgrade Zod to v4** (high advisory) and rerun all suites.
3. **Push this branch** and decide whether the 0.5.0 import is the version of record. Your Mac's running service is still the old 0.5.0 code without these fixes.

**Known limitations:**
- **ChatGPT web isn't supported.** ChatGPT and Claude custom connectors call MCP servers from their own cloud and need a public HTTPS URL, and ChatGPT expects OAuth. Works today: Claude Desktop, Claude Code and Codex.
- **Single operator, single project list.** One key, one GitHub installation, a shared 200-report history, and sites added by editing config and restarting.
- Interactive external previews need Docker. No sign-in flows, checkout or form submission (by design).
- A genuine defect on a page with a visible password field is reported Not verified (conservative).
- A failing journey takes about 22 seconds because of a 10-second wait per viewport.
- Real external preview acceptance relies on earlier runs recorded in `docs/navigation-baseline.md`. It wasn't re-run here.

**P3 opportunities (not built, by design):** project grouping for multiple apps; one-click install (desktop extension or hosted beta) for nontechnical users; OAuth hosted connector for ChatGPT; scheduled re-verification on PR updates; run-to-run comparison. No billing, org management or analytics.

## 8. Required manual configuration

- `.env` from `.env.example`: `ASBUILT_PREVIEW_ORIGINS` (your staging site), optional `ASBUILT_PUBLIC_READONLY_ORIGINS`.
- GitHub App: Contents read and Pull requests read (README → "Register a least-privilege GitHub App"); `GITHUB_*` vars; PEM file outside the repo.
- Optional: `OPENAI_API_KEY` and `ASBUILT_MODEL` for the planning agent; `GITHUB_ALLOW_COMMENTS=true` plus write permission for PR comments.
- Docker image `asbuilt-browser:local` for interactive previews (docs/phase2.md).
- MCP host config for Claude Desktop or Claude Code (README → MCP).

## 9. Deployment instructions

Local (recommended): `pnpm install --frozen-lockfile && pnpm exec playwright install chromium && pnpm build && pnpm start`, then open `http://127.0.0.1:4310` with the key in `.data/token`. To update your Mac, pull this branch into your checkout, rerun the same commands, and restart the service. Your `.data` folder is untouched. Hosted (single operator, optional): [docs/vercel.md](docs/vercel.md). Nothing was deployed or pushed during this review.

## 10. Final assessment

**Ready for a limited private beta.**

Evidence for: the complete core loop (intent → reviewable checks → approved run → evidence → coverage → rerun) works end to end in the UI and over MCP, and is tested. Results are grounded in real execution, and evals show zero false passes, including adversarial content. Failures and blockers are reported accurately. All automated suites and the production build pass.

Evidence against a public launch: GitHub is only mock-verified; a high-severity dependency advisory is open; ChatGPT web can't connect; setup needs developer tools; and there's no screen-reader audit.
