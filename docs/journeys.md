# Continuous verification journeys

Service 0.3.0 and plugin 0.2.0 add `journey: true` to interactive plans. A journey retains one fresh browser context per viewport across ordered criteria. Each criterion is a checkpoint with its own screenshot and action log. A non-passing checkpoint prevents subsequent actions; unattempted checkpoints are Not verified.

Use `navigate` actions with an exact accessible link name and a reviewed absolute URL in `value`. The worker verifies the link destination before clicking, waits for that URL, and permits only same-origin reviewed document destinations. A criterion's optional `expectedUrl` verifies where the observation happened. `readUrls` permits exact, explicitly reviewed same-origin GET data requests; it does not permit arbitrary APIs or mutations. Next.js RSC requests are allowed only for reviewed page destinations with a bounded `_rsc` key. Only the necessary Next navigation headers are forwarded, never cookies or authorization.

The worker runs in network-isolated local Docker. The host broker pins public DNS and applies request/byte/time budgets. Next image optimization is allowed only for validated image sources already permitted by the existing static-image policy and configured image prefixes. This does not expand the configured external image origins.

Positive checkpoints establish only the observed UI condition. Blocked resources and script errors are reported as coverage limits; an absent condition with blocked functional resources is Not verified rather than attributed to an app bug. Screenshots may be incomplete. No authentication, purchases, cart changes, submissions, backend writes or paid cloud execution are part of this milestone.

## Try it

In the local UI, create a sample plan, choose Interactive checks, then Load journey example. Review the three checkpoints and approve the actions. It selects a fictional Jamaica location, follows Island Market, then opens Test mango, preserving location through the page transitions. It sends no external traffic.

Build the local worker after updating:

```sh
docker build -f Dockerfile.browser -t asbuilt-browser:local .
node --import tsx scripts/verify-journey-docker.ts
```

The eBarrel plan in `docs/examples/ebarrel-journey.json` is a specific trial, not a template for arbitrary stores. It intentionally has no embedded approval. Only run it after the user reviews the exact destination URLs, actions and checkpoints. Reports are kept in `.data/journey-verification` by the explicit approved-run script. No permissions are inferred from this file.

Action targeting can be narrowed with `within:{role:"region",name:"Exact section name"}`. This supports named region, dialog, navigation and main landmarks; the section and button or field target must be unique. Multiple visible links are accepted only when every exact-name match points to the same reviewed destination and none opens a new tab or downloads a file. Buttons without an explicit type are allowed only when they have no associated form. Explicit submit buttons, form-associated controls and sensitive action names remain blocked.

## External trial status

The latest approved eBarrel trial selected Jamaica on desktop and mobile, but the reviewed store navigation timed out on both. Later checkpoints were not attempted. This is an unresolved compatibility limitation, not a passing shopping journey or evidence of an eBarrel defect. No additional API access or mutations were permitted.
