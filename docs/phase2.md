# Phase 2: approved browser interactions

The browser can click a named button, fill a labeled field and select a native option, then check an observable outcome. Each check starts in a fresh browser context on desktop and mobile. Reports include the completed actions, expected and observed outcomes, and a separate screenshot per check. Both the checks and exact actions require approval; editing a check clears approval.

## Try the working sample

1. Start AsBuilt using the README instructions and unlock the workspace.
2. Choose Sample project → Use an example → Create review plan.
3. Set Browser mode to Interactive and choose Load interaction example.
4. Review the three checks and their actions. Approve both checkboxes, then Run reviewed checks.

The fictional studio example shows details, fills a first name, and selects a visit type. It produces six passing observations across two viewports. It sends no bookings, orders, emails or API requests. The bundled fixture runs locally; arbitrary site JavaScript does not use that local execution path.

## Enable an authorized preview

Docker Desktop and the browser image are now installed on this workstation. Container launch, fixture interactions, screenshot capture and denied broker requests passed. Real external preview acceptance is still pending. Fresh installations leave this capability disabled by default. Install and start Docker Desktop, then from the AsBuilt repository:

```sh
docker build -f Dockerfile.browser -t asbuilt-browser:local .
```

Set these values in your ignored `.env` and restart `pnpm start`:

```dotenv
ASBUILT_INTERACTIVE_PREVIEWS=true
ASBUILT_PREVIEW_ORIGINS=https://your-owned-staging.example.com
```

Choose My project, enter that staging URL, and review the actions before approving a run. Start with an owned disposable fixture containing no real data. Validate a successful interaction, an intentionally missing outcome, and a blocked request before using broader previews. Do not use live eBarrel or create real orders without separate permission.

The image pins Playwright 1.65.1. Keep the image browser and worker package versions aligned when upgrading. The build context excludes secrets, reports and unrelated source. See the [official container guidance](https://playwright.dev/docs/docker).

## Execution boundary and coverage

The external worker has no network, host mounts or application secrets. It runs as a non-root user with a read-only filesystem, bounded temporary storage, resource limits and dropped capabilities. It requests page resources through a bounded host broker, which checks the exact allowed HTTPS origin, public DNS addresses and pinned TLS connection. Only the chosen document and typed same-origin static assets are allowed. Static assets may include alphanumeric deployment/cache tags (`dpl`, `v`, `ver`); other query parameters remain blocked. Optional `ASBUILT_IMAGE_PREFIXES` permits GET images under explicit HTTPS directory prefixes, never scripts or documents. Redirects outside policy, APIs and mutations remain blocked. Each viewport/check receives 200 requests and 20 MB, bounded by 1,000 requests and 100 MB per run plus the worker deadline. These limits can still interrupt large pages. The host stops timed-out workers and removes their containers.

Actions use exact accessible names, never arbitrary generated JavaScript or selectors. Clicks require a non-submit button outside a form. Sensitive action names, password/payment fields, links, submissions, purchases, sending and login are not supported. Each check has at most six actions and a run has at most twenty. Downloads, service workers and WebSockets are blocked. Only synthetic, non-sensitive input belongs in plans and reports.

A page script can attempt requests independently of an approved button. Network policy is therefore enforced outside the browser, not just by action names. Even an allowed GET may have an effect on a poorly designed server: use only authorized non-production targets.

Missing observable outcomes are Fail. Blocked resources, script errors, ambiguous controls, unsafe actions and missing evidence are Not verified. A worker failure interrupts the run rather than inventing results. API-driven applications, authenticated journeys, cross-origin assets and checkout are not covered. A source SHA does not prove the preview runs that commit.

## Validation boundary

Real local Chromium exercised the bundled interactions, fresh state per check, negative outcomes, prohibited controls, screenshots, desktop/mobile UI and approval behavior. Container command policy has automated coverage. The installed Docker image launched successfully and passed the repeatable container check (`node --import tsx scripts/verify-docker.ts`): six passing interactions, two intentional failures and two denied-request Not verified results, all with screenshots. Real external preview transport and behavior remain unverified.

## eBarrel resource-loading follow-up

The user approved https://shopebarrel.tech for read-only testing. The previous shared 80-request budget starved the mobile capture, and deployment-tagged images and the site’s scoped Storyblok image directory were denied. Separate per-check budgets and narrowly scoped static-image rules restored mobile styling and primary images. Report `cbd2a00e-9555-4d12-9726-e86178e90325` retains Not verified on both viewports: store-data API requests, page prefetches, monitoring and the external Vercel feedback script remain blocked. Cookie consent was not changed; product placeholders remain visible. This is a limited homepage capture, not complete visual or functional acceptance. Blocked/unavailable resource paths are included in report limitations, without query strings or request bodies.
