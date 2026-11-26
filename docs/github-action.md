# AsBuilt on GitHub

AsBuilt runs as a GitHub Action. After every preview deployment of a pull request, it checks the preview against what you said it should do, takes desktop and mobile screenshots, and comments on the PR. Nothing to host, and no AI calls.

**Cost:** free on public repositories. On private repositories it uses your account's included Actions allowance; one run takes about 2 to 4 minutes. To make sure you're never charged, keep your GitHub Actions budget at $0 (Settings → Billing and licensing → Budgets).

## How it works

1. **You describe the feature** to Claude or ChatGPT, with the AsBuilt skill installed. That's the agent part: your assistant turns your words and the PR's changes into concrete, observable checks.
2. **You review the checks.** The assistant writes them to `.asbuilt/plan.json` in your branch, so they're reviewed like any other change in the PR.
3. **Vercel deploys a preview.** GitHub tells the workflow the preview is ready.
4. **AsBuilt checks the preview** in a real browser, on desktop and mobile, following the plan exactly. It never signs in, submits forms or buys anything.
5. **You get the results** as a PR comment, in the job summary, and as screenshots in the **asbuilt-evidence** artifact. Each check is a Pass, a Fail, or Not verified, with the reason.
6. **You fix and push.** The next preview is checked again, and the same comment is updated.

## Setup (about 5 minutes)

1. Copy [`examples/asbuilt-vercel.yml`](../examples/asbuilt-vercel.yml) to `.github/workflows/asbuilt.yml` in your app's repository.
2. Add a plan at `.asbuilt/plan.json`. Ask your assistant: _"Use AsBuilt to draft checks for this PR."_ Or start from this:

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
| `plan`             | `.asbuilt/plan.json` | Your reviewed plan.                                                |
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

## Limits

- Vercel previews with Deployment Protection turned on can't be checked yet (AsBuilt doesn't send a bypass token). Use an unprotected preview for test data, or turn protection off for previews.
- No sign-in flows. Pages behind a login report Not verified with an explanation.
- The isolated worker for interactive checks hasn't been run on a GitHub runner yet; static and sample runs have been tested.
