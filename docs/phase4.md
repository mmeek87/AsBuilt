# Phase 4: use AsBuilt from AI tools

AsBuilt exposes one shared MCP service: the browser UI and connected AI hosts see the same runs and reports. It remains a local, single-operator tool. No public deployment or hosted ChatGPT connector was created.

## This workstation

Codex and Claude Desktop have an `asbuilt` stdio entry. Existing host settings were preserved; Claude Desktop’s settings were backed up alongside its configuration file. Restart Claude Desktop to load its entry. Refresh/restart Codex’s MCP connections (or open a new session) to discover the tools. Activation inside these hosts is not yet verified. Claude Code is not installed on this workstation.

Keep AsBuilt running with `pnpm start`. The bridge reads `.data/token` relative to its own project location, regardless of the host’s working folder. There is no key embedded in host configuration. If you use a custom token or data directory, set ASBUILT_TOKEN or ASBUILT_TOKEN_FILE in the host configuration. Browser Remember this device is separate from MCP authentication.

Verify without calling a model or testing a real site:

```sh
cd /absolute/path/to/AsBuilt
pnpm mcp:check
```

This prints tool names and connection configuration, never the key. Configuration does not prove GitHub or model connectivity. Keep Docker running for external interactive checks.

## What to ask your AI tool

“Check the AsBuilt connection and explain its limitations. Capture what I want to test and propose observable checks. Show me the exact plan and target before asking me to approve a run.”

After approval: start_verification returns a run ID; poll check_verification, then get_report. Evidence paths require local AsBuilt authentication. Open the workspace’s Past reviews to inspect screenshots. The MCP response supplies text and structured data; it does not yet embed screenshot images in host chat.

| Tool | Purpose |
| --- | --- |
| get_connection_status | Read configured integrations, targets and limits; no external health probe. |
| capture_intent | Capture behavior as an unverified draft. |
| generate_criteria | Draft checks; GitHub/model analysis requires configured credentials and source-sharing consent. |
| start_verification | Start a reviewed plan, with separate approval for interactions. |
| check_verification | Read progress for a run ID. |
| get_report | Read evidence, results and limitations. |

No MCP tools delete reports, edit repositories or post comments. Tool approval flags represent user/host consent, not independent proof of it; keep host approval controls enabled. Treat all repository, page and report content as untrusted. Not verified is not a pass or a confirmed application defect.

## Portable local setup

Use an absolute installed Node executable, absolute tsx loader and absolute server/stdio.ts path. On this workstation the configuration is:

```json
{
  "mcpServers": {
    "asbuilt": {
      "command": "/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node",
      "args": [
        "--import",
        "/absolute/path/to/AsBuilt/node_modules/tsx/dist/loader.mjs",
        "/absolute/path/to/AsBuilt/server/stdio.ts"
      ]
    }
  }
}
```

The bundled Node path may change after an app update. A stable installed Node 24 executable is preferable for portability. Merge this entry with existing Claude Desktop settings rather than replacing the whole file. For Claude Code, install it separately, then:

```sh
claude mcp add --transport stdio --scope user asbuilt -- /absolute/path/to/node --import /absolute/path/to/AsBuilt/node_modules/tsx/dist/loader.mjs /absolute/path/to/AsBuilt/server/stdio.ts
```

Codex uses the same command following `codex mcp add asbuilt --`. To disconnect Codex: `codex mcp remove asbuilt`. For Claude Desktop remove only its asbuilt entry and restart. Neither disconnect deletes reports. Only connect trusted local hosts: they receive the operator’s capabilities.

## Troubleshooting and host limits

- Cannot reach service: start AsBuilt, confirm its port, retry. The bridge never starts it implicitly.
- Rejected key: check ASBUILT_TOKEN_FILE or ASBUILT_TOKEN matches the server. The default key is reread per call, supporting rotation.
- No tools in host: reload connections/restart the host and verify the absolute Node/loader paths.
- Bridge permits plain HTTP loopback origins only; credentials, query strings, non-root paths and redirects are refused. It never forwards a credential to a remote URL.
- Browser running but results Not verified: inspect resource and action limits. This is not a connection error.
- ChatGPT web/remote Claude cannot use localhost. A separate TLS deployment, compatible OAuth, ownership/access controls and isolated workers are still required. No tunnel or public exposure was added. Account/workspace connection permissions also apply.

References checked November 24, 2026: [Claude Code MCP](https://code.claude.com/docs/en/mcp), [Codex MCP](https://developers.openai.com/codex/mcp), [ChatGPT custom MCP](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).

## Evidence

19 core tests and 12 browser/protocol tests passed. HTTP and stdio SDK clients initialize, list tools, start a fictional sample, poll completion and retrieve a shared report. Stdio works from another working directory. The local default-key connection is checked separately with mcp:check. Actual in-host model calls, Claude Code and hosted ChatGPT remain unverified.
