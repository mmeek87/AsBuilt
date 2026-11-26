# AsBuilt

**Check that what your AI built actually does what you meant.**

Your assistant (Claude, ChatGPT, Codex) reads your code and maps every feature your app has, in plain language, so you don't have to remember them all. You correct the list and approve checks for what matters. Every time Vercel deploys a preview of a pull request, AsBuilt opens it in a real browser on desktop and mobile, checks each expectation, takes screenshots, and comments on the PR: what passed, what didn't, what it couldn't check and why, plus a prompt you can paste back to your assistant to fix it.

It never takes the AI's word that something works, and it never marks something passed without seeing it.

![AsBuilt mapping a shop's features, catching a redesign that dropped the order total, then passing after the fix](site/assets/demo/asbuilt-demo.gif)

_50-second demo on [a real pull request](https://github.com/mmeek87/asbuilt-demo/pull/3). Try it yourself with the [demo repository](https://github.com/mmeek87/asbuilt-demo)._

- **Free and open source.** Runs on GitHub Actions (free for public repositories). No servers, no AI bills, no accounts. MIT license.
- **Nothing to install.** Add one workflow file and one plan file, or ask your assistant to do it with the AsBuilt skill.
- **Honest results.** Pass, Fail, or Not verified with a reason (signed out, site down, protected preview). Measured in [EVALS.md](EVALS.md): 0 false passes across 9 scenarios, including misleading pages.
- **Safe by design.** Only your preview, only reviewed steps, test accounts only. Cart, checkout and payment steps are off unless you approve them for a test site, and then only with Stripe's test card while the page shows your test-site banner. See [SECURITY.md](SECURITY.md).

## Use it on GitHub (recommended)

1. Copy [`examples/asbuilt-vercel.yml`](examples/asbuilt-vercel.yml) to `.github/workflows/asbuilt.yml`.
2. Ask your assistant: *"Set up AsBuilt on my repo."* It maps your app's features into `.asbuilt/features.json` and drafts checks, one file per feature, such as `.asbuilt/checkout.json`.
3. Open a pull request. When the preview is ready, AsBuilt runs and comments.

Full guide, including protected previews, test-account sign-in and every option: **[docs/github-action.md](docs/github-action.md)**.

![AsBuilt review workspace](docs/screenshots/workspace.png)

## Assistant plugin

The AsBuilt skill teaches Claude, ChatGPT or Codex to turn your intent and a pull request into reviewed checks, set up the workflow (with your permission), and explain the results. That's the agent: your assistant plans, AsBuilt independently observes. See [plugin installation](plugins/asbuilt/README.md).

## Local app (optional, for development)

The same engine also runs as a local app with a review interface and an MCP server, useful for trying checks before committing them, or for the product coverage view.

### Run locally

Requirements: Node 24 LTS and pnpm 11.25 or later in the 11.x line.

```sh
git clone https://github.com/mmeek87/AsBuilt.git
cd AsBuilt
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm start
```

Open **http://127.0.0.1:4310**. Copy the access key from `.data/token` into the unlock form (or use `ASBUILT_TOKEN` if you explicitly configured it). Leave “Remember this device for 30 days” checked to stay signed in across server restarts. Uncheck it on a shared browser; that session lasts at most eight hours and ends on server restart. Sign out revokes this browser’s session. Clearing cookies, expiry or changing the access key requires unlocking again. This key is local authentication, not a GitHub or model key. Do not commit or share it. For a different machine, change the project path above.

Choose **Sample project → Use an example → Create review plan**, review the five checks, approve, and run. The real Chromium run should produce **6 passes, 2 failures, and 2 not-verified results** across desktop and mobile. The sample intentionally lacks the exact text “Free cancellation”; email delivery is unsupported. These are fixture results, never claims about a real application.

`pnpm dev` watches the server. Run `pnpm build` after UI edits. The server serves the built UI; the optional Vite development server is not needed for the documented workflow.

## What is implemented

| Phase                    | Current state                                                                                                                                                                                                                                                             |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Single agent          | Read-only tool-calling planning loop, pinned GitHub source files, verified source quotations, editable criteria. Requires your own GitHub App and OpenAI configuration for live analysis. Without credentials, the sample uses a clearly labeled rule-based guided draft. |
| 2. Browser capability    | Actual Playwright desktop/mobile checks for visible text, headings, buttons and native required fields. Static mode plus approved click/fill/select interactions with JavaScript. Local sample validated; Docker worker fixture checks validated; real external preview acceptance pending. See [Phase 2 setup](docs/phase2.md).                                                                       |
| 3. Reports/history       | Per-check expected/observed results, reproducible steps, screenshots, suggested prompts, JSON export and local persisted run history.                                                                                                                                     |
| 4. MCP                   | One authenticated shared service with Streamable HTTP and a stdio bridge. Tested with the MCP SDK client. HTTP and stdio tested end-to-end; Codex and Claude Desktop configurations installed on this workstation. Host activation and hosted ChatGPT remain unverified.                                                                 |
| GitHub Action            | Runs reviewed `.asbuilt/*.json` plans on every preview deployment, on desktop and mobile, with screenshots, a job summary, one updated PR comment with a fix prompt, test-account sign-in and Vercel protected-preview support. Free on public repositories. Live acceptance runs against a real external site in CI. |
| Product coverage (0.5.0) | Whole-product requirement maps with cited sources, frozen scenarios and revisions. Coverage only counts a pass from a fresh, complete, plan-matching run with both viewports and screenshots. Usable from the **Product coverage** screen and 7 MCP tools. |
| 5. Deployment automation | Not implemented. Future work must bind a deployment to its exact commit and approved preview origin, validate signed events and prevent duplicate runs.                                                                                                                   |

This is a single-operator internal MVP, not a hosted multi-tenant product, a general autonomous testing agent, or a full release certification service.

## Configure the planning agent

```sh
cp .env.example .env
```

Set `OPENAI_API_KEY` and `ASBUILT_MODEL` to a model available to your account that supports Responses API function calling and structured outputs. No particular model is silently selected. Restart `pnpm start`; it loads `.env` automatically.

The UI explicitly asks permission to send selected repository source to the configured OpenAI model. The agent receives your requirements, the readable repository file list and up to eight source files at a pinned commit. API requests use `store: false`; this does not override provider-side retention or organization data policies. Files containing secrets should never be stored in the connected repository. Source selection excludes common credential paths, but is not a secret scanner.

The agent can call only `read_file`. It cannot execute commands, write files, browse arbitrary URLs, post comments or start a test on its own. Budgets: six model turns, eight source reads, 30 KB per file, 500 listed paths and 12 proposed checks. Repository text is untrusted. Returned citations are checked against the file and line actually read. This constrains actions; it does not guarantee every model conclusion is correct.

A GitHub URL is optional in the UI. With a URL and both integrations configured, **Create review plan** invokes the agent. A preview URL is not needed to produce a plan; it is needed only before running browser checks. Without a GitHub URL, the guided parser drafts simple checks from quoted labels. It does not pretend to be an AI agent.

## Register a least-privilege GitHub App

1. In GitHub Settings → Developer settings → GitHub Apps, create an app with your own distinct name, such as `asbuilt-your-handle`. The app's home page can be your AsBuilt repository URL.
2. Disable webhooks for this MVP; there is no webhook receiver. No OAuth callback is used because this is a single-operator installation-token integration.
3. Set repository permissions **Contents: read-only**, **Pull requests: read-only**. Metadata read access is implicit. No Actions, Administration, Deployments, Secrets or organization permissions are needed.
4. Install it on **selected test repositories only**. Do not select eBarrel until you explicitly authorize that work.
5. Generate a private key. Store the PEM outside the repository and restrict its file permissions to the owner.
6. Set these server-only `.env` values:

```dotenv
GITHUB_APP_ID=your-numeric-app-id
GITHUB_INSTALLATION_ID=your-numeric-installation-id
GITHUB_PRIVATE_KEY_PATH=/absolute/path/outside-the-repo/asbuilt.pem
GITHUB_APP_SLUG=your-app-slug
GITHUB_ALLOW_COMMENTS=false
```

Find the installation ID in the installation settings URL. The private key signs a short-lived app JWT; tokens are minted with explicit permissions and narrowed to a selected repository when reading its source. Tokens stay in process memory and never appear in API responses or browser storage. The connection lists the first 100 installed repositories and explicitly reports truncation.

Paste a URL such as `https://github.com/OWNER/REPO/pull/12` or a commit URL ending in the full 40-character SHA. Source files are read from Git blobs at the resolved immutable commit. For a pull request, the agent also receives the list of changed files (first 100; no extra permission needed) to find journeys the change might affect, and the plan screen shows that list. A changed file is never treated as evidence. The agent reads at most 8 files; it does **not** analyze full diffs, infer all regression impact, or prove the preview is running the same commit.

### Optional report comments

Leave comments disabled by default. To enable, grant **Pull requests: read and write** to the app, approve the changed permission on the installation, and set `GITHUB_ALLOW_COMMENTS=true`. Ordinary reads still request read-only tokens; a write-capable token is minted only for posting.

Only a completed, real preview report attached to a PR can be posted. The UI first shows the exact comment, then requires a separate approval. The server issues a single-use, five-minute approval nonce and rechecks the PR head before posting. A changed PR head blocks posting. MCP exposes no comment tool. Screenshot files remain local and are not uploaded in the comment. No comment was posted during development.

## Preview safety and honest coverage

Set an explicit staging allowlist:

```dotenv
ASBUILT_PREVIEW_ORIGINS=https://your-preview.example.com
```

Use a clean HTTPS URL without credentials, query parameters, fragments or nonstandard ports. No wildcard origins. Literal IP targets and private/reserved DNS results are rejected.

Local interactive runs support normal browser loading with `network:"browser"`, an explicit `environment:"test"`, and `networkApproved:true` after the user reviews the traffic effects. Recommend staging, test accounts, disposable data and sandbox payment/email services. Normal HTTPS loading permits CDN assets, APIs, cookies and page-initiated writes; approval is not a zero-write guarantee. Reviewed user actions remain bounded and sensitive submissions, login and transactions remain unsupported.

The browser has a fresh profile, no host credentials, no permissions or downloads, and blocked service workers. It runs in a network-disabled container with a bounded public HTTPS tunnel. DNS answers are validated and connections pinned to public addresses. Private networks, non-HTTPS traffic and unreviewed top-level origins remain blocked. Normal loading is local-only; no paid cloud execution is enabled.

For explicitly approved public live-site inspection, configure `ASBUILT_PUBLIC_READONLY_ORIGINS`, use `environment:"production"` and `publicReadOnly:true`, and omit actions, journeys and data-URL grants. Page traffic may still have server-side effects. See [browser coverage](docs/browser-coverage.md) for engines and [networking](docs/browser-networking.md) for limits.

Omitting `network` retains legacy restricted loading: same-origin brokered reads with optional scoped image prefixes, blocked APIs/mutations/WebSockets, and JavaScript disabled in static mode. Blocked resources can leave rendering incomplete. Missing script-dependent content is **Not verified**, not a proven defect. A screenshot observation is not a functional pass. A required-field pass proves a visible native `required` attribute, not end-to-end validation. Failed launches interrupt runs without manufacturing results.

## MCP: one service, multiple hosts

For the key-free local setup, connection check and host-specific limitations, use the [Phase 4 guide](docs/phase4.md). While AsBuilt is running, `pnpm mcp:check` confirms the connection and lists the tools, and `pnpm mcp:check-flow` drives a full product review over MCP against the bundled sample (baseline, refused unapproved run, approved run, coverage). The older explicit-token configurations below remain supported.

Start the local web server first. All interfaces use the same planning service, runner and report store.

| Tool                 | Purpose                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `get_connection_status` | Read configuration and limitations without starting a review. |
| `capture_intent`     | Capture intended behavior and return an explicitly unverified draft.                                                     |
| `generate_criteria`  | Run the planning agent when a GitHub URL and source-sharing consent are supplied; otherwise make a labeled guided draft. |
| `start_verification` | Start a user-approved sample or allowlisted preview run with reviewed criteria.                                          |
| `check_verification` | Poll run status.                                                                                                         |
| `get_report`         | Read results and evidence paths.                                                                                         |
| `establish_product_baseline` | Save a whole-product understanding (requirements, cited sources, discovered functions, journeys, gaps). No browser run. |
| `save_product_review` | Save a product-wide requirement map with frozen scenarios. No browser run. |
| `get_product_context` / `revise_product_baseline` | Read a saved baseline, then apply a later request as a new revision that starts untested. |
| `list_product_reviews` / `get_product_review` | List reviews; read coverage (verified, observed mismatch, partial, not tested, unclear). |
| `run_product_scenario` | Run one frozen scenario after the user approves it. Approval is required as `approved:true` and is never read from the saved review. |

MCP bearer authentication uses `ASBUILT_TOKEN`, or the generated `.data/token` value. It is a shared local operator credential, not per-user OAuth. Tool approval flags represent host/user consent; a hostile authenticated host can assert them. Keep approvals enabled in the host and never provide the token to an untrusted client. Browser screenshot URLs additionally require an authenticated local session or bearer header.

### Codex (local HTTP)

Set `ASBUILT_TOKEN` in the environment that launches your host. Add this to your **user-owned** Codex MCP configuration:

```toml
[mcp_servers.asbuilt]
url = "http://127.0.0.1:4310/mcp"
bearer_token_env_var = "ASBUILT_TOKEN"
tool_timeout_sec = 360
```

Do not put the token itself in the repository. Ask the host to list the tools, capture intent and propose criteria before approving a run.

### Claude Code (local HTTP)

Create a user-scoped connection using Claude Code's MCP configuration. An illustrative configuration (replace the placeholder privately, or use your host's environment/header helper) is:

```json
{
  "mcpServers": {
    "asbuilt": {
      "type": "http",
      "url": "http://127.0.0.1:4310/mcp",
      "headers": { "Authorization": "Bearer YOUR_LOCAL_ASBUILT_TOKEN" }
    }
  }
}
```

Do not commit a credential-bearing `.mcp.json`. A stdio-capable Claude desktop host can instead launch the bridge with an absolute Node executable and `args` pointing to the installed `tsx` loader and `server/stdio.ts`, and supply `ASBUILT_TOKEN` through `env`:

```json
{
  "mcpServers": {
    "asbuilt": {
      "command": "/absolute/path/to/node",
      "args": [
        "--import",
        "/absolute/path/to/AsBuilt/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/to/AsBuilt/server/stdio.ts"
      ],
      "env": {
        "ASBUILT_URL": "http://127.0.0.1:4310",
        "ASBUILT_TOKEN": "YOUR_LOCAL_ASBUILT_TOKEN"
      }
    }
  }
}
```

### ChatGPT and hosted Claude

**Simplest path for any assistant, ChatGPT included: the [GitHub version](docs/github-action.md).** The assistant only needs to write a plan file to your repository; no MCP connection is involved.

For the local MCP server: **what works today** is Claude Desktop and Claude Code (local stdio or HTTP, configured above) and Codex. **What doesn't:** ChatGPT on the web and Claude custom connectors connect to MCP servers *from their own cloud*, so they need a public HTTPS URL. They cannot reach `127.0.0.1` on your computer (checked against Claude's and OpenAI's connector documentation, November 2026). ChatGPT developer-mode apps also expect OAuth or no authentication. AsBuilt's shared bearer key is not a supported option there (reported by developers; not independently verified).

This MVP is **not yet a deployed ChatGPT/Claude connector**. It intentionally binds to loopback and rejects unknown hosts/origins. ChatGPT remote MCP setup depends on your account/workspace permissions and requires a reachable supported transport, with appropriate authentication. A plain localhost URL and our arbitrary bearer token are not a finished hosted integration.

Before hosted use: implement or deploy a compatible OAuth authorization boundary, per-user access and ownership, TLS, a narrowly configured MCP gateway or supported secure tunnel, separate browser workers with egress restrictions, report storage controls and host-specific onboarding. Forward only authenticated MCP traffic to the local service; do not expose the UI/admin API or remove origin checks to make a tunnel work. OAuth and this deployment layer are **remaining work**, not delivered placeholders claimed as connected.

## Validation

```sh
pnpm exec playwright install chromium   # once
pnpm build        # the e2e suite serves the built UI; run this first
pnpm test         # 72 unit/integration tests (some launch a real headless browser)
pnpm test:e2e     # 19 browser + MCP tests, including axe on desktop and mobile
pnpm eval         # verification-quality eval, 8 controlled builds (about 2.5 min); see EVALS.md
```

Results, coverage and known gaps are in [LAUNCH_READINESS.md](LAUNCH_READINESS.md). The security model is in [SECURITY.md](SECURITY.md).

Unit tests cover target/SSRF policy, explicit approval, criterion bounds, immutable GitHub URL parsing, agent tool/path restrictions, citation validation and failure handling. Browser tests cover authentication, cross-origin rejection, keyboard access, desktop/mobile layouts, automated axe checks, actual sample evidence, report retrieval, and MCP initialize/list/call.

Tests use only the fictional local sample and mocked model/GitHub responses. They do not contact a production app, exercise a paid model, or post to GitHub. Automated axe checks are useful evidence, not a WCAG certification or a substitute for assistive-technology review.

Reports and screenshots are in `.data/`; browser-test screenshots are in `test-results/`. These are ignored by Git. Reports persist across restarts; interrupted runs are marked as interrupted and need a new run. The MVP allows one browser run and one planning request at a time, with a 200-report cap. Use Past reviews → Delete to permanently remove a review and its screenshots after confirmation. Running reviews cannot be deleted. There is no automatic retention policy.

## Help and support

Every "Not verified" result links to what it means and how to fix it on the [help page](https://mmeek87.github.io/AsBuilt/help/). Ask questions in [Discussions](https://github.com/mmeek87/AsBuilt/discussions) and report problems with the [issue forms](https://github.com/mmeek87/AsBuilt/issues/new/choose). AsBuilt is maintained by one person in her spare time; expect a reply within about a week. Security problems go through the [security policy](SECURITY.md).

## Troubleshooting

| Symptom | Likely cause and fix |
| --- | --- |
| `Build AsBuilt first: pnpm build` at the root URL | The UI hasn't been built. Run `pnpm build`, then `pnpm start`. |
| Every run ends **Interrupted** with "Install the selected engine" | Playwright's browser is missing: `pnpm exec playwright install chromium`. If browsers live elsewhere, set `PLAYWRIGHT_BROWSERS_PATH`. |
| "This preview is not approved" | Add the site's exact origin (for example `https://preview.example.com`) to `ASBUILT_PREVIEW_ORIGINS`, then restart. |
| Results say **Not verified: this page asks for a password** | The check doesn't sign in. Check a page that doesn't need sign-in, or add sign-in with a dedicated test account ([help](https://mmeek87.github.io/AsBuilt/help/#sign-in-wall)). |
| Results say **Not verified: the page returned HTTP 5xx** | The site was down or erroring during the run. Retry when it's available; this isn't a confirmed defect. |
| `pnpm mcp:check` says "Start AsBuilt first" | Start the service. For a custom data folder, set `ASBUILT_TOKEN_FILE` to its `token` file. |
| GitHub errors mention an expired key or missing access | Check `GITHUB_APP_ID` and the private key, and that the app is installed on that repository (private repositories need explicit selection). |
| "Interactive previews require the isolated Docker worker" | External interactive runs need Docker and the worker image; see [Phase 2](docs/phase2.md). The bundled sample works without Docker. |

## Architecture and sources

See [architecture decisions](docs/architecture.md), [roadmap](docs/roadmap.md), and [verification record](docs/validation.md).

Implementation references checked November 24, 2026:

- [GitHub installation access tokens](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/generating-an-installation-access-token-for-a-github-app)
- [MCP TypeScript server transports](https://ts.sdk.modelcontextprotocol.io/server)
- [OpenAI function calling](https://developers.openai.com/api/docs/guides/function-calling) and [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Codex MCP configuration](https://developers.openai.com/codex/mcp)
- [Claude Code MCP configuration](https://code.claude.com/docs/en/mcp)
- [ChatGPT custom MCP connections](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt)

Instrument Serif and Public Sans are self-hosted; their SIL Open Font License files are in `public/fonts/`. The app loads no remote fonts or analytics.
