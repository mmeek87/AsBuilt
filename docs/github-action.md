# AsBuilt on GitHub

AsBuilt runs as a GitHub Action. After every preview deployment of a pull request, it checks the preview against what you said it should do, takes desktop and mobile screenshots, and comments on the PR. Nothing to host, and no AI calls.

**Cost:** free on public repositories. On private repositories it uses your account's included Actions allowance; one run takes about 2 to 4 minutes. To make sure you're never charged, keep your GitHub Actions budget at $0 (Settings → Billing and licensing → Budgets).

## How it works

1. **You describe the feature** to Claude or ChatGPT, with the AsBuilt skill installed. That's the agent part: your assistant turns your words and the PR's changes into concrete, observable checks.
2. **You review the checks.** The assistant writes them to `.asbuilt/<feature>.json` in your branch, so they're reviewed like any other change in the PR.
3. **Vercel deploys a preview.** GitHub tells the workflow the preview is ready.
4. **AsBuilt checks the preview** in a real browser, on desktop and mobile, following the plan exactly. It signs in only with a dedicated test account you add as secrets, and never buys anything or makes real submissions.
5. **You get the results** as a PR comment, in the job summary, and as screenshots in the **asbuilt-evidence** artifact. Each check is a Pass, a Fail, or Not verified, with the reason.
6. **You fix and push.** The next preview is checked again, and the same comment is updated.

## Setup (about 5 minutes)

1. Copy [`examples/asbuilt-vercel.yml`](../examples/asbuilt-vercel.yml) to `.github/workflows/asbuilt.yml` in your app's repository.
2. Add checks at `.asbuilt/<feature>.json` (one file per feature). Ask your assistant: _"Use AsBuilt to draft checks for this PR."_ Or start from this:

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

Not on Vercel? Call the Action from any workflow and pass the preview address:

```yaml
- uses: mmeek87/asbuilt@main
  with:
    url: https://your-preview.example.com
```

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
| `timeout-minutes`  | `10`                 | Stop and report "interrupted" (never "passed").                    |

Outputs: `status`, `passed`, `failed`, `not-verified`, `results-dir`.

## Safety

- The preview address comes from the workflow, never from the plan file. A plan can't point AsBuilt somewhere else.
- The same network rules as the local version apply: https only, only the preview's own origin, and private and internal addresses blocked.
- Clicks and page network traffic run only if written into the plan, where they're visible in the PR diff. Interactive checks run in an isolated, network-less Docker container on the runner.
- Page text in comments is shown literally, so a page can't inject mentions or links into your PR.
- The token is used only to find the PR and post one comment. Pull requests from forks get a read-only token, so they get the job summary but no comment.

## Protected Vercel previews

If your previews use Vercel Deployment Protection, copy the project's **Protection Bypass for Automation** secret (Vercel → Project → Settings → Deployment Protection), add it to your GitHub repository as the secret `VERCEL_AUTOMATION_BYPASS_SECRET`, and uncomment the `vercel-bypass-secret` line in the workflow. AsBuilt sends it only to the preview's own address. Without it, protected pages report **Not verified: protected or needs sign-in**, never Fail.

## Signing in with a test account

To check pages behind a login, create a **dedicated test account** in your app (never a real person's), add it as repository secrets `ASBUILT_TEST_EMAIL` and `ASBUILT_TEST_PASSWORD`, uncomment the two `test-…` lines in the workflow, and add a `signIn` block to the plan:

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

Put each feature's checks in its own file: `.asbuilt/browse.json`, `.asbuilt/checkout.json`, and so on (up to 10). Every PR rechecks all of them, so a change to checkout that breaks browsing is caught. A broken plan file is reported by name without stopping the others.

## Limits

- No one-time codes, CAPTCHAs, outside identity providers, real payments or order submission.
- Previews must be reachable from GitHub's servers (Vercel previews are).
- Screenshots are kept for 14 days and count toward your account's Actions storage on private repositories. If storage is full, results still post and the summary says screenshots weren't saved.
