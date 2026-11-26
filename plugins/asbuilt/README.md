# AsBuilt

Check what your website actually does. You describe what you meant to build, your assistant turns that into checks you approve, and AsBuilt opens the real site and reports each check as **Pass**, **Fail**, or **Not verified**, with screenshots.

AsBuilt is free and open source (MIT). There is no account, subscription, or hosted service.

Watch the [50-second demo](https://mmeek87.github.io/AsBuilt/#demo), or see it on [a real pull request](https://github.com/mmeek87/asbuilt-demo/pull/3).

## What's in this plugin

- One skill, `verify-build`, that teaches your assistant how to draft checks, ask for your approval, and read results honestly.
- A GitHub workflow template (`templates/asbuilt-workflow.yml`) that the skill can add to your repository.
- A small Node.js helper (`scripts/asbuilt.mjs`) for the optional local mode. It has no dependencies and only talks to `127.0.0.1`.

It bundles no MCP server and no hooks, and installing it never starts a test.

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

For checking a site from your own computer, run the AsBuilt service from the repository (Node.js 24 and pnpm):

```sh
git clone https://github.com/mmeek87/AsBuilt.git
cd AsBuilt
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm build
pnpm start
```

Open `http://127.0.0.1:4310`. The helper reads the local access key from `.data/token` itself, so you never paste it into chat. Don't expose this service to the internet. Local mode needs an assistant that can run commands on your computer, such as Claude Code, Claude in the desktop app, or Codex.

## What it runs, sends and stores

- **GitHub mode:** the Action runs on your GitHub runner. It opens only your preview's address, reads the `.asbuilt` files in your repository, posts or updates one comment on the pull request with your workflow's `GITHUB_TOKEN`, and uploads screenshots as a workflow artifact in your repository. Secrets you add are sent only to your preview's own address. Nothing goes to the maintainer.
- **Local mode:** the helper connects only to your local AsBuilt service. Reports and screenshots stay in that service's `.data` folder.
- **Your assistant** sees your prompts and the results you share with it, under that assistant's own terms.
- No telemetry, analytics, or tracking is added.

## Limits

"Not verified" means AsBuilt couldn't collect evidence (a login wall, an error page, an unclear check); it's never counted as a pass. Automated checks don't prove backend behavior, full accessibility compliance, or that a whole product is correct. Cart, checkout and payment steps run only on a test site and only if you approve them; payments use Stripe's public test card, which can't charge real money. It won't take actions on production. Only test with test accounts and test data.

## Support and removal

Every "Not verified" result links to its explanation on the [help page](https://mmeek87.github.io/AsBuilt/help/). Ask questions in [GitHub Discussions](https://github.com/mmeek87/AsBuilt/discussions) and report problems in [GitHub Issues](https://github.com/mmeek87/AsBuilt/issues/new/choose). Leave out passwords, private code, and personal data. AsBuilt is maintained by one person; expect a reply within about a week. Privacy details: https://mmeek87.github.io/AsBuilt/privacy/

To remove AsBuilt, uninstall the plugin in your assistant and delete `.github/workflows/asbuilt.yml` and the `.asbuilt` folder from your repository.

## License

MIT. See `LICENSE`.
