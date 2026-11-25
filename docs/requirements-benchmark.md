# Requirement-versus-build benchmark

The requirement is stored separately in `tests/fixtures/requirements/brief.md`:
choose Ontario, retain it when opening Maple Market, and show a Notebook sold
by Maple Market with stock availability. The reviewed plan is in the adjacent
`plan.json`; its SHA-256 is recorded in both reports and checked after execution.

A local synthetic implementation has two versions. Both load and navigate;
the broken version identifies Pine Depot as the seller instead of Maple Market.
The identical plan is passed through AsBuilt's real browser worker, journey
executor, action policy and observation code. Only page transport is supplied
by the test harness; DOM behavior, clicks, local storage, navigation and assertions
run in real Chromium. No live website or paid model is involved.

## Observed outcome

- Correct build: 12 passes, six checkpoints on each of two viewport sizes.
- Broken build: eight passes, two seller failures, two subsequent stock checks
  not attempted because the journey stopped at the first non-passing checkpoint.
- Product-page screenshot inspected: Pine Depot is visibly identified as seller.
- No expected values were changed between variants.
- The benchmark test and TypeScript check passed. An initial sandbox-blocked
  browser startup failed before the benchmark could run; host permission was
  then used for the same local test.

Run with `node --import tsx --test tests/requirements-benchmark.test.ts`.
Local reports and screenshots are under `.data/requirements-benchmark/`.
The test's overall pass means the verifier correctly accepted the good build
and rejected the bad build; it does not mean the bad build passed verification.

## Meaning for the product

This validates requirement-based defect detection in the executor. It is not
a blind evaluation of an AI planner: the same assistant authored the brief,
plan and controlled implementation variants. A future host-assistant evaluation
must give Claude or ChatGPT the brief and public test interface, withhold mutation
labels and implementation from planning, and score whether its approved plan
finds the mismatch without hints. The skill should preserve original requirements
as the source of expected outcomes, using page discovery only to locate controls
and collect evidence. Host-authored planning and execution evidence must remain
clearly distinguished.
