# Test sites, branches and secrets, explained for people new to them

Many people building with AI have one copy of their app: the live one. They work straight on it, and they have never needed a test site, a branch or a secret. Don't assume they know these words, and don't make them feel behind for not knowing. Explain each idea in one or two plain sentences, say what it protects them from, then offer to set it up with them. Use their app's real names (their store, their customers) in the explanation.

Keep the engineer's judgment, drop the jargon: "a copy of your app where nothing is real", not "a staging environment".

## Find out what they have first

Before explaining anything, look for yourself (repository, hosting config, connected tools) and ask only what you can't see:

- **Branches and pull requests:** do changes go through pull requests, or straight to the main branch? (Recent commits on `main` with no PRs means straight to live.)
- **Previews:** does the host build a preview per pull request? (Vercel and Netlify do by default when connected to GitHub.)
- **Separate data:** do previews use a different database and payment keys from the live site, or the same ones? Check the host's environment variables per environment if you can, or ask. This is the one that matters most: a preview that uses the live database is not a test site.
- **Test accounts:** are there accounts that exist only for testing?

Then say where they stand in one or two sentences, for example: "Your previews are separate pages, but they use your live database, so a check that adds to cart would add to real carts. AsBuilt can still check what pages show, but not cart or checkout steps, until previews use test data."

## Built with Lovable, Bolt or Replit

Recognize these from the repository: Lovable projects usually have `lovable-tagger` in `package.json` and a README that mentions lovable.dev; Bolt projects often have a `.bolt` folder; Replit projects have a `.replit` file. If you can't tell, ask which tool they build with.

**What's different, in plain words:** these tools give you a live published site (for Lovable, a `lovable.app` address or your own domain) and an in-editor preview that isn't a stable public address. Neither is a separate test copy: the published site is your live site, with real customers and real data.

**What AsBuilt can do right away:** look-only checks against the published address with the any-host workflow (`templates/asbuilt-any-url.yml`, address saved as the `ASBUILT_URL` repository variable). Say plainly that these only look: nothing is clicked or typed on a live site, and no cart, checkout or order steps run there.

**The upgrade that unlocks everything else:** Lovable syncs your code to GitHub. Connect that GitHub repository to Vercel (or Netlify) as well, and every change made on a branch gets its own preview address; AsBuilt then checks each one before it goes live, with the regular Vercel workflow. Explain it in one sentence ("Vercel makes a private copy of your app for every change, so AsBuilt can test it before your customers see it") and offer to walk them through it. Two things to set up with them:

1. **Preview settings in Vercel:** the app's environment variables for Preview should point to test data, not the live database (for Lovable Cloud or Supabase, a second test project), and to the payment provider's test keys. Until then, keep to look-only checks on previews too.
2. **Where changes are made:** Lovable edits one synced branch (usually `main`). Changes made in Lovable go straight to that branch, so to get a preview before going live, make the change on another branch (Lovable can switch branches) and merge it with a pull request once AsBuilt's comment looks right.

Never suggest test actions against a Lovable, Bolt or Replit published address.

## Payments with any provider

AsBuilt pays only with a provider's **published test card**, typed from its own built-in list; a check names the provider, never a card number, so a real card can never be entered. Supported:

| `value` | Card AsBuilt types | Notes |
|---|---|---|
| `""` or `"stripe"` | Stripe's 4242 test card | Finds Stripe's own fields; no `fields` needed |
| `"square"` | Square sandbox Visa, CVV 111 | |
| `"braintree"` | Braintree sandbox Visa | |
| `"adyen"` | Adyen test Visa, 03/30, CVC 737 | |
| `"paddle"` | Paddle sandbox 4242 card, CVC 100 | Paddle says its checkout frame may block automation; not yet proven |
| `"test-visa"` | The common 4111 test Visa | For other sandboxes that accept it (Cybersource, Primer, Checkout.com and similar); confirm in the provider's docs first |

