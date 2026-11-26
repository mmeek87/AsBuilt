/**
 * Maps a Not verified explanation to a section of the public help page, so
 * every Not verified line in a PR comment links to what it means and what to
 * do. Matching is on AsBuilt's own wording; first match wins.
 */
export const HELP_URL = "https://mmeek87.github.io/AsBuilt/help/";

const topics: [RegExp, string][] = [
  [/HTTP 40[13]\b/, "protected"],
  [/HTTP \d{3}|HTTP unknown/, "site-error"],
  [/asks for a password/i, "sign-in-wall"],
  [/sign(ing)?[ -]in|signed-in|test account/i, "sign-in"],
  [/static|JavaScript disabled|JavaScript-off/i, "needs-javascript"],
  [/exactly one|scopes?\b|inspection limit/i, "too-many-matches"],
  [/exact .*match|containing match|role\b|check type/i, "check-wording"],
  [/interaction policy|test-site marker|test action|Stripe|test card/i, "test-actions"],
  [/blocked request|script error/i, "blocked-requests"],
  [/not shown|errored/i, "absence"],
  [/could not be (loaded|fetched)|Journey action|URL checkpoint|didn't load/i, "page-didnt-load"],
  [/screenshot/i, "screenshot"],
];

export function helpLink(observed: string) {
  const topic = topics.find(([re]) => re.test(observed))?.[1] ?? "not-verified";
  return `${HELP_URL}#${topic}`;
}
