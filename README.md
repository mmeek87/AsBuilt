# AsBuilt

**An independent product-review agent for people building with AI.**

AsBuilt starts with what you meant to build, examines a GitHub snapshot, and proposes observable checks. You review the plan before a separate browser runner gathers evidence. It never treats the agent's confidence as proof that the application works.

![AsBuilt review workspace](docs/screenshots/workspace.png)

A standalone TypeScript project. It does not import, modify, or test eBarrel. No live eBarrel requests or orders were made during development.

## Run locally

Requirements: Node 24 LTS and pnpm 11.25 or later in the 11.x line.

```sh
cd /Users/mel/Documents/ChatGPT/AsBuilt
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

Paste a URL such as `https://github.com/OWNER/REPO/pull/12` or a commit URL ending in the full 40-character SHA. Source files are read from Git blobs at the resolved immutable commit. The agent currently inspects selected files from that snapshot; it does **not** perform comprehensive diff analysis, infer all regression impact, or prove the preview is running the same commit.

### Optional report comments

Leave comments disabled by default. To enable, grant **Pull requests: read and write** to the app, approve the changed permission on the installation, and set `GITHUB_ALLOW_COMMENTS=true`. Ordinary reads still request read-only tokens; a write-capable token is minted only for posting.

Only a completed, real preview report attached to a PR can be posted. The UI first shows the exact comment, then requires a separate approval. The server issues a single-use, five-minute approval nonce and rechecks the PR head before posting. A changed PR head blocks posting. MCP exposes no comment tool. Screenshot files remain local and are not uploaded in the comment. No comment was posted during development.

## Preview safety and honest coverage

Set an explicit staging allowlist:

```dotenv
ASBUILT_PREVIEW_ORIGINS=https://your-preview.example.com
```

Use a clean HTTPS URL without credentials, query parameters, fragments or nonstandard ports. No wildcard origins. Literal IPs and private/reserved DNS results are rejected. Cross-origin resources are rejected except explicitly configured image directory prefixes in interactive mode. Each network request resolves DNS, checks all addresses and pins its TLS connection to a checked address; redirects pass through the same browser request policy. Requests are bounded by time, number and size.

The browser has an empty profile, no credentials, no permissions, no downloads, blocked service workers and WebSockets, and **JavaScript disabled in static mode**. Only GET navigation to the selected path and same-origin page resources are permitted. Fetch/XHR, POST and other mutations are not available. A GET can still have a poorly designed server-side effect: only use authorized non-production environments with no real customer data or orders. This is why the tool never assumes a production URL is safe.

In static mode, client-rendered content is outside coverage. Login-only pages, API-driven content, form submission, checkout, payments, emails and accessibility conformance remain outside supported coverage. Missing script-dependent content is marked **Not verified**, not a proven defect. Exact static mismatches can be **Fail**. A required-field pass proves a visible native `required` attribute, not end-to-end validation. A failed browser launch interrupts the run without manufacturing results.

External fonts, scripts, images and APIs may be blocked. Interactive mode supports deployment-tagged static assets and operator-scoped image directories; see the Phase 2 guide. Such a run is not equivalent to an unrestricted user browser. Interactive mode uses a separate worker with network-level egress restrictions for external previews. See [capabilities, setup and unverified limits](docs/phase2.md); do not simply enable arbitrary scripts or actions.

## MCP: one service, multiple hosts

For the key-free local setup, six tools, connection check and host-specific limitations, use the [Phase 4 guide](docs/phase4.md). Run `pnpm mcp:check` while AsBuilt is running. The older explicit-token configurations below remain supported.

Start the local web server first. All interfaces use the same planning service, runner and report store.

| Tool                 | Purpose                                                                                                                  |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `get_connection_status` | Read configuration and limitations without starting a review. |
| `capture_intent`     | Capture intended behavior and return an explicitly unverified draft.                                                     |
| `generate_criteria`  | Run the planning agent when a GitHub URL and source-sharing consent are supplied; otherwise make a labeled guided draft. |
| `start_verification` | Start a user-approved sample or allowlisted preview run with reviewed criteria.                                          |
| `check_verification` | Poll run status.                                                                                                         |
| `get_report`         | Read results and evidence paths.                                                                                         |

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

This MVP is **not yet a deployed ChatGPT/Claude connector**. It intentionally binds to loopback and rejects unknown hosts/origins. ChatGPT remote MCP setup depends on your account/workspace permissions and requires a reachable supported transport, with appropriate authentication. A plain localhost URL and our arbitrary bearer token are not a finished hosted integration.

Before hosted use: implement or deploy a compatible OAuth authorization boundary, per-user access and ownership, TLS, a narrowly configured MCP gateway or supported secure tunnel, separate browser workers with egress restrictions, report storage controls and host-specific onboarding. Forward only authenticated MCP traffic to the local service; do not expose the UI/admin API or remove origin checks to make a tunnel work. OAuth and this deployment layer are **remaining work**, not delivered placeholders claimed as connected.

## Validation

```sh
pnpm build
pnpm test
pnpm test:e2e
```

Unit tests cover target/SSRF policy, explicit approval, criterion bounds, immutable GitHub URL parsing, agent tool/path restrictions, citation validation and failure handling. Browser tests cover authentication, cross-origin rejection, keyboard access, desktop/mobile layouts, automated axe checks, actual sample evidence, report retrieval, and MCP initialize/list/call.

Tests use only the fictional local sample and mocked model/GitHub responses. They do not contact a production app, exercise a paid model, or post to GitHub. Automated axe checks are useful evidence, not a WCAG certification or a substitute for assistive-technology review.

Reports and screenshots are in `.data/`; browser-test screenshots are in `test-results/`. These are ignored by Git. Reports persist across restarts; interrupted runs are marked as interrupted and need a new run. The MVP allows one browser run and one planning request at a time, with a 200-report cap. Use Past reviews → Delete to permanently remove a review and its screenshots after confirmation. Running reviews cannot be deleted. There is no automatic retention policy.

## Push to a separate repository

Create a new **empty private** GitHub repository named `AsBuilt` under your account. Do not initialize it with another README. From this project's folder:

```sh
git add .
git commit -m "Build AsBuilt agent-first verification MVP"
git remote add origin https://github.com/YOUR_ACCOUNT/AsBuilt.git
git push -u origin main
```

The local repository is initialized on `main`. No author identity was configured on this workstation, so the first commit is left to you: set your Git name and verified or GitHub-provided private email if Git prompts. Do not substitute a made-up identity. If a remote already exists, inspect it before changing it. Never run these commands from eBarrel. Publishing the repository and registering the GitHub App are separate actions: the App is how AsBuilt gains controlled access to repositories it reviews.

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
