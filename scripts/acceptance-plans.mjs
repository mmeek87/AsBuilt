// Writes AsBuilt plans for the live test shop (site/, on GitHub Pages).
// Usage: node scripts/acceptance-plans.mjs <site base URL> <output folder>
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const [baseArg, out] = process.argv.slice(2);
const base = new URL(baseArg.endsWith("/") ? baseArg : `${baseArg}/`);
const at = (path) => new URL(path, base).href;
mkdirSync(out, { recursive: true });
const write = (name, plan) =>
  writeFileSync(join(out, `${name}.json`), JSON.stringify(plan, null, 2));

// 6-step journey with clicks, navigation, kept state and URL checkpoints.
write("journey", {
  intent:
    "Choose Ontario, open Maple Market and its Notebook; Ontario stays selected; the Notebook names its seller and stock.",
  execution: "interactive",
  actionsApproved: true,
  journey: true,
  criteria: [
    {
      id: "region",
      kind: "text",
      value: "Sending to Ontario",
      expected: "Choosing Ontario updates the region.",
      actions: [{ type: "click", name: "Ontario", value: "" }],
    },
    {
      id: "store",
      kind: "heading",
      value: "Maple Market",
      expected: "The store opens.",
      expectedUrl: at("store/"),
      actions: [
        { type: "navigate", name: "Maple Market", value: at("store/") },
      ],
    },
    {
      id: "kept-region",
      kind: "text",
      value: "Sending to Ontario",
      expected: "Ontario stays selected on the store page.",
    },
    {
      id: "product",
      kind: "heading",
      value: "Notebook",
      expected: "The product opens.",
      expectedUrl: at("product/"),
      actions: [{ type: "navigate", name: "Notebook", value: at("product/") }],
    },
    {
      id: "seller",
      kind: "text",
      value: "Sold by Maple Market",
      expected: "The Notebook names Maple Market as seller.",
    },
    {
      id: "stock",
      kind: "text",
      value: "In stock",
      expected: "The Notebook is in stock.",
    },
  ],
});

// Sign in with the demo account, then see the signed-in page.
write("sign-in", {
  intent: "A signed-in shopper sees their orders.",
  execution: "interactive",
  actionsApproved: true,
  journey: true,
  network: "browser",
  networkApproved: true,
  environment: "test",
  signIn: {
    path: `${base.pathname}login/`,
    emailLabel: "Email",
    passwordLabel: "Password",
    submit: "Sign in",
    signedInText: "Sign out",
  },
  criteria: [
    {
      id: "orders",
      kind: "heading",
      value: "Your orders",
      expected: "The account page shows the shopper's orders.",
      actions: [
        { type: "navigate", name: "Your account", value: at("account/") },
      ],
    },
  ],
});

// Must fail: the shop never offers gift cards.
write("zz-must-fail", {
  intent:
    "Control: the shop does not offer gift cards, so this must be reported as a mismatch. (JavaScript on: AsBuilt never calls something missing from a JavaScript-off page.)",
  execution: "interactive",
  actionsApproved: true,
  journey: true,
  criteria: [
    {
      id: "gift",
      kind: "text",
      value: "Gift cards available",
      expected: "Gift cards are offered.",
    },
  ],
});
console.log(`Plans for ${base.href} written to ${out}`);
