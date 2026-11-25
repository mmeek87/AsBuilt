# eBarrel: read-first verification review

Prepared November 25, 2026. This is a consolidated source review and proposed verification plan, not a new browser result or a full-site audit.

## Requirement authority

The user's requests and corrections define the intended behavior. Documentation supplies context; implementation and existing tests explain how to exercise it but cannot independently prove it is correct.

In particular, eBarrel supports **multiple stores in one shopper checkout/order**, with separate store fulfillment and pickup codes internally. The older README's single-store description is stale relative to the user's correction and UI_REFRESH.md. Separate internal store orders are not a defect.

For this evaluation, use the header's **Sending to** selector: Jamaica → Manchester → Mandeville Fresh Mart → Bottled water (24). The homepage shortcut's behavior is a separate user note, not something to fix in eBarrel during this work.

## Sources reviewed together

Repository snapshot: [mmeek87/v0-jamaica-payments at 7db94ba](https://github.com/mmeek87/v0-jamaica-payments/tree/7db94ba47ad2a275c63d2f9d4a5ed7cb3dc38e3f). Deployment equivalence to shopebarrel.tech has not been established. File paths below refer to that snapshot.

- Product/context: README.md, UI_REFRESH.md, DEPLOYMENT.md, NOTIFICATIONS.md, TWILIO_TEMPLATES.md, docs/storyblok.md, scripts/release/README.md. Deployment checklists and notification setup notes are not evidence that features currently work.
- Location/browsing: lib/shop-country.ts, lib/shop-country-client.ts, components/marketplace/marketplace-header.tsx, components/marketplace/sending-to-picker.tsx, components/store-filters.tsx, components/store-card.tsx, components/store-products-client.tsx, app/stores/page.tsx, app/stores/[id]/page.tsx, app/products/[id]/page.tsx.
- Checkout interpretation: app/actions/checkout.ts, app/checkout/success/page.tsx, app/buyer/orders/page.tsx, components/buyer/orders-view-client.tsx.
- Existing coverage: tests/e2e/public.spec.ts, tests/e2e/store.spec.ts, tests/e2e/buyer.spec.ts, tests/e2e/order-flow.spec.ts. These were read, not executed. Historical successful runs are not fresh evidence for this plan.

## Consolidated understanding

The location picker remembers country and parish in browser storage and a country cookie. Choosing Manchester navigates to /stores?parish=Manchester; choosing an entire country is a different action. Desktop and mobile use the same picker component with different presentation.

The store listing applies search/location filters and labels its selected location. Store detail queries active products belonging to that store. Its client component filters that supplied collection by search and category. Product detail displays an explicit “Sold by {store}” link, pickup information, and recommendations. A store name elsewhere on that page could belong to a recommendation and therefore is insufficient seller evidence.

Existing public tests cover useful smoke checks, but navigating to a store URL or finding a product link does not establish that every filtered result is correct. The order-flow test performs transactional operations and covers a single-store path; reading it does not verify multi-store checkout. It is outside this browsing evaluation.

## Requirement-to-evidence plan

Run the same ordered journey in fresh desktop and mobile contexts. Stop at the first non-passing checkpoint in each journey; later checks remain unverified. The executable subset is [ebarrel-menu-journey.json](examples/ebarrel-menu-journey.json).

| Expected outcome | Planned evidence | Current coverage |
| --- | --- | --- |
| Choose Jamaica, then Manchester | Menu actions, selected-location button, exact filtered URL | Executable: country |
| Listing identifies selected parish/country | Exact “Stores in Manchester, Jamaica” heading and URL | Executable: filtered-stores-heading |
| Every displayed store belongs to the selected location | Inspect each store card's location within that card; require a nonempty collection for this known fixture | Gap: no collection-wide or scoped criterion assertions |
| Open the intended store | Reviewed destination URL and store heading | Executable: store |
| Preserve chosen location at the store | Visible Sending to control | Executable: store-country; does not prove pickup-address consistency |
| Store pickup information agrees with the selection | Manchester within the specific pickup information block | Gap: global text could match header/breadcrumb instead |
| Open the intended product from the store | Reviewed product destination and exact heading | Executable: product |
| Product identifies the selected store as seller | Exact, unique “Sold by Mandeville Fresh Mart” link | Executable: seller; does not assert its href or backend ownership |
| Preserve chosen location at the product | Visible Sending to control | Executable: product-country |
| Multiple stores, one checkout, separate pickups | Multi-store cart through checkout and fulfillment evidence | Intentionally outside current execution scope |

The revised executable plan has seven checkpoints per viewport. Fourteen passes would establish only those observations, not full filtering correctness or release readiness. The source-derived heading and seller wording must still be confirmed against the deployed English UI; do not weaken them automatically to obtain passes.

## Scope and execution status

No new browser run was started for this review. No eBarrel code was changed. No login, cart, checkout, submissions, notifications, builds, deployment, paid browser execution, or paid planning model is part of this plan. Existing navigation authorization remains applicable; the revision adds observations and tightens a seller assertion, not new actions. Saved plans do not grant execution/network approval themselves.

## Next AsBuilt capability

Add generic assertion scoping and collection checks so an assistant can express “every displayed result matches this filter” and “this value belongs to this card/section.” Actions already have limited scoping; criteria do not. Keep this reusable across marketplaces, directories and dashboards, with no eBarrel-specific runner logic. Validate it with a mixed-result fixture that must fail even when one correct card and a correct page heading remain visible, plus an empty-collection case that must not pass vacuously.

The host assistant should prepare this source inventory, reconcile contradictions and map requirements to evidence automatically. The user should only need to resolve genuinely missing intent and approve consequential execution. This evaluation is context-informed, not blind: requirements remain independent of implementation, but code was used to understand navigation and available evidence.
