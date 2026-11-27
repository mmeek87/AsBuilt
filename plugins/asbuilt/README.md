# AsBuilt

**Make sure what AI builds works as intended.** Bridge the gap between what you asked AI to build and what it actually delivers. It works with anything that opens in a browser: web apps, stores, dashboards, internal tools and sites. Your assistant reads your code and lists every feature in plain words, so you don't have to remember them all. You approve checks for what matters, and on every pull request AsBuilt opens the real preview and reports each check as **Pass**, **Fail**, or **Not verified**, with screenshots and a fix prompt.

AsBuilt is free and open source (MIT). There is no account, subscription, or hosted service.

Watch the [50-second demo](https://mmeek87.github.io/AsBuilt/#demo), or see it on [a real pull request](https://github.com/mmeek87/asbuilt-demo/pull/3).

## What's in this plugin

- One skill, `verify-build`, that teaches your assistant how to draft checks, ask for your approval, and read results honestly.
- A GitHub workflow template (`templates/asbuilt-workflow.yml`) that the skill can add to your repository.

It bundles no MCP server, no scripts and no hooks, and installing it never starts a test.

## Install

In Claude Code:

```text
/plugin install asbuilt --marketplace mmeek87/AsBuilt
```

In claude.ai or the Claude desktop app, add it from **Customize > Plugins**. In ChatGPT, install it from the plugin directory in the desktop app.

## GitHub mode (recommended)

Ask your assistant: "Set up AsBuilt on my repo." It reads your code and lists every feature it finds in plain words, so you don't have to remember them. You correct the list and pick what matters most. Then, with your permission, it opens a pull request that adds:

- `.github/workflows/asbuilt.yml`, which runs the [AsBuilt GitHub Action](https://github.com/mmeek87/AsBuilt) whenever a preview deployment finishes.
- `.asbuilt/features.json`, the feature map. Every PR comment shows how many features have checks and which don't yet.
- One `.asbuilt/<feature>.json` file per feature, holding the checks you approved.

After that, every pull request gets one AsBuilt comment showing what passed, what failed, what couldn't be verified, and a ready-to-paste fix prompt. Screenshots are saved as the `asbuilt-evidence` workflow artifact. The Action calls no AI model; your assistant plans, and the Action observes.

Only you can do these GitHub steps, and the assistant will walk you through them:

- If your Vercel previews are protected, add your project's automation bypass secret as the repository secret `VERCEL_AUTOMATION_BYPASS_SECRET`.
- If a check signs in, add a dedicated test account as `ASBUILT_TEST_EMAIL` and `ASBUILT_TEST_PASSWORD`. Never paste a password into chat, and never use a real customer account.

## Local mode (optional)

You can also run AsBuilt on your own computer and check a site from there. Setup is in the [AsBuilt repository's README](https://github.com/mmeek87/AsBuilt#local-app-optional-for-development). Local mode needs an assistant that can run commands on your computer, such as Claude Code, Claude in the desktop app, or Codex. The local service authenticates your assistant by itself, so you never paste an access key into chat. Don't expose it to the internet.

## What it runs, sends and stores

- **GitHub mode:** the Action runs on your GitHub runner. It opens only your preview's address, reads the `.asbuilt` files in your repository, posts or updates one comment on the pull request using the workflow's own GitHub permissions, and uploads screenshots as a workflow artifact in your repository. Secrets you add are sent only to your preview's own address. Nothing goes to the maintainer.
- **Local mode:** your assistant talks only to the AsBuilt service on your own computer. Reports and screenshots stay in that service's `.data` folder.
- **Your assistant** sees your prompts and the results you share with it, under that assistant's own terms.
- No telemetry, analytics, or tracking is added.

## Limits

"Not verified" means AsBuilt couldn't collect evidence (a login wall, an error page, an unclear check); it's never counted as a pass. AsBuilt works with anything that opens in a browser at a web address (web apps, stores, dashboards, sites); it doesn't test native mobile apps or APIs directly. Automated checks don't prove backend behavior, full accessibility compliance, or that a whole product is correct. Cart, checkout and payment steps run only on a test site and only if you approve them; payments use your payment provider's published test card (Stripe, Square, Braintree, Adyen and more) from AsBuilt's own list, so a real card can never be entered. It won't take actions on production. Only test with test accounts and test data.

## Support and removal

Every "Not verified" result links to its explanation on the [help page](https://mmeek87.github.io/AsBuilt/help/). Ask questions in [GitHub Discussions](https://github.com/mmeek87/AsBuilt/discussions) and report problems in [GitHub Issues](https://github.com/mmeek87/AsBuilt/issues/new/choose). Leave out passwords, private code, and personal data. AsBuilt is maintained by one person; expect a reply within about a week. Privacy details: https://mmeek87.github.io/AsBuilt/privacy/

To remove AsBuilt, uninstall the plugin in your assistant and delete `.github/workflows/asbuilt.yml` and the `.asbuilt` folder from your repository.

## License

MIT. See `LICENSE`.
