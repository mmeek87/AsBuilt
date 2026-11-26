# Changelog

## Unreleased: GitHub-only AsBuilt (November 26, 2026)

### New
- **GitHub Action** (`uses: mmeek87/asbuilt`): checks every preview deployment against `.asbuilt/*.json` plans on desktop and mobile, with screenshots, a job summary, and one PR comment that's updated on reruns. Free on public repositories; no AI calls.
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
- Added 22 unit tests (now 71 in total after the GitHub work) (product coverage, PR comments, GitHub errors, error mapping, blocker detection, helper) and 1 end-to-end test (product coverage with real runs, axe on desktop and mobile). Updated the MCP e2e tests to the 13-tool surface.
- `pnpm mcp:check-flow` drives the full product flow over MCP.
- Docs: SECURITY.md, EVALS.md, ARCHITECTURE.md, LAUNCH_READINESS.md, troubleshooting and env vars.

## 0.5.0 (local, previously unpublished)
- Product coverage: baselines, revisions, requirement maps, frozen scenarios and 7 MCP tools.

## 0.4.1
- Scoped verification and read-first planning. See git history for earlier versions.
