import { test } from "node:test";
import assert from "node:assert/strict";
import { helpLink } from "../server/help.ts";
import { brokenCommentBody } from "../server/pr-comment.ts";

test("each Not verified reason links to the matching help section", () => {
  const cases: [string, string][] = [
    ["The page returned HTTP 401: it's protected or needs sign-in, so this outcome could not be observed.", "protected"],
    ["Preview returned HTTP 403: it's protected or needs sign-in.", "protected"],
    ["The page returned HTTP 502, so this outcome could not be observed.", "site-error"],
    ["This page asks for a password, and this check doesn't sign in, so content behind sign-in could not be checked. Check a page that doesn't need sign-in, or add sign-in with a dedicated test account.", "sign-in-wall"],
    ['After signing in, AsBuilt didn\'t see "Sign out". The test account may be wrong or locked.', "sign-in"],
    ["No visible text “Total” in a static (JavaScript-off) page; it could still appear once scripts run.", "needs-javascript"],
    ["Found 3 visible matches for “Buy”; this check requires exactly one.", "too-many-matches"],
    ["No visible exact text match for “Total”. Found 2 visible containing match(es).", "check-wording"],
    ["The page had 2 blocked request(s). This result cannot be treated as verified.", "blocked-requests"],
    ["The initial journey page could not be loaded safely.", "page-didnt-load"],
    ["Screenshot evidence could not be captured.", "screenshot"],
    ["Something new.", "not-verified"],
  ];
  for (const [observed, topic] of cases)
    assert.equal(helpLink(observed), `https://mmeek87.github.io/AsBuilt/help/#${topic}`, observed);
});


test("a PR with no runnable check file is told why, inertly", () => {
  const body = brokenCommentBody(
    ["checkout: This check runs in interactive mode. [x](https://evil.example) @someone"],
    { sha: "a".repeat(40), marker: "<!-- asbuilt-verification -->" },
  );
  assert.ok(body.startsWith("<!-- asbuilt-verification -->"));
  assert.match(body, /Nothing was checked yet/);
  assert.match(body, /not a finding about your app/);
  assert.match(body, /help\/#plan-couldnt-run/);
  assert.match(body, /- `checkout: This check runs in interactive mode\. \[x\]\(https:\/\/evil\.example\) @someone`/);
});
