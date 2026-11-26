# Open-source plugin release

Status: candidate package, not submitted or accepted by either directory.

AsBuilt's primary distribution is a local, MIT-licensed skill-and-script plugin. The existing hosted single-operator deployment remains optional and is not a public multi-user connector. The release does not enable paid browser execution.

## Two submissions

| Destination | Package | Requirements still to verify |
| --- | --- | --- |
| Claude plugin directory | ZIP / `.plugin` containing `.claude-plugin/plugin.json`, skill, helper, assets, README, LICENSE | Publisher account, real in-host install and workflow, listing contacts, reviewer requirements |
| OpenAI Plugin Directory for ChatGPT/Codex | Same files, with portable `plugin.json` and `requires_local_executor: true`; Skills only route | Submission access, verified publisher identity, real desktop workflow, review fields |

This release bundles no MCP server and no hooks. Do not label it a remote connector. OpenAI's separate local-MCP submission route is restricted to approved partners; a skills-only desktop package follows its standard route but still requires submission access. Neither submission is guaranteed acceptance. Web-only use would require additional hosted authentication and per-user storage, not the shared operator credential.

Official references checked 2026-11-24:

- https://developers.openai.com/plugins/deploy/desktop-only
- https://developers.openai.com/plugins/deploy/submission
- https://developers.openai.com/plugins/build/plugins
- https://claude.com/docs/plugins/overview
- https://claude.com/docs/connectors/building/submission
- https://claude.ai/directory/manage

## Listing draft

Name: AsBuilt

Tagline: Make sure what AI builds works as intended

Description: Bridge the gap between what you asked AI to build and what it actually delivers. Your assistant reads your code and maps every feature in plain words; you correct the list and approve checks. A free GitHub Action opens every preview deployment in a real browser on desktop and mobile and posts one pull request comment: Pass, Fail or Not verified, with screenshots, coverage of your feature map, and a fix prompt. On a test site you approve, it can also run your full order flow: sign in with test accounts, check out and pay with Stripe's test card. Free and open source; no account, no hosted service, no telemetry.

Suggested prompts:

1. “Set up AsBuilt on my repo.”
2. “Draft AsBuilt checks for the unchecked features that matter most.”
3. “Read the AsBuilt comment on my pull request and tell me what to fix first.”

## Before publication

Status as of 2026-11-26 (requirements re-checked against the Claude and OpenAI docs that day).

Done:
- Repository is public; history audited (no credentials; old commits show a local folder path and the author email, accepted by the maintainer).
- Publisher shown as Mel Meek (`author` in both manifests, `developerName` for OpenAI). Support is GitHub Issues.
- Privacy and support page: https://mmeek87.github.io/AsBuilt/privacy/
- Plugin README describes GitHub mode first and lists everything the plugin and Action run, send and store (the Claude security scan checks for undisclosed behavior).
- `claude plugin validate` passes for the plugin folder and the marketplace.
- The Claude plugin folder (`plugins/asbuilt`) holds instructions and the workflow template only: no scripts (the directory accepts scripts only from Verified organizations). The local command helper lives at `scripts/asbuilt-helper.mjs` in the repository, and the OpenAI manifest and icon live in `packaging/openai/`; `scripts/package-plugin.py` builds `release/asbuilt.plugin` (Claude) and `release/asbuilt.zip` (ChatGPT).

Maintainer steps:
- Merge the release branch to `main` and tag the tested revision (for example `v0.4.0`). The Claude directory follows a branch or tag.
- Claude: on a Pro or Max plan, open https://claude.ai/directory/manage, choose Submit new > Plugin bundle, repository `mmeek87/AsBuilt`, folder `plugins/asbuilt`, then Validate and fix anything marked Blocking.
- OpenAI: complete individual verification in the OpenAI Platform organization settings, then upload `release/asbuilt.zip` as a Skills only plugin and choose a category in the portal.
- Test a fresh install in Claude (Customize > Plugins > Upload plugin) and in the ChatGPT desktop app. Record host, version, prompt and outcome. Try "set up AsBuilt on my repo" against a throwaway repository, then uninstall.
- Accept each directory's policy attestations yourself.

## Packaging

Run `python3 scripts/package-plugin.py` from the repository root. It copies only the approved plugin files and the MIT license into `release/asbuilt.plugin` and `release/asbuilt.zip`. It excludes credentials, reports, node_modules, screenshots, and the hosted environment. No runtime dependencies are needed by the helper beyond Node 24; the separately installed local AsBuilt service has its own dependencies.

## Evidence

Record automated helper tests and a real local-service smoke test in the PR. Directory publication, host-specific installation, and a complete external-preview run remain separate checks. No multi-user OAuth implementation was added to the live site.
