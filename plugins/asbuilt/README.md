# AsBuilt

Check what your website actually does. Turn an intention into reviewable checks, run only the checks you approve, and inspect results with evidence and honest limitations.

This is an MIT-licensed **local plugin**. It contains a skill and a Node.js command helper. Your own AsBuilt service performs verification and keeps reports on your computer. You do not need the maintainer's Vercel account, Neon database, hosted workspace key, or an AsBuilt subscription.

## Install the local service

Requires Node.js 24 and pnpm. From the [AsBuilt repository](https://github.com/mmeek87/AsBuilt):

```sh
git clone https://github.com/mmeek87/AsBuilt.git
cd AsBuilt
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm start
```

Keep the service running. Open `http://127.0.0.1:4310` and unlock it with your local `.data/token` value. The plugin reads that file itself; never paste it into chat. A custom setup can use `ASBUILT_TOKEN_FILE` or `ASBUILT_TOKEN`. Do not expose this single-operator service publicly.

The default setup needs no GitHub or model API credentials. Optional source analysis uses your own configured services and may incur their costs. External interactive previews need Docker and the repository's documented worker setup. Cloud browser execution is separate and is never enabled by this plugin.

## Install in Claude Code

Once this branch is merged and the repository is accessible to the installer:

```text
/plugin marketplace add mmeek87/AsBuilt
/plugin install asbuilt@asbuilt
```

For development, use `claude --plugin-dir /absolute/path/to/AsBuilt/plugins/asbuilt`. For Claude's directory, submit the plugin through the developer portal after completing the release checklist. A local plugin needs a host execution environment that can reach the local AsBuilt service. Do not assume Claude web chat or an isolated Cowork environment can reach your computer's localhost.

## Install in ChatGPT / Codex

The portable root `plugin.json` declares a desktop-only skill package. Import the ZIP through a supported local-plugin workflow, or prepare it for the OpenAI submission portal's **Skills only** route. It contains **no bundled MCP server** and no lifecycle hooks. Availability and submission access depend on the host and account. Test a clean desktop installation before submitting; a valid manifest alone is not proof of host compatibility.

Optional developer MCP setup remains in the repository's `docs/phase4.md`; it is not included in this directory package. OpenAI's public local-MCP route currently requires approved-partner access. This skills package does not pretend to be a remote MCP connector.

## First use

Ask: “Use AsBuilt. My local checkout is `/absolute/path/to/AsBuilt`. Draft checks for the fictional sample and explain what you can verify. Show me the plan before running anything.”

The helper can also be used directly:

```sh
node plugins/asbuilt/scripts/asbuilt.mjs --home /absolute/path/to/AsBuilt status
node plugins/asbuilt/scripts/asbuilt.mjs --home /absolute/path/to/AsBuilt plan intent.json
node plugins/asbuilt/scripts/asbuilt.mjs --home /absolute/path/to/AsBuilt run reviewed-plan.json --approved
node plugins/asbuilt/scripts/asbuilt.mjs --home /absolute/path/to/AsBuilt progress RUN_UUID
node plugins/asbuilt/scripts/asbuilt.mjs --home /absolute/path/to/AsBuilt report RUN_UUID
```

Use `--url http://127.0.0.1:PORT` for a custom local port. Only exact localhost/127.0.0.1 HTTP origins are accepted; redirects and remote URLs are refused. Interactive runs also require `--approve-actions` after the user approves the actual actions.

## Data and limits

Reports and screenshots stay in the local service's `.data` folder by default. The helper contacts only that local service. The AI host processes prompts and returned results under that host's terms. When you enable optional GitHub/model integrations or approved external previews, those configured services receive the requests described in the repository documentation. No telemetry is added by this plugin.

“Not verified” means missing evidence, not success. Automated checks do not prove backend behavior, accessibility compliance, or correctness of an entire product. No passwords, purchases, submissions, or production tests. Installation does not approve a test run.

## Removal and support

Disable/uninstall the plugin in your host and stop the local service. Your reports are not deleted. Use the local UI to delete individual reviews. Report ordinary bugs through [GitHub Issues](https://github.com/mmeek87/AsBuilt/issues); redact credentials, source code, screenshots, and personal data before posting. Directory publisher/contact fields must be finalized by the maintainer before public submission.

## License

MIT. See `LICENSE`. The license applies to AsBuilt; third-party dependencies and assets retain their own notices.
