# Approved browser networking

Service 0.4.0 adds local `network:"browser"` for interactive plans. It loads public HTTPS resources, APIs and cookies using native browser networking. Select `environment:"test"` and set `networkApproved:true` only after reviewing the fact that page scripts can send writes. Use staging, synthetic accounts/data and sandbox external services. A preview URL does not prove database isolation.

The Docker container has no network interface beyond loopback, no host mounts or credentials, a read-only root filesystem, and temporary profile storage. A loopback CONNECT proxy carries encrypted TLS bytes over the worker protocol to the host. The host validates every DNS answer and connects to a pinned public address on port 443. TLS validation stays in the browser. Private/reserved destinations, non-HTTPS traffic, downloads, popups and cross-origin top-level navigation remain blocked. Only reviewed actions execute; sensitive submissions and transactions remain unsupported.

Limits: 512 connection attempts, 128 concurrent connections, 100 MB of encrypted traffic, a 15-second connection idle timeout and a 150-second run deadline. These can interrupt large pages. No decoded HTTP request count or zero-write guarantee is claimed. Browser routing disables normal HTTP caching; this is not perfect fidelity to every user's browser.

For approved public live-site observations, set `environment:"production"`, `publicReadOnly:true`, and the operator's exact `ASBUILT_PUBLIC_READONLY_ORIGINS`. Actions, journeys, expected destinations and readUrls are rejected. This means no agent interactions; page traffic can still change server data. No personal browser session is imported.

Omitting `network` retains the older restricted broker. Hosted execution rejects normal networking; this change does not enable paid execution. Choose an engine as described in [browser coverage](browser-coverage.md).

## Validation, November 24, 2026

The six-check local journey passed independently in Chromium, Firefox and WebKit. Approved signed-out inspections of hllofuture.com completed in all three engines at desktop and mobile viewports:

- Chromium: `abb8c4a3-df9e-46f9-9785-9f212efa2c77`
- Firefox: `d0f63ee3-4c51-42ab-a71b-b28de154fac4`
- WebKit: `3ac17947-647a-4d2e-a92b-f36eb60ab59d`

Screenshots showed the public landing page. No clicks, fills, login or submissions were requested. These manual observations remain Not verified, not functional passes. Firefox mobile had missing lower-page images; visual parity and image completeness are not established. A preceding sandbox-blocked launch was interrupted with no results and is retained separately.