For every provider except Stripe, add `"fields"` with the exact labels or placeholders of the card fields as they appear on the checkout (they may be inside the provider's frame), for example `{"number": "Card number", "expiry": "MM/YY", "cvc": "CVV", "postal": "ZIP"}`; use `expiryMonth` and `expiryYear` for separate expiry boxes. Read the labels from the user's code or ask them to tell you what the checkout shows. The `testPayment` step only fills the form; pressing Pay is the next step, approved separately. PayPal and other wallet-style sandboxes sign in with a sandbox buyer account instead of a card, and aren't supported yet: say so.

## Branches and pull requests

**What it is, in plain words:** "A branch is a draft copy of your code. You (or your AI) make changes there, open a pull request to say 'here's what changed', and only when you approve it does it reach your live site."

**What it protects you from:** a change that breaks checkout going straight to your customers. With branches, AsBuilt checks the draft first and comments on the pull request before anything goes live.

**Setting it up:** if they've been committing straight to `main`, offer to work on a new branch for the next change and open a pull request, and explain each step as it happens the first time. Optionally suggest turning on branch protection for `main` (GitHub: Settings → Branches → Add rule → Require a pull request before merging), so nothing reaches live without a pull request. Ask before changing repository settings; they are the user's to change.

## A test site

**What it is, in plain words:** "A copy of your app where nothing is real: fake products, fake customers, test payments that can't charge a card. You can click every button without hurting anyone."

**What it protects you from:** checks (or you) creating real orders, emailing real customers, or charging real cards while testing. It's also what lets AsBuilt go beyond looking at pages and actually walk through sign-in, cart, checkout and the steps after an order.

**What a test site needs** (each one separate from the live site):

1. **Its own address.** A preview link per pull request, or one fixed test address (for example `test.yourapp.com`). On Vercel, previews come built in.
2. **Its own database.** For Supabase: create a second project (for example "yourapp-test") and put its URL and keys in the host's **Preview** environment variables, leaving **Production** on the live project. Firebase, Neon and PlanetScale work the same way with a second project or branch database. Load some fake data (a seed script your assistant can write).
3. **Test payment keys.** Use the payment provider's test or sandbox keys in the Preview environment only (Stripe: `pk_test_…`, `sk_test_…`; Square, Braintree, Adyen and Paddle all have sandboxes). Test mode can't charge real cards. AsBuilt pays only with the provider's published test card (see "Payments with any provider" below).
4. **Messages that go nowhere real.** Email and SMS from the test site should go to a test inbox or be switched off, so customers never get test messages.
5. **A visible banner.** Text like "TEST SITE · test data only" shown only when the test environment variable is set (for example `NEXT_PUBLIC_TEST_SITE=true` in Preview). People see at a glance where they are, and AsBuilt checks for this banner before every cart or checkout step. No banner, no clicks.
   **No banner yet?** Don't take the test address alone as proof: an address says where a copy is, not what data it uses. Ask for the test address, then offer to add the banner (a few lines, shown only when a test-site environment variable is set in the test deployment; you write it on a branch, they switch the variable on). If they can't add one, suggest any text that only ever appears on the test copy and use it as `siteMarker`: Stripe's "Test mode" badge on the payment page, or a seeded product named like "TEST ITEM – do not ship". Without any marker, keep to checks that only look and sign in, and say plainly that cart, checkout and order steps wait for a marker.
6. **Test accounts.** One shopper account, and one for each other role that matters (a store, an admin without two-step verification on the test site only). Created on the test database, never real people's accounts.

**Offer to do the work:** "Want me to set this up? I'll add the banner and the environment checks in code on a branch; you'll create the second database project and paste its keys into your host's Preview settings, because those are your accounts." Do the code parts with permission, on a branch with a pull request. Never ask for live keys or passwords in the chat.

**If they don't want a test site yet:** that's fine. AsBuilt still checks everything a signed-out visitor can see on any preview link, which catches a lot (missing pages, broken wording, private pages that open without signing in). Say plainly what stays unchecked until there's a test site.

## Adding secrets (test accounts, bypass keys)

Never ask for a password or key in the chat, and never write one into a file. Secrets go into GitHub, where the workflow can use them and nobody can read them back.

Give the user one of these, in plain steps:

- **Terminal (fastest, if they have the GitHub CLI):** in the project folder run `gh secret set ASBUILT_TEST_EMAIL`, then `gh secret set ASBUILT_TEST_PASSWORD`. Each asks them to type the value, which doesn't show on screen. (If `gh` isn't installed or signed in: `brew install gh` then `gh auth login` on a Mac.)
- **GitHub website:** the repository → Settings → Secrets and variables → Actions → New repository secret. Name `ASBUILT_TEST_EMAIL`, value the test account's email; repeat for `ASBUILT_TEST_PASSWORD`.

The current workflow templates already pass every AsBuilt secret, so adding the secret is enough; the next run uses it. (An older workflow may have those lines commented out; uncomment them for the user on a branch.) A second account uses `ASBUILT_SECOND_EMAIL` and `ASBUILT_SECOND_PASSWORD`. A protected Vercel preview uses `VERCEL_AUTOMATION_BYPASS_SECRET` (Vercel: Project → Settings → Deployment Protection → Protection Bypass for Automation).

If a run reports **Needs setup**, it's naming exactly one of these missing steps. Walk the user through that step; it isn't a problem with their app.
