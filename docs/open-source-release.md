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

Tagline: Check what your website actually does

Description: AsBuilt helps builders compare intended website behavior with observable results. Describe your intent, review a concrete plan, and approve checks against a fictional sample or allowed preview. Read reports that distinguish passes, failures, interruptions, and unverified behavior. Runs through your local AsBuilt installation, with local reports and authenticated evidence. Requires Node.js 24 and a running local service. External interactive previews require Docker. Does not test production sites, submit forms, perform transactions, or claim unexecuted checks passed.

Suggested prompts:

1. “Turn this intended behavior into checks. Show me the plan before running anything.”
2. “Check the AsBuilt connection and explain what is currently available.”
3. “Read this AsBuilt report and separate observed failures from missing evidence.”

## Before publication

- Confirm public publisher name and support email. Do not infer these from account credentials.
- Review listing text and publish a factual privacy/support page. The bundled README describes data flow but is not a substitute for required directory fields.
- Audit the repository and full Git history for credentials/private artifacts before making it public. No visibility change is included in this preparation.
- Merge the reviewed release branch, make the repository accessible for installation, and tag the tested revision.
- Test fresh installations inside both target hosts. Include the host/environment, version, commands, and actual outcomes. Do not treat local CLI success as in-host certification.
- Verify a fictional sample, report retrieval, failure/Not verified handling, and uninstall. Do not run paid cloud tests or use eBarrel.
- Confirm the host has local execution and can reach the service. In an isolated VM/container, localhost may refer to that environment rather than the user's computer. Never bypass isolation or expose the service to work around this.
- Complete each vendor's eligibility/identity steps and submit the exact tested archive. User completes legal attestations and publisher identity verification.

## Packaging

Run `python3 scripts/package-plugin.py` from the repository root. It copies only the approved plugin files and the MIT license into `release/asbuilt.plugin` and `release/asbuilt.zip`. It excludes credentials, reports, node_modules, screenshots, and the hosted environment. No runtime dependencies are needed by the helper beyond Node 24; the separately installed local AsBuilt service has its own dependencies.

## Evidence

Record automated helper tests and a real local-service smoke test in the PR. Directory publication, host-specific installation, and a complete external-preview run remain separate checks. No multi-user OAuth implementation was added to the live site.
