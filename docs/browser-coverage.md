# Browser coverage

Interactive plans accept `browser: "chromium" | "firefox" | "webkit"`.
Omitting it retains Chromium. Select the engine before approving the run;
changing it clears approval in the app.

Each run tests one engine at desktop and mobile viewport sizes. Run the
same plan separately for each engine you need. A viewport-sized run is
not a test on a physical phone. Chromium covers its engine, not a specific
installed Chrome or Edge release; WebKit is not an installed Safari test.

External local runs use the isolated Docker worker. Its browser profile
and home directory are temporary container storage, with no personal
browser profile or host home directory mounted. The container root stays
read-only and its network remains disabled; approved browser traffic uses
the host's validated public HTTPS tunnel.

Validate the bundled journey without contacting external sites:

```sh
docker build -f Dockerfile.browser -t asbuilt-browser:local .
node --import tsx scripts/verify-journey-docker.ts chromium
node --import tsx scripts/verify-journey-docker.ts firefox
node --import tsx scripts/verify-journey-docker.ts webkit
```

On November 24, 2026, all three engines passed six fixture checkpoints
with screenshots. This validates the local journey executor; it does not
establish external-site network compatibility or release readiness.
