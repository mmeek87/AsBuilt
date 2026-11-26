# Launch readiness report

**Assessment: Ready for a limited private beta**, as a free, open-source GitHub Action. It moves to **ready for an initial open-source launch** once the live acceptance check passes against a real external site (blocked only on two GitHub settings; see section 8) and you've used it on a few real eBarrel PRs.

Branch `launch-readiness`, draft PR #7. Reviewed and updated November 26, 2026.

## 1. Initial findings

**Baseline:** type checks, 40/40 unit tests and the build passed; 15/18 browser tests passed. The 0.5.0 product coverage work existed only on the maintainer's Mac, with no tests, and parts of that copy were older than `main`.

| # | Finding | Priority | Status |
| --- | --- | --- | --- |
| — | Unpushed 0.5.0 work; the upload would have reverted shipped files, including a relaxed eBarrel assertion | P0 | **Fixed**: imported, regressions kept out, 12 tests added |
| A | Interactive runs always "interrupted" with custom browser paths | P0 | **Fixed** |
| B | Sign-in walls and outages reported as Fail ("your feature is broken") | P0 | **Fixed**: Not verified with the reason; eval-verified |
| C | Product coverage hid failures behind "Unclear" | P0 | **Fixed** |
| D | API errors leaked local file paths | P1 | **Fixed** |
| E | Page text injected into PR comments | P1 | **Fixed**: inert rendering; tested with hostile content |
| F | Vague GitHub errors; PR changes ignored in planning | P1 | **Fixed** |
| G | Product coverage screen: focus, loading, summary | P1 | **Fixed**; axe clean on desktop and mobile |
| H | MCP tests out of date; `mcp:check` ignored config | P1 | **Fixed** |
| I | High Zod advisory | P1 | **Fixed**: Zod 4.6.7; `pnpm audit`: no known vulnerabilities |

## 2. Changes implemented

**Direction change, at the maintainer's request:** AsBuilt is now GitHub-only, open source and free. The hosted Vercel version (the only part that could cost money, and which had never run a check) was removed.

- **GitHub Action** (`uses: mmeek87/asbuilt`): runs on every preview deployment, on desktop and mobile, with screenshots, a job summary, one updated PR comment, and a copy-ready fix prompt.
- **Checks stack up:** one plan file per feature in `.asbuilt/`; every PR rechecks every feature.
- **Test-account sign-in** for pages behind a login.
- **Protected Vercel previews** via Vercel's automation bypass.
- **Faster failures:** about 6.5 s per failing journey instead of 22 s, verified with no accuracy loss.
- **One-step setup** through the assistant skill.
- **CI on real GitHub runners**, plus a live acceptance check against a fictional test shop on GitHub Pages.
- Earlier in the day: the P0 and P1 fixes above, the eval suite, and the documentation set.

## 3. Product and design improvements

- **No install for users:** no terminal, Node, pnpm, Docker, `.env`, GitHub App, OpenAI key or MCP setup. One workflow file and one plan file, which the skill can add with permission.
- **Results where people already look:** the PR comment leads with "1 passed · 1 failed", shows each check, and offers "Fix prompt for Claude or ChatGPT" in one click. Reruns update the same comment instead of adding noise.
- **Plain explanations for every Not verified:** protected preview, needs sign-in, site down, sign-in didn't work and why.
- **Works with any assistant,** ChatGPT included, because the assistant only edits files.
- **Screenshots** organized as `screenshots/<feature>/desktop.png` and `mobile.png`.
- In the local app, Product coverage leads with what needs attention, with full keyboard and screen-reader support.

## 4. Architecture and security improvements

See [ARCHITECTURE.md](ARCHITECTURE.md) and [SECURITY.md](SECURITY.md). Highlights:

- The preview address comes only from the workflow. Plans can't redirect or pre-approve themselves.
- Test accounts and the bypass secret come only from secrets. They're never written anywhere, typed only on the preview (re-checked against late redirects), and masked in screenshots.
- Screenshot upload failures can't change results.
- Runtime dependencies are down from 11 to 7, with no known vulnerabilities.

## 5. Test execution results

