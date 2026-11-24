# Fully online deployment (private MVP)

The Vite preset is correct. Import `mmeek87/AsBuilt` into Vercel, using the repository root, Node 24, build command `pnpm build`, and output directory `dist`. `vercel.json` adds the server routes. Your Mac is not the production server.

## Setup

1. Create a dedicated Neon Postgres database from the Vercel Marketplace and connect it to this project. Do not reuse eBarrel’s database. Confirm its plan and costs before creating it.
2. Create a **private** Vercel Blob store and connect it. Public Blob is not appropriate for verification screenshots.
3. In Vercel’s production environment variables, set `DATABASE_URL`, `BLOB_READ_WRITE_TOKEN`, a randomly generated `ASBUILT_TOKEN` of at least 32 characters, and `ASBUILT_PUBLIC_ORIGIN` to the exact HTTPS deployment origin (no path). Never prefix secrets with `VITE_`.
4. Set `ASBUILT_CLOUD_RUNS_ENABLED=false`, `ASBUILT_DAILY_RUN_LIMIT=5`, and the approved preview/image allowlists shown in `.env.cloud.example`. Deploy. Keep Vercel deployment protection enabled for the private web interface where available.
5. On your Mac, copy `.env.cloud.example` to `.env.cloud`, fill the same database connection privately, and run `pnpm cloud:migrate` from the AsBuilt folder. This creates only AsBuilt tables. The application does not run schema changes on every request.
6. Before creating the browser environment, review Vercel Sandbox pricing and configure account spending notifications/pause controls. The application’s run limit is a usage guard, **not a dollar spending cap**. Browser execution, snapshots, functions, database, and Blob may incur charges.
7. For the one-time browser setup, provide Vercel authentication (`VERCEL_TOKEN`, `VERCEL_TEAM_ID`, `VERCEL_PROJECT_ID`) in the ignored `.env.cloud` file. After approving setup costs, add `ASBUILT_APPROVE_CLOUD_SETUP=true` and run `pnpm cloud:prepare-browser`. The command installs Chromium in a managed sandbox, tests launch with outbound networking denied, and prints a snapshot ID. Never put credentials into the snapshot.
8. Set the resulting `ASBUILT_SANDBOX_SNAPSHOT_ID` in Vercel. Ensure the deployed function has Vercel Sandbox authentication for the same project/team (Vercel OIDC, or the documented token/project/team credentials). Set `ASBUILT_CLOUD_RUNS_ENABLED=true` only after cost approval; redeploy.
9. Sign in with the workspace key and run the fictional sample first. Confirm a completed report, authenticated desktop/mobile screenshots, persistence after refresh, and deletion. Then use the approved test site. Do not create orders or use production targets.

## Architecture and limits

The web UI and HTTP/MCP endpoints run on Vercel. Neon stores reports, hashed sessions, a single-worker lease, and daily limits; private Blob stores evidence. Vercel Sandbox runs Chromium from the prepared snapshot with outbound network access denied. The function brokers only permitted resources through the existing DNS/IP and request checks. Target page code receives no database, GitHub, Blob, or workspace credentials.

Only one run executes at a time; default five starts per UTC day; maximum 200 retained reports. Sandbox lifetime is three minutes, with a shorter command deadline. Interrupted work is reported as interrupted, never passed. Vercel background execution is bounded by the function lifetime; this is not a durable queue. Unsupported or blocked behavior remains not verified. Deleting a review deletes its referenced evidence; orphaned uploads from an interrupted storage write may need operator cleanup.

This is a private single-operator MVP, not a multi-user service. `/mcp` uses the workspace bearer key and the same limits. Browser cookies do not authorize MCP. Clients must support remote authenticated MCP and must also satisfy any Vercel deployment protection. Public ChatGPT/Claude directory approval, OAuth, multi-user isolation, and automatic post-deployment checks are not implemented by this hosting change. Do not disable access controls simply to make a client connect.

GitHub and optional model planning still require their separate credentials. Hosted GitHub private-key provisioning needs a server-side file or a dedicated secret adapter; a path on your Mac will not work in Vercel. Browser verification can be tried with the sample without those integrations.

## Validation status

The production TypeScript/Vite build and local automated checks validate the implementation. Cloud authentication boundaries are tested using an injected storage adapter. No real Neon migration, Blob upload, Sandbox snapshot, Vercel routing, or hosted end-to-end run has been verified until the account setup and smoke test above are completed. Keep execution disabled until then.

Official references: [Vercel Sandbox SDK](https://vercel.com/docs/sandbox/sdk/javascript), [Sandbox pricing](https://vercel.com/docs/sandbox/pricing), [private Blob storage](https://vercel.com/docs/vercel-blob/private-storage), [function limits](https://vercel.com/docs/functions/limitations).
