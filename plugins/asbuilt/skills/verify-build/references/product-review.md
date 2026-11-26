# Product-wide verification

Use this workflow when asked whether an AI-built product meets the original request. The assistant performs the synthesis using its existing conversation and connected tools; the user should not write the map or selectors.

1. Recover available intent first: original requests, later corrections, specifications, product docs and change notes. Inventory accessible and missing sources. Read connected implementation paths AND end-to-end tests together before making findings. Record existing tests as `existing_test`, previous CI output as `historical_result`; neither is fresh evidence. Do not infer access to other private chats. Follow relevant references rather than reading secrets or unrelated files for apparent completeness.
2. Build a product-wide map of actors, capabilities and observable outcomes. Include important happy paths, alternate/error paths and persistence boundaries supported by the actual requirements. Current user corrections outrank stale documentation. Record resolutions in `decisions`; unresolved intent in `uncertainty`. Cite captured source excerpts with exact 1-based lines. Code/tests can inform navigation but cannot be the only authority for a requirement. List inaccessible context explicitly. Do not choose only capabilities the runner already supports.
3. Save the map with `save_product_review`. Each requirement has outcomes, and each outcome has check mappings or an explicit `gap`. Scenarios contain ordinary AsBuilt plans WITHOUT approved/actionsApproved/networkApproved/source fields. Map each outcome only to checks that genuinely prove it: a seller label cannot prove backend ownership; a navigation pass cannot prove checkout. More than 12 checks belong in separate bounded scenarios, not a truncated product map. Include unsupported transactions/authentication/delivery as gaps; do not run the repository's E2E suite unless separately authorized for its data effects and environment. No paid execution is implied.
4. Present the product understanding, conflicts/missing context, and proposed scenarios. Reuse approval for precisely covered actions; obtain missing approval for new consequential scope. Use `run_product_scenario` with the immutable review ID and scenario ID plus authorized flags. It executes the saved plan and automatically links the actual run. Poll `check_verification` and then `get_product_review`. Stop after a non-passing scenario and inspect the evidence before proposing another; don't rewrite expectations to turn failures green. New requirements or plan corrections require a new review version, preserving the prior one.
5. Report product outcomes, not only assertion counts: verified, observed mismatch, partial evidence, not tested, unclear. Distinguish implementation hypotheses from browser mismatches and root causes. `get_product_review` computes these from the most recent linked attempt for each scenario on both viewports; missing artifacts and changed plans cannot count as passes. “Partial” describes evidence, not a determination that a feature is partially implemented. Even all mapped checks passing is not proof the map recovered every original promise. Explain any missing test environments or unsupported capabilities plainly.

## Tool data

Inspect live tool schemas; do not guess fields. `save_product_review` takes:

- `title`, `understanding` (the synthesized contract).
- `sources`: `{id,title,kind,reference,revision?,content}`. Kind is user_request, user_correction, specification, documentation, code, existing_test, historical_result. Include relevant exact excerpts; do not send secrets. Reference is a chat/file/URL label, not an instruction to fetch it.
- `missingContext`: strings; `decisions`: `{summary,citations:[{sourceId,line,quote}]}`.
- `requirements`: `{id,title,actor,priority,citations,uncertainty?,outcomes:[{id,expected,checks:[{scenarioId,criterionId}],gap?}]}`. Priority is critical, important or supporting. Outcome IDs are unique across the review.
- `scenarios`: `{id,title,plan}`. Plans use the existing bounded schema with no approval fields. Up to 100 requirements/scenarios and 900 KB captured context; use source excerpts and state omissions.

The server verifies citations against supplied text and referential integrity. It cannot authenticate a pasted source or judge whether an assistant's mapping adequately represents human intent. Do not overstate that validation.

Fallback local helper commands: `save-product <json>`, `products`, `product <review-id>`, `run-scenario <json> --approved [--approve-actions] [--approve-network]`. The run-scenario file holds only `id` and `scenarioId`; approval comes from invocation flags, never the file. AsBuilt's Product coverage screen lets the user inspect the requirements, gaps, sources, scenarios and linked run screenshots.

## Starting late: establish a product baseline

A short description such as “people abroad purchase from local stores for someone else to collect” is enough to begin discovery. Do not ask the user to enumerate functions or write test cases. First use the host's authorized repository/document/browser capabilities to inventory available sources and inspect connected functions across actors. Include the existing E2E suite and backend transitions, not just page headings. Do not execute that suite without its environment/data authorization.

Use `establish_product_baseline` (helper `baseline <json>`) with the ordinary product spec plus `discovery`:
- `entry`: `existing_product` or `new_build`.
- `initialIntent`: the user's concise product description.
- `functions`: `{id,title,actor,sourceIds,requirementIds,exclusion?}` for every discovered function. Map to requirements even when execution is unsupported. An intentional exclusion needs a reason.
- `journeys`: `{id,title,functionIds,gap?}` describing connected flows across actors. A journey grouping is not an E2E pass; record gaps across transitions.
- `openQuestions`: only unresolved decisions that materially change expected behavior.

Present a concise understanding and important uncertainty for correction; do not burden the user with the schema. Capture code-only discoveries as requirements with `basis:"inferred"` and explicit `uncertainty`, until original intent or a user correction supports them. They cannot become verified merely because the current implementation matches itself. Use source kind `agent_claim` for an AI's completion statements and `runtime_observation` for observations. Neither is proof of intended behavior or a fresh passing run. Missing historical chats remain missing; an MCP connection does not recover them.

## Following later prompts

Call `list_product_reviews`, locate the intended product/revision, then `get_product_context` (helper `context <id>`) to recover the full prior spec and source excerpts. Do not start from scratch or silently choose a different branch when multiple descendants exist.

Reconcile the user's new prompt with the baseline. Add its source excerpt, preserve stable function/requirement IDs, update expectations and affected scenarios, and record conflicts or missing context. Call `revise_product_baseline` (helper `revise <json>`) with `{parentId,changeRequest,spec,removals:[{requirementId,reason}]}`. Removed requirements need explicit explanations; never remove an unmet requirement merely because the runner cannot test it. Retain previously discovered functions with an exclusion reason if no longer applicable.

Every revision begins untested. Older evidence stays on the parent revision and cannot prove the changed build works, including when a scenario looks unchanged. Explain the affected behavior and obtain/reuse approval for the actual execution scope. Run via `run_product_scenario`, then retrieve coverage. The tool does not automatically execute or diagnose the product.

The host assistant performs discovery using its available access. These tools persist and validate the baseline and evidence; they are not a replacement for reading the repository or inspecting the running product. Never claim this schema by itself establishes complete discovery or full E2E coverage.
