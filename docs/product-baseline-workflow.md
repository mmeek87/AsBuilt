# Living product baseline — implementation status

November 25, 2026. Submission work remains paused. This change adds baseline discovery records and linked revisions to AsBuilt; it is not a claim that autonomous whole-product discovery or transactional E2E testing is solved.

## Starting with an existing product

The host reads available user intent, documentation, source, existing tests and approved site observations. It records discovered functions, actors and connected journeys, including unsupported ones. Every discovered function maps to requirements or an explicit exclusion. Every outcome maps to checks or a gap. Code-only expectations must be marked inferred with uncertainty, which prevents a verified label.

The host presents a concise product understanding for correction rather than asking the user to write a specification. `establish_product_baseline` saves it. Available sources and unavailable history stay explicit. An AI's completion claim has its own source kind; it is not execution evidence.

## Later prompts

`get_product_context` returns the full saved spec and source excerpts. `revise_product_baseline` accepts the later request and a reconciled spec, writes an immutable child, preserves the parent and its run history, and requires explicit reasons for removed requirements. Discovered functions cannot silently disappear. New revisions begin untested so stale passing checks cannot certify changed behavior.

The Product coverage UI shows revision, parent navigation, changed requirements, functions, connected journeys and unresolved questions. Scenario execution retains existing approval/network restrictions. This change does not grant new payment/login capabilities or recover inaccessible chat history.

## Verification

- Eight product-review/MCP tests pass, including inferred expectations, missing discovery mappings, history preservation, stale evidence reset and unexplained removals.
- Four helper tests pass.
- TypeScript and Vite builds pass.
- Browser integration passes through local AsBuilt: establish existing-product baseline, run a real sample heading scenario, preserve delivery gap, revise expected heading, confirm new revision is untested, return to prior revision and see its retained evidence. Desktop/mobile overflow and automated axe checks pass.

The eBarrel context import in `.data/baseline-evaluation` preserves the previously reviewed 15 capability groups and historical CI/checkout evidence. It is an import of an earlier assistant synthesis, not a new complete repository review; no new eBarrel browser scenario ran. No historical suite counts become fresh baseline passes.

## Remaining product work

Prove the host-driven discovery workflow on a real existing project without manually supplying a prewritten feature map. Expand execution for authorized authenticated and transactional test journeys, with fixtures, credentials, data isolation and evidence capture. Validate follow-up impact selection and connect the intended deployment/revision to evidence. The current conservative revision behavior resets all current coverage; selective reuse is deliberately not claimed.

Changes are in the development workspace only. The installed service/plugin and Vercel deployment have not been updated by this change. Restarting an old installed service cannot expose these tools until the new code is installed.
