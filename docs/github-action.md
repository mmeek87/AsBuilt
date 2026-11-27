# AsBuilt on GitHub

AsBuilt runs as a GitHub Action. After every preview deployment of a pull request, it checks the preview against what you said it should do, takes desktop and mobile screenshots, and comments on the PR. Nothing to host, and no AI calls.

**Cost:** free on public repositories. On private repositories it uses your account's included Actions allowance; one run takes about 2 to 4 minutes. To make sure you're never charged, keep your GitHub Actions budget at $0 (Settings → Billing and licensing → Budgets).

## How it works

1. **Your assistant maps the app.** With the AsBuilt plugin, Claude, ChatGPT or Codex reads your code and lists every feature it finds, in plain words, in `.asbuilt/features.json`. You correct the list; you never have to remember every feature yourself.
2. **You approve checks** for the features that matter most. The assistant writes them to `.asbuilt/<feature>.json` in your branch, so they're reviewed like any other change in the PR.
3. **Vercel deploys a preview.** GitHub tells the workflow the preview is ready.
4. **AsBuilt checks the preview** in a real browser, on desktop and mobile, following the plan exactly. It signs in only with a dedicated test account you add as secrets. Cart, checkout and order steps run only if you approve them for a test site (see Test actions below).
5. **You get the results** as a PR comment, in the job summary, and as screenshots in the **asbuilt-evidence** artifact. Each check is a Pass, a Fail, or Not verified, with the reason. The comment also shows coverage: how many features in your map have checks, and which don't yet.
6. **You fix and push.** The next preview is checked again, and the same comment is updated.

## The feature map

`.asbuilt/features.json` lists what your app does, written by your assistant from your code and confirmed by you. AsBuilt never treats it as evidence; it uses it to show coverage, so features without checks stay visible.

```json
{
  "app": "Fern & Field",
  "features": [
    { "id": "checkout-total", "name": "Checkout shows the order total before payment", "who": "Shopper", "where": "/cart", "check": "checkout", "confirmed": true },
    { "id": "order-emails", "name": "Shoppers get an order confirmation email", "who": "Shopper", "why": "Emails can't be checked in a browser", "confirmed": true },
    { "id": "referrals", "name": "Shoppers can refer a friend", "who": "Shopper", "where": "/buyer/referrals", "confirmed": false }
  ]
}
```

- `check` names the check file that covers the feature (`checkout` means `.asbuilt/checkout.json`). A feature counts as checked only if that file ran in this workflow.
- `why` explains a feature that can't be checked or is waiting on something.
- `confirmed: false` marks a feature found in the code that you haven't confirmed yet. The comment flags these as questions.

The map is optional. Without it, AsBuilt still runs every check file; it just can't show coverage.

## Test actions (test sites only)

AsBuilt refuses steps that could change real data, such as adding to a cart, checking out or marking an order ready. On a test site you can allow specific steps:

```json
"testActions": {
  "siteMarker": "TEST SITE · Test database and test payments only",
  "approved": ["Add to cart", "Continue to payment"]
}
```

- `approved` lists each step you agreed to, by its exact label. Nothing else that looks risky runs.
- `siteMarker` is text only your test site shows. AsBuilt checks for it before every step and stops if it's missing.
- The check also needs `execution: "interactive"`, `actionsApproved: true`, `environment: "test"`, `network: "browser"` and `networkApproved: true`.
- The workflow must opt in with `allow-test-actions: true`. Add it only to a workflow that never checks your live site.
- Don't want to approve steps one by one? Save a standing approval in `.asbuilt/settings.json`: `{"testSite": {"siteMarker": "TEST SITE", "approveAllTestActions": true}}`. It covers every step except sign-in in checks with `environment: "test"`. The workflow switch and the on-page marker still apply.

Also available with test actions:
- `{"type": "testPayment", "name": "Pay with the Stripe test card", "value": ""}` pays inside Stripe's frame with Stripe's public test card.
- `{"type": "testPayment", "name": "Pay with the Square test card", "value": "square", "fields": {"number": "Card number", "expiry": "MM/YY", "cvc": "CVV"}}` fills another provider's card fields (found by their labels or placeholders, also inside the provider's frames) with that provider's published test card. Providers: `stripe`, `square`, `braintree`, `adyen`, `paddle` (not yet proven: Paddle says its frame may block automation), and `test-visa` for other sandboxes that accept the common 4111 test Visa. It only fills the form; pressing Pay is the next approved step.
- Card details never come from the check file: a check names the provider, and AsBuilt types that provider's published test card from its own list, so a real card can't be entered. PayPal-style sandbox logins aren't supported yet.
- `{"type": "check", "name": "Refund"}` ticks a radio button or checkbox.
- A second test account: add `secondSignIn` (same shape as `signIn`), mark checkpoints `"as": "second"`, and pass `second-email` / `second-password` from secrets.
- Open a new record: navigate with a value ending in `/*` and a link name to match; AsBuilt opens the first visible matching link under that address on the preview.
- `{"type": "reload", "name": "page"}` reloads the page.
- Carry a value between pages or accounts: `{"type": "remember", "name": "pickupCode", "value": "^[A-Z0-9]{6}$"}` reads the one value on the page that matches the anchored pattern; a later `{"type": "fill", ..., "value": "{{pickupCode}}"}` types it. Values stay in the run's memory only.

## Setup (about 5 minutes)

