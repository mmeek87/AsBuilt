# Contributing to AsBuilt

Use Node.js 24 and the pnpm version in `package.json`. Install dependencies with `pnpm install --frozen-lockfile`. Run `pnpm test`, `pnpm build`, and the relevant browser/protocol checks for behavior changes. The plugin helper has dependency-free tests: `node --test tests/plugin-helper.test.mjs`.

Keep changes focused and explain the problem, expected behavior, and verification in a pull request. Preserve authentication, loopback-only defaults, network isolation, target allowlists, and explicit approval before browser actions. Never label an unexecuted check passed.

Use fictional data and isolated test targets. Do not include `.env` files, access keys, reports, customer screenshots, or personal data in commits or issues. Optional third-party integrations must remain optional. Adding a plugin must not silently enable paid execution.

Contributions are provided under the project's MIT license. Keep third-party copyright and license notices intact.
