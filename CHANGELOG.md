# Changelog

## 1.2.0 (November 26, 2026)

### Payments with your provider, never a real card
- `testPayment` now works with Square, Braintree, Adyen and Paddle (not yet proven: Paddle says its checkout frame may block automation), plus `test-visa` for other sandboxes that accept the common 4111 test Visa. Stripe works as before.
- A check names the provider and the card fields' labels; AsBuilt types that provider's **published test card** from its own list (`server/test-cards.mjs`, with each provider's source). A real card can never be entered, because it isn't on the list.
- Fields are found by label or placeholder on the page and inside the provider's frames; every one must be the only visible match, or nothing is typed. Filling the form and pressing Pay are separate approved steps.

### Built with Lovable, Bolt or Replit
- The skill recognizes these projects, explains that the published address is the live site (look-only checks there), and offers the upgrade: connect the GitHub repository to Vercel or Netlify for a preview per change, with Preview pointed at test data.

## 1.1.0 (November 26, 2026)

Get to a first real result faster, and make the deeper checks easier to set up. Same check files and reports; nothing to rewrite. Use `mmeek87/AsBuilt@v1`.

### Faster first result
- **Start with checks that only look.** Your assistant's first checks need no test account, secrets or test site: what visitors see, and whether private pages (account, settings, admin) stay private, raised as questions.
- **Any host:** `examples/asbuilt-any-url.yml` checks one saved address (repository variable `ASBUILT_URL`) on every pull request and push, or any address from the Actions tab.

### Easier deep setup
- **No workflow editing for secrets.** The workflow templates pass every AsBuilt secret already; an unset one just means **Needs setup**. Add a secret and the next run uses it. Only `allow-test-actions` stays a deliberate edit.
- **Deeper checks checklist** in every comment until it's done ("2 of 3 ready"), each step linking straight to the right page in your repository: the New secret page, your workflow file.
- **Needs setup instead of a failed run.** A check that signs in without a test account, uses a second account without one, or takes cart and checkout steps without `allow-test-actions` is skipped and listed under **Needs setup** with the exact fix (including `gh secret set` commands). It no longer fails the run.
- **Test sites and branches, explained.** The skill finds out what you have, explains test sites, branches and secrets in plain words, and helps set them up; new help sections [Needs setup](https://mmeek87.github.io/AsBuilt/help/#needs-setup) and [Why you want a test site](https://mmeek87.github.io/AsBuilt/help/#test-site).
- **Local app unlocks from a link.** `pnpm start` prints a one-time unlock link (single use, 15 minutes) and the access key, so you don't have to find `.data/token`.

### Clearer results
- **Failures say what the page was doing.** After a step, a failure quotes busy signs it saw, for example "button “Verifying…” was disabled", so a stuck step reads as stuck.
- **Closest wording.** When exact text isn't found, the result quotes the closest heading, button, link or text it did see, so a reworded page is obvious.

### More you can check
- **Two-step sign-in for test accounts** (for example a test admin): `codeLabel` and `codeSubmit` in `signIn`, with the account's authenticator setup key as `test-totp-secret` / `second-totp-secret`.
- **A second account that only looks** (for example a store opening its Payouts page) no longer needs a test-action approval.

### Safer
- **Never on Production:** cart, checkout and order steps are refused when GitHub's deployment event says the deployment is Production, in addition to the page's test-site marker.
- **Pre-flight look at the site:** a Vercel preview behind Deployment Protection with no bypass secret is reported once under Needs setup (with the fix) instead of every check failing; a test-site marker missing from the page is flagged as a heads-up.
- **Approvals as buttons:** the skill asks for approvals as clickable choices where the assistant supports them, with cart, checkout and order steps asked separately.

### Changed
- Up to **60 check files** per run (was 10). The run's time limit now defaults to about two minutes per check file, at least 10 (set `timeout-minutes` to override).
- A standing approval in `.asbuilt/settings.json` now applies only where the workflow sets `allow-test-actions: true`. Before, it could turn ordinary checks into test-action checks in a workflow without the switch, which then couldn't run.

## 1.0.0 (November 26, 2026)

First release. Use `mmeek87/AsBuilt@v1`.

### New since the GitHub-only pass
- **Feature map** (`.asbuilt/features.json`): your assistant maps every feature from the code; each PR comment shows coverage and the unchecked features.
- **Help for every Not verified result**, linked from the comment; issue forms; Discussions; a privacy and support page.
- **Test actions on a test site:** approve cart, checkout and order steps (one by one, or once for the whole test site in `.asbuilt/settings.json`). They run only with `allow-test-actions: true` in the workflow and while the page shows your test-site marker.
- **Test payments** with Stripe's public test card inside Stripe's frame; card details never come from a check file.
- **A second test account** (for example a store), opening the newest matching record (`.../orders/*`), `check`, `reload`, and `remember` to carry a value such as a pickup code between accounts.
- **Verified end to end on eBarrel's test site:** pay, store picks and marks ready, buyer sees the pickup code, store verifies it, buyer sees it collected (18/18 on desktop and mobile).

### Fixed (found on eBarrel's test site)
- Sign-in: re-types if a loading page wipes the form; waits for background sign-in; ignores empty alert regions (Next.js route announcer); survives the app's own redirect; quotes the site's error; signs in once per run and reuses the session.
- Browser networking: idle connections no longer cut after 15 s; IPv4 preferred (GitHub runners can't reach IPv6); pages see the browser as online.
- A check file that can't run now gets a PR comment explaining why.
- Screenshots retry on busy pages.

## Unreleased: GitHub-only AsBuilt (November 26, 2026)

### New
- **GitHub Action** (`uses: mmeek87/AsBuilt@v1`): checks every preview deployment against `.asbuilt/*.json` plans on desktop and mobile, with screenshots, a job summary, and one PR comment that's updated on reruns. Free on public repositories; no AI calls.
- **Fix prompt** in the PR comment: one copy-ready prompt covering every mismatch.
- **One plan file per feature:** every PR rechecks every feature, catching regressions.
- **Test-account sign-in** before journeys (accounts only from secrets; typed only on the preview; passwords masked).
- **Protected Vercel previews** via the automation bypass secret.
- **One-step setup** through the assistant skill (plugin 0.4.0).
- **CI and live acceptance** on GitHub runners, against a fictional test shop on GitHub Pages.

### Changed
- Failing journeys report in about 6.5 s instead of 22 s, with no accuracy loss (new slow-render eval scenario).
- 401 and 403 pages say "protected or needs sign-in" and how to fix it.
- Screenshot upload is best effort; a full storage quota never changes results.
- Zod 4.6.7; `pnpm audit`: no known vulnerabilities.

### Removed
- The hosted Vercel deployment (server/cloud, api/, cloud scripts), its database and storage packages, and its docs.


## Unreleased: launch-readiness pass (November 26, 2026)

### Verification integrity
- Sign-in walls and HTTP error pages now make a missing outcome **Not verified** with a plain explanation, instead of a Fail that implied the feature was broken. Applies to journey, interactive and static runs.
- Product coverage no longer hides a failed check behind "Unclear expectation". It's flagged and counted.
- New eval suite (`pnpm eval`): 8 controlled builds, including a login wall, an outage, misleading hidden content and a flaky server. Result: 96/96 correct verdicts, 0 false passes, reproducible. See EVALS.md.

### Fixes
- Interactive and journey sample runs no longer end "interrupted" when Playwright browsers are installed outside the default location.
- API errors no longer expose local file paths or internals, and use correct status codes (404, 413, 500).
- `pnpm mcp:check` now works with a custom data folder or port.
- The plugin helper reports the correct size limit for product commands and lists all commands.

### GitHub
- Pull request planning now considers the PR's changed files (shown in the plan screen; not treated as evidence).
- Clear messages for expired keys, missing repository access, private repos, rate limits and outages.
- PR comments render page text inertly (no injected mentions, links or headings) and lead with a pass, fail and not-verified count.

### Product coverage screen
- Leads with "N of M requirements verified" and what needs attention.
- Focus management, loading announcements, distinct button names and plain labels.

### Tests and tooling
- Added 22 unit tests (now 72 in total after the GitHub work) (product coverage, PR comments, GitHub errors, error mapping, blocker detection, helper) and 1 end-to-end test (product coverage with real runs, axe on desktop and mobile). Updated the MCP e2e tests to the 13-tool surface.
- `pnpm mcp:check-flow` drives the full product flow over MCP.
- Docs: SECURITY.md, EVALS.md, ARCHITECTURE.md, LAUNCH_READINESS.md, troubleshooting and env vars.

## 0.5.0 (local, previously unpublished)
- Product coverage: baselines, revisions, requirement maps, frozen scenarios and 7 MCP tools.

## 0.4.1
- Scoped verification and read-first planning. See git history for earlier versions.