1. Copy [`examples/asbuilt-vercel.yml`](../examples/asbuilt-vercel.yml) to `.github/workflows/asbuilt.yml` in your app's repository.
2. Ask your assistant: _"Set up AsBuilt on my repo."_ It maps your features into `.asbuilt/features.json` and drafts checks as `.asbuilt/<feature>.json` (one file per feature). Or write a check yourself, starting from this:

   ```json
   {
     "intent": "Shoppers can open Maple Market and see who sells each product.",
     "criteria": [
       {
         "id": "store",
         "expected": "The store page shows its name",
         "kind": "heading",
         "value": "Maple Market"
       },
       {
         "id": "seller",
         "expected": "Products say who sells them",
         "kind": "text",
         "value": "Sold by Maple Market"
       }
     ]
   }
   ```

   Check kinds: `text`, `heading`, `button`, `link`, `required`, `manual`; up to 12 checks. See the [plugin skill](../plugins/asbuilt/skills/verify-build/SKILL.md) for clicks and multi-step journeys.

3. Open a pull request. When Vercel's preview is ready, the **AsBuilt** check runs.

Not on Vercel? Use [`examples/asbuilt-any-url.yml`](../examples/asbuilt-any-url.yml): it checks one address you save as the repository variable `ASBUILT_URL` on every pull request and push, and you can run it any time from the Actions tab with any address. Or call the Action from your own workflow:

```yaml
- uses: mmeek87/AsBuilt@v1
  with:
    url: https://your-preview.example.com
```

**Start with checks that only look.** Your first checks don't need a test account, secrets or a test site: what signed-out visitors see, and whether private pages (account, settings, admin) stay private. Ask your assistant for "a first AsBuilt run with no secrets". Sign-in, cart and checkout come next, on a [test site](https://mmeek87.github.io/AsBuilt/help/#test-site), using the same files.

## What the check status means

| Status               | Meaning                                                                                                                                         |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅ Passed            | Every check was observed on desktop and mobile, with screenshots.                                                                               |
| ❌ Failed            | At least one observed mismatch. Set `fail-on-mismatch: "false"` to report without blocking.                                                     |
| Passed with warnings | Some checks were Not verified: the page needed sign-in, returned an error, or blocked something. That's never counted as a pass in the comment. |

## Inputs

| Input              | Default              | Purpose                                                            |
| ------------------ | -------------------- | ------------------------------------------------------------------ |
| `url`              | (required)           | The https preview address, or `sample` for the built-in demo page. |
| `plan`             | `.asbuilt`           | Folder of reviewed check files, or a single file.                  |
| `comment`          | `true`               | Post one PR comment and update it on each run.                     |
| `fail-on-mismatch` | `true`               | Fail the check when a mismatch is observed.                        |
| `timeout-minutes`  | about 2 per check file, at least 10 | Stop and report "interrupted" (never "passed").                    |

Outputs: `status`, `passed`, `failed`, `not-verified`, `results-dir`.

## Safety

- The preview address comes from the workflow, never from the plan file. A plan can't point AsBuilt somewhere else.
- The same network rules as the local version apply: https only, only the preview's own origin, and private and internal addresses blocked.
- Clicks and page network traffic run only if written into the plan, where they're visible in the PR diff. Interactive checks run in an isolated, network-less Docker container on the runner.
- Page text in comments is shown literally, so a page can't inject mentions or links into your PR.
- The token is used only to find the PR and post one comment. Pull requests from forks get a read-only token, so they get the job summary but no comment.

## Protected Vercel previews

If your previews use Vercel Deployment Protection, copy the project's **Protection Bypass for Automation** secret (Vercel → Project → Settings → Deployment Protection), add it to your GitHub repository as the secret `VERCEL_AUTOMATION_BYPASS_SECRET`, and the next run uses it (the current template already passes it; in an older workflow, uncomment the `vercel-bypass-secret` line). AsBuilt sends it only to the preview's own address. Without it, protected pages report **Not verified: protected or needs sign-in**, never Fail.

## Signing in with a test account

To check pages behind a login, create a **dedicated test account** in your app (never a real person's), add it as repository secrets `ASBUILT_TEST_EMAIL` and `ASBUILT_TEST_PASSWORD`, and add a `signIn` block to the plan:

```json
{
  "intent": "A signed-in shopper sees their orders.",
  "execution": "interactive",
  "journey": true,
  "actionsApproved": true,
  "network": "browser",
  "networkApproved": true,
  "environment": "test",
  "signIn": { "path": "/login", "emailLabel": "Email", "passwordLabel": "Password", "submit": "Sign in", "signedInText": "Sign out" },
  "criteria": [
    { "id": "orders", "kind": "heading", "value": "Your orders", "expected": "Orders are listed", "actions": [{ "type": "navigate", "name": "My account", "value": "https://YOUR-PREVIEW/account" }] }
  ]
}
```

AsBuilt types the account only into the sign-in page on your preview, checks that the "signed in" text appears, and masks password fields in screenshots. If sign-in fails, or needs a one-time code, CAPTCHA or an outside login page (Google, Auth0), every check says so as Not verified. Because the page itself can see what's typed, as with any login test, only ever use an account with nothing real behind it.

## One file per feature

Put each feature's checks in its own file: `.asbuilt/browse.json`, `.asbuilt/checkout.json`, and so on (up to 60). Every PR rechecks all of them, so a change to checkout that breaks browsing is caught. A broken plan file is reported by name without stopping the others. A check that's missing a setup step (a test account secret, or `allow-test-actions` for cart and checkout steps) is skipped and listed under **Needs setup** with the exact fix; it doesn't fail the run.

## Limits

- No one-time codes, CAPTCHAs, outside identity providers, real payments or order submission.
- Previews must be reachable from GitHub's servers (Vercel previews are).
- Screenshots are kept for 14 days and count toward your account's Actions storage on private repositories. If storage is full, results still post and the summary says screenshots weren't saved.
