# Unfamiliar-site benchmark: book discovery

Date: November 24, 2026. Intent: “Find a mystery book and check its details.”

The assistant inspected public pages on Books to Scrape, drafted a five-check plan, and obtained user approval for the exact journey and normal HTTPS traffic. AsBuilt executed the unchanged plan in isolated Chromium 159.0.8154.6, at desktop 1440 × 960 and mobile 390 × 844.

## Outcome

Run `2d36e94e-3e3d-4bf0-a6f0-32f50e5a66fc`: complete, 10 passes, zero failed or not-verified results, zero recorded blocked requests or connection denials.

| Checkpoint | Desktop | Mobile |
| --- | --- | --- |
| Catalogue heading: All products | Pass | Pass |
| Navigate to Mystery; heading and exact URL | Pass | Pass |
| Navigate to Sharp Objects; heading and exact URL | Pass | Pass |
| Price: £47.82, at least one exact visible match | Pass | Pass |
| Stock: In stock (20 available), at least one exact visible match | Pass | Pass |

The saved product-page screenshots were inspected on both viewports and show the title, price and stock. No basket, checkout, login or submission actions were included. No paid browser or planning-model execution was enabled. The website was not modified by the assistant. Page-initiated network effects were permitted, so this is not a zero-write claim.

No executable check, matching rule or runner logic was adjusted after the browser run began. An earlier attempt (`2177c02f-8dc7-4b9c-af8d-479bc75a46e7`) was interrupted before producing any results because the execution sandbox prevented worker access; the unchanged command was rerun with host permission. Preserve both reports.

## What this establishes

The existing executor handled an unfamiliar site's category-to-product journey without application-specific code. The user supplied approval rather than selectors or technical troubleshooting. The same reviewed plan executed on desktop and mobile.

This is a simple server-rendered demo and one successful run, not evidence for complex reactive apps, authentication, real transactions, all browser engines, repeated reliability or superiority to another product. The assistant performed discovery and planning using external page inspection; AsBuilt's built-in planner did not independently discover this flow. Its no-repository path remains a rule-based starter. The next agent capability is collecting bounded page evidence and drafting a grounded plan through the user's existing assistant, without an additional paid model dependency.

## Artifacts

- Reviewed plan: `docs/examples/book-discovery.json` (contains no approval flags).
- Reusable local runner: `scripts/run-reviewed-plan.ts`; requires explicit target/action/network approval flags at invocation.
- Local report: `.data/reviewed-benchmarks/report-2d36e94e-3e3d-4bf0-a6f0-32f50e5a66fc.json`.
- Screenshots: `.data/reviewed-benchmarks/2d36e94e-3e3d-4bf0-a6f0-32f50e5a66fc/`.

The report and screenshots remain local and are excluded from source control.