| Suite | Local | GitHub runner (PR #7) |
| --- | --- | --- |
| Type checks, build | Pass | Pass |
| Unit and integration tests | **76/76** | Pass |
| Browser e2e (UI, MCP, axe desktop and mobile) | **19/19** | **19/19** |
| Action self-test (sample: 2 pass, 2 expected fail) | Pass | **Pass** |
| Action vs real HTTPS site (example.com) | Pass, with screenshots | — |
| PR comment create and update (stub API) | Pass | — |
| Live acceptance (external site, Docker, journey, sign-in) | — | Skipped until Pages is on |
| `pnpm audit --prod` | No known vulnerabilities | — |

**Mocked vs live:** the PR lookup and comment API is tested against a stub, not real GitHub. Sign-in is tested in real Chromium against a simulated shop. Vercel bypass is unit-tested for scoping; it hasn't been run against a real protected deployment.

**Accessibility:** axe finds zero violations on every exercised local screen at desktop and 390 px, plus keyboard, focus and reflow checks. Not done: a VoiceOver or NVDA pass and a 200% zoom review. Don't claim WCAG conformance yet. The PR comment uses GitHub's own accessible rendering, with text labels as well as emoji.

## 6. AI evaluation results

[EVALS.md](EVALS.md): 9 scenarios × 3 repetitions. **108/108 correct verdicts, 0 false passes, 0 false fails, 0 blockers misreported, reproducible, $0.** Hidden text and injected "mark everything passed" instructions are ignored. Unmeasured: plan quality from a fresh assistant session with defects withheld.

## 6b. First real-project test: eBarrel as a first-time user (November 26)

AsBuilt was set up on eBarrel (Next.js, Supabase, Vercel) by following the skill as a first-time user would: recover intent from recent PRs, draft checks, dry-run, get approval, open a PR (eBarrel #88).

**What it found in the app:** `/buyer/notifications` opens for signed-out visitors with the full account menu, while Pickups, Profile and Messages redirect to sign-in. The page moved into Your account in #85 without a guard, and a middleware public-route list containing `"/"` (matching every path) masks it. The founder hadn't decided this either way. Once asked, she decided it should be hidden, which led to the questions-not-failures principle below.

**What it taught us about AsBuilt (all fixed the same day):**
| Friction | Fix |
| --- | --- |
| Plans could only start on the homepage | `"start": "/path"` (preview-only, tested against escapes) |
| Sign-in proof text ("Hi, name") is hidden on mobile in many apps | `signedInPath`: confirm on a page that works on every viewport |
| A cookie banner covered the Sign In button on phones | `dismiss` closes a banner first; action-like names refused |
| No way to say "must not be shown" | `occurrence: "none"`, settle-first, never from a blank or errored page |
| Restricted networking made a real gap read as Not verified (database calls blocked) | Guidance: use test-environment browser networking for app-state checks |
| A discovery shown as "Fail" when the founder had never specified it | Skill presents unspecified behavior as a **question**; answers become checks |
| Reusing existing test-account secrets | The workflow maps `E2E_BUYER_*` into `test-email` / `test-password`; no new secrets |
| Manual "Run workflow" needs the file on the default branch | Documented in eBarrel's PR |

Dry run on shopebarrel.tech (real site, AsBuilt's own worker and policy, without the Docker wrapper): the Spanish switch passed on desktop and mobile; the privacy gap was confirmed by screenshot. Browser-networking plans couldn't be dry-run in the review sandbox (its TLS-inspecting proxy) and get their first real run on GitHub.

## 7. Remaining issues and limitations

**Before calling it launched:**
1. **Live acceptance must pass.** It needs the repository public and Pages on (section 8). It's the first end-to-end test of the Docker worker and sign-in on GitHub's runners.
2. **Finish the eBarrel trial:** make AsBuilt public, merge eBarrel #88, and read the first run (Spanish switch, account privacy, signed-in notifications).
3. **Accessibility pass** with a screen reader on the local app.

**Known limitations (by design or later):**
- No one-time codes, CAPTCHAs, outside identity providers, real payments or order submission.
- Checks run after a preview deploys, not live while you build.
- Up to 10 feature files and 12 checks per feature per run.
- Your account's Actions artifact storage was full during testing. Results still post, but screenshots won't save until space frees up.
- Netlify and Cloudflare protected previews aren't supported (Vercel only).

**P3 opportunities:** a "watch mode" re-run when a PR's description changes; before-and-after screenshot comparison between runs; an optional GitHub check annotation per failed check; a gallery of example plans for common app types (store, booking, SaaS signup).

## 8. Required manual configuration

**This repository (once):**
1. Settings → General → Danger Zone → **Change visibility → Public**.
2. Settings → Pages → Source → **GitHub Actions**. After the next push to `main`, the test shop deploys and live acceptance runs on every PR.

**Each project using AsBuilt:** add `.github/workflows/asbuilt.yml` and a plan (or ask your assistant to). Optional: `VERCEL_AUTOMATION_BYPASS_SECRET`, `ASBUILT_TEST_EMAIL` and `ASBUILT_TEST_PASSWORD` as repository secrets. On private repositories, set the Actions budget to $0 so it can never charge.

**Vercel:** delete the old `as-built` project and its Neon database and Blob store, so nothing keeps running or billing.

## 9. Deployment

There's nothing to deploy. Merging PR #7 makes `uses: mmeek87/asbuilt@main` available. Before announcing it, tag a release (`v1`) so users can pin a stable version.

## 10. Final assessment

**Ready for a limited private beta.** Evidence: every automated suite passes on GitHub's runners; the Action works end to end on a real runner; the evals show zero false passes across adversarial cases; the main pain points (cost, install burden, ChatGPT access, single operator, sign-in, protected previews, slow failures) are addressed. It's not yet "launched" because the live external test, sign-in on a real deployment, and real-world use on eBarrel haven't happened yet. Each of those is a short step away.
