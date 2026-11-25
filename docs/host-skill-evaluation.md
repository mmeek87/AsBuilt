# Host-assistant workflow evaluation

This evaluation is conducted in the existing Codex conversation using the
updated AsBuilt skill. It is assisted and not blind: the assistant knows the
controlled defects. It does not validate installation or behavior in a fresh
Claude or ChatGPT session.

## Requirement record

Source: `tests/fixtures/requirements/brief.md`, kept separate from the build.

| Requested outcome | Plan check IDs | Coverage limit |
| --- | --- | --- |
| Choose Ontario | region | Checks visible selected-region text after the reviewed click |
| Open Maple Market | store | Checks its heading and exact reviewed URL |
| Region must remain Ontario when visiting the store | retained-region | Checks visible state after navigation; not server-side persistence |
| View the store's Notebook | product | Checks title and exact reviewed URL |
| Notebook identifies Maple Market as seller | seller | Checks displayed seller; not inventory ownership in a database |
| Show In stock | stock | Checks displayed stock; not actual inventory or purchase availability |

The brief does not promise successful checkout or stock reservations, so neither
is inferred from these checks. Requiring region retention on every future page
would expand the supplied brief; this plan tests the explicitly requested store
transition. No clarification is needed for the stated region or seller.

## Applying the skill

- Expected outcomes come from the brief. Discovery supplies names and routes.
- The host assistant authored the plan; AsBuilt supplies execution evidence.
- The plan remains unchanged for correct, wrong-seller and lost-region builds.
- Opening the right store does not satisfy the separate state-retention requirement.
- A visible mismatch is reported without claiming a database or code-level root cause.
- Subsequent checks are not treated as passes when a journey stops.
- No paid model calls, personal profiles or live sites are involved.

Automated execution is in `tests/requirements-benchmark.test.ts`; local evidence
is saved under `.data/requirements-benchmark/`. This exercises the executor and
illustrates the skill workflow. It does not establish that an unfamiliar host
assistant will independently select these checks. That requires a separate
fresh-session evaluation with defect details withheld.

## Observed results, November 25, 2026

| Build | Pass | Fail | Not verified after stop |
| --- | --- | --- | --- |
| correct | 12 | 0 | 0 |
| wrong-seller | 8 | 2 | 2 |
| lost-region | 4 | 2 | 6 |

Both automated benchmark tests and TypeScript validation passed. All three
reports record the same plan SHA-256. Results cover desktop and mobile Chromium.
