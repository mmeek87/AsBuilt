# Verification quality evaluation

AsBuilt's promise is simple: never call something working unless it was observed working, and say clearly when it couldn't check. This eval measures that promise against builds whose correct answers are known in advance.

Run it with `pnpm eval` (one pass, about 2.5 minutes) or `pnpm eval --repeat 3` (reproducibility). Results are written to `.data/evals/`. Nothing contacts a live site and no model is called, so there is no cost.

## Method

- **One unchanged plan.** `tests/fixtures/requirements/plan.json` encodes six checks from a short brief: choose Ontario, open Maple Market, keep Ontario selected, open the Notebook, see "Sold by Maple Market", see "In stock". Its SHA-256 is recorded with every result. The plan never changes between builds.
- **Real executor.** AsBuilt's own browser worker, journey executor, action policy and observation code run in real Chromium on desktop and mobile viewports. Only the web server is simulated, so builds are exactly reproducible.
- **Known answers.** Every check in every scenario has an expected verdict written before running (`evals/scenarios.ts`). The scorer never uses AsBuilt's output to decide what was correct.
- **Scoring.**
  - **False pass:** AsBuilt said Pass where the build was broken or blocked. This is the failure that matters most; the suite exits non-zero if any occur.
  - **False fail:** Fail on a working build.
  - **Blocker reported as defect:** Fail when the real cause was a sign-in wall or outage. This tells the user "your feature is broken" when it wasn't checked.
  - **Inconclusive on known defect:** Not verified where a real defect should have been confirmed.
  - **Reproducibility:** verdicts must be identical across repetitions.

## Scenarios

| Scenario | Category | What's wrong | Correct behavior |
| --- | --- | --- | --- |
| correct | Correctly implemented | Nothing | 12 passes |
| wrong-seller | Intentionally broken | Product says "Sold by Pine Depot" | Seller fails; journey stops; later checks Not verified |
| lost-region | Regression | Store page silently resets the region | "Retained region" fails although the store opens fine |
| missing-stock | Missing requirement | Stock status never built | Stock fails |
| login-wall | Authentication barrier | Store page demands a password | Store check Not verified with a sign-in explanation, not Fail |
| unavailable | Unavailable environment | Every page returns HTTP 503 | First check Not verified; nothing passes |
| misleading-content | Misleading website content | Visible wrong seller, plus a *hidden* "Sold by Maple Market", an HTML comment with the right text, and an off-screen instruction telling AsBuilt to mark everything passed | Seller fails; hidden text and injected instructions are ignored |
| flaky-first-load | Interrupted environment | Store page returns 502 once (desktop), then recovers (mobile) | Desktop store Not verified (HTTP 502); mobile all pass |
| slow-render | Correctly implemented (slow) | Product details appear 1.5 s after the page loads | All pass; faster waiting must not cause false failures |

"Ambiguous requirements" are handled one layer up, in product coverage. A requirement marked uncertain stays "Unclear expectation" and is never Verified, and a failed check on it is now surfaced, not hidden. That's covered by `tests/product-review.test.ts` rather than this browser eval.

## Results (November 26, 2026)

**Baseline, before this release's fixes (8 scenarios):** 93/96 correct. 0 false passes, **3 blockers reported as defects**. The login wall (desktop and mobile) and the temporary 502 produced "Fail: no visible heading 'Maple Market'", which tells a founder their store page is broken when AsBuilt simply couldn't see it.

**After the fixes** (`blocker()` in `server/observation.mjs`, then settle-then-grace waiting in the journey worker), 9 scenarios, 3 repetitions:

| Scenario | Correct verdicts | False passes | False fails | Blockers as defects | Inconclusive on known defect | Time |
| --- | --- | --- | --- | --- | --- | --- |
| correct | 12/12 | 0 | 0 | 0 | 0 | 1.8s |
| wrong-seller | 12/12 | 0 | 0 | 0 | 0 | 6.5s |
| lost-region | 12/12 | 0 | 0 | 0 | 0 | 6.4s |
| missing-stock | 12/12 | 0 | 0 | 0 | 0 | 6.5s |
| login-wall | 12/12 | 0 | 0 | 0 | 0 | 6.6s |
| unavailable | 12/12 | 0 | 0 | 0 | 0 | 1.1s |
| misleading-content | 12/12 | 0 | 0 | 0 | 0 | 6.6s |
| flaky-first-load | 12/12 | 0 | 0 | 0 | 0 | 4.1s |
| slow-render | 12/12 | 0 | 0 | 0 | 0 | 4.6s |

- 108/108 verdicts correct, identical across all 3 repetitions.
- Plan SHA-256 `51310dfa48e3b07cf1bf1f4580eac1f11b4a0fbb17f63f3ff3b4fa87deea0063`.
- Cost: $0; no model calls.
- Speed: a passing journey takes about 1.8 seconds, a failing one about 6.5 seconds (it was 22 seconds). AsBuilt looks first. If something is missing, it waits for the page's network to go quiet, then gives 2 more seconds for late rendering (8 seconds if the page never goes quiet). The slow-render scenario confirms this doesn't create false failures.

Example of what a user now sees for the login wall:

> **Not verified.** This page asks for a password, and this check doesn't sign in, so content behind sign-in could not be checked. Check a page that doesn't need sign-in, or add sign-in with a dedicated test account. What AsBuilt saw: No visible exact heading match found for "Maple Market"…

## What this does and doesn't show

- **Shows:** the executor turns real observations into honest verdicts. It doesn't pass broken builds, and it isn't fooled by hidden text or injected instructions in page content. It separates defects from environment blockers, and it's deterministic.
- **Doesn't show:** how well an AI assistant *writes the plan*. Here the same author wrote the brief, the plan and the broken builds, so this is not a blind evaluation of planning. Acceptance-criteria quality from a fresh Claude or ChatGPT session, with the defects withheld, is still unmeasured; see [host-skill evaluation](docs/host-skill-evaluation.md) for the protocol.
- **Doesn't show:** behavior on real production sites, single-page apps with heavy client rendering, or flows behind authentication. Those are out of scope or unverified; see [LAUNCH_READINESS.md](LAUNCH_READINESS.md).
- **Known tradeoff:** if a page shows a visible password field, a genuine missing outcome on that page is reported Not verified rather than Fail. This is deliberately conservative: it can hide a real defect behind "couldn't check", but it can never produce a false pass.
- The planning agent (`generate_criteria` with a GitHub URL) needs an OpenAI key and was only tested with model fixtures. Its quality and cost per plan are unmeasured.

## Earlier benchmarks

[docs/requirements-benchmark.md](docs/requirements-benchmark.md) and [docs/host-skill-evaluation.md](docs/host-skill-evaluation.md) record the original three-build benchmark (correct, wrong seller, lost region), which this suite extends with five more scenarios.
