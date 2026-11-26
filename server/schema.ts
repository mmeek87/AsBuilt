import { z } from "zod";
export const actionSchema = z
  .object({
    // "check" ticks a radio button or checkbox by its label. "testPayment"
    // pays with Stripe's public test card inside Stripe's own payment frame;
    // it needs an approved test action and never takes a card number from
    // the plan.
    type: z.enum([
      "click",
      "fill",
      "select",
      "navigate",
      "menu",
      "check",
      "testPayment",
    ]),
    name: z.string().min(1).max(100),
    match: z.enum(["exact", "contains"]).optional(),
    within: z
      .object({
        role: z.enum(["region", "dialog", "navigation", "main"]),
        name: z.string().max(100),
      })
      .strict()
      .optional(),
    value: z.string().max(2048),
  })
  .strict();
export const criterionSchema = z
  .object({
    id: z.string().max(80),
    expected: z.string().min(1).max(1000),
    kind: z.enum(["text", "heading", "button", "link", "required", "manual"]),
    value: z.string().max(200),
    expectedUrl: z.string().url().max(2048).optional(),
    match: z.enum(["exact", "contains"]).optional(),
    // "none": must NOT be visible (privacy, signed-out states). Pair it with
    // a positive check on the same page so a blank page can't pass.
    occurrence: z.enum(["unique", "at_least_one", "none"]).optional(),
    within: z
      .object({
        role: z.enum([
          "region",
          "dialog",
          "navigation",
          "main",
          "article",
          "listitem",
          "group",
        ]),
        name: z.string().max(100),
        each: z.boolean().optional(),
      })
      .strict()
      .optional(),
    actions: z.array(actionSchema).max(6).optional(),
  })
  .strict();
export const planSchema = z
  .object({
    intent: z.string().min(3).max(5000),
    criteria: z.array(criterionSchema).min(1).max(12),
    target: z.string().max(2048),
    approved: z.literal(true),
    execution: z.enum(["static", "interactive"]).optional(),
    actionsApproved: z.literal(true).optional(),
    journey: z.boolean().optional(),
    publicReadOnly: z.boolean().optional(),
    network: z.enum(["restricted", "browser"]).optional(),
    browser: z.enum(["chromium", "firefox", "webkit"]).optional(),
    environment: z.enum(["test", "production"]).optional(),
    networkApproved: z.literal(true).optional(),
    // Test actions: on a test site only, the user may approve specific
    // actions AsBuilt normally refuses (add to cart, checkout, order steps).
    // Each approved action name is listed here, so it shows in the PR diff.
    // Before every action, the page must show siteMarker (for example a
    // "TEST SITE" banner); if it doesn't, nothing is clicked.
    testActions: z
      .object({
        siteMarker: z.string().trim().min(6).max(200),
        // A list of exact step labels, or "all": the user approved every
        // cart, checkout and order step on this test site (from
        // .asbuilt/settings.json), so they aren't asked again.
        approved: z.union([
          z.array(z.string().trim().min(1).max(100)).min(1).max(20),
          z.literal("all"),
        ]),
      })
      .strict()
      .optional(),
    readUrls: z.array(z.string().url().max(2048)).max(20).optional(),
    // Sign in with a dedicated test account first. Labels and text only;
    // the account itself comes from secrets, never from the plan.
    signIn: z
      .object({
        path: z
          .string()
          .regex(/^\/[^\s?#]*$/)
          .max(300),
        emailLabel: z.string().min(1).max(100),
        passwordLabel: z.string().min(1).max(100),
        submit: z.string().min(1).max(100),
        signedInText: z.string().min(1).max(200),
        // Optional consent/banner button to close first, if it's showing
        // (e.g. "Essential Only"). Never a consequential action.
        dismiss: z
          .string()
          .min(1)
          .max(60)
          .refine(
            (name) =>
              !/\b(buy|purchase|pay|checkout|order|delete|remove|send|publish|transfer|subscribe|book|confirm|submit|sign|log)\b/i.test(
                name,
              ),
            "dismiss may only close a banner, not take an action",
          )
          .optional(),
        // Optional page to open after signing in where signedInText is
        // shown on every viewport (headers often hide names on mobile).
        signedInPath: z
          .string()
          .regex(/^\/[^\s?#]*$/)
          .max(300)
          .optional(),
      })
      .strict()
      .optional(),
    source: z
      .object({
        url: z.string().url(),
        sha: z.string().regex(/^[a-f0-9]{40}$/),
        repository: z.string(),
        pr: z.number().int().positive().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type Criterion = z.infer<typeof criterionSchema>;
export type Plan = z.infer<typeof planSchema>;
export type Result = {
  criterion: Criterion;
  viewport: "Desktop" | "Mobile";
  status: "pass" | "fail" | "not_verified";
  observed: string;
  steps: string[];
  screenshot?: string;
  fixPrompt?: string;
};
export type Report = {
  id: string;
  status: "queued" | "running" | "complete" | "interrupted";
  createdAt: string;
  finishedAt?: string;
  mode: "sample" | "preview" | "public";
  plan: Plan;
  results: Result[];
  blockedRequests: number;
  blockedResources?: {
    origin: string;
    resourceType: string;
    reason: string;
    count: number;
  }[];
  error?: string;
  browserVersion?: string;
  limitations: string[];
};
export function generateCriteria(intent: string): Criterion[] {
  const parts = intent
    .split(/\n|(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 12);
  return parts.map((expected, i) => {
    const quoted = expected.match(/["“]([^"”]+)["”]/)?.[1] ?? "";
    let kind: Criterion["kind"] = "manual";
    if (quoted && /\brequired\b/i.test(expected)) kind = "required";
    else if (quoted && /\bheading\b/i.test(expected)) kind = "heading";
    else if (quoted && /\bbutton\b/i.test(expected)) kind = "button";
    else if (quoted && /\blink\b/i.test(expected)) kind = "link";
    else if (quoted && /\b(see|show|display|visible|text)\b/i.test(expected))
      kind = "text";
    return { id: `criterion-${i + 1}`, expected, kind, value: quoted };
  });
}
export const sampleIntent =
  'Show a heading called "Plan your visit". The "Email address" field is required. Show a button called "Book a visit". Show the text "Free cancellation". Send a confirmation email after booking.';

export function validateExecution(plan: Plan) {
  if (
    plan.signIn &&
    (plan.target === "sample" ||
      plan.execution !== "interactive" ||
      !plan.journey ||
      plan.network !== "browser" ||
      plan.environment !== "test")
  )
    throw Error(
      "Signing in needs a journey on a test environment with approved normal browser networking (sign-in sends a form to the preview). Use a dedicated test account, never a real one.",
    );
  if (
    plan.network === "browser" &&
    (plan.execution !== "interactive" ||
      plan.target === "sample" ||
      !plan.networkApproved ||
      !plan.environment)
  )
    throw Error(
      "Normal browser networking requires an explicit environment and approval that page traffic may change server data. Use a test environment and test accounts.",
    );
  if (plan.environment === "production" && !plan.publicReadOnly)
    throw Error(
      "Production browser runs currently support public inspection without user actions only.",
    );
  if (
    plan.publicReadOnly &&
    (plan.target === "sample" ||
      plan.execution !== "interactive" ||
      plan.journey ||
      plan.readUrls?.length ||
      plan.criteria.some((c) => c.actions?.length || c.expectedUrl))
  )
    throw Error(
      "Public read-only mode allows only action-free observations in a fresh isolated browser; no journeys, data API grants or navigation checkpoints.",
    );
  if (
    (plan.journey || plan.readUrls?.length) &&
    plan.execution !== "interactive"
  )
    throw Error("Journeys and data reads require interactive verification.");
  if (
    !plan.journey &&
    plan.criteria.some(
      (c) =>
        c.expectedUrl ||
        c.actions?.some(
          (a) => a.type === "navigate" || (a.type === "menu" && !!a.value),
        ),
    )
  )
    throw Error("Navigation and URL checkpoints require journey mode.");
  const origin =
    plan.target === "sample"
      ? "https://sample.asbuilt.invalid"
      : new URL(plan.target).origin;
  const urls = [
    ...(plan.readUrls ?? []),
    ...plan.criteria.flatMap((c) => [
      ...(c.expectedUrl ? [c.expectedUrl] : []),
      ...(c.actions ?? [])
        .filter(
          (a) => a.type === "navigate" || (a.type === "menu" && !!a.value),
        )
        .map((a) => a.value),
    ]),
  ];
  if (plan.testActions) {
    if (
      plan.execution !== "interactive" ||
      !plan.actionsApproved ||
      plan.environment !== "test" ||
      plan.network !== "browser" ||
      !plan.networkApproved ||
      plan.publicReadOnly
    )
      throw Error(
        'Test actions run only on a test site: the check needs "execution": "interactive", "actionsApproved": true, "environment": "test", "network": "browser" and "networkApproved": true.',
      );
    if (process.env.ASBUILT_ALLOW_TEST_ACTIONS !== "true")
      throw Error(
        "This check uses test actions, which are turned off for this repository. If this workflow only ever checks a test site, add allow-test-actions: true to the AsBuilt step in the workflow.",
      );
    const named = new Set(
      plan.criteria.flatMap((c) => (c.actions ?? []).map((a) => a.name)),
    );
    for (const name of plan.testActions.approved === "all"
      ? []
      : plan.testActions.approved) {
      if (/password|log ?in|sign ?in|log ?out|sign ?out/i.test(name))
        throw Error(
          `"${name}" can't be a test action. Sign-in uses the signIn step and a test account from secrets.`,
        );
      if (!named.has(name))
        throw Error(
          `Approved test action "${name}" isn't used by any step in this check. Approve only the steps the check takes.`,
        );
    }
  }
  for (const raw of urls) {
    const url = new URL(raw);
    if (
      url.origin !== origin ||
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      (!plan.testActions &&
        /(?:delete|logout|checkout|payment|purchase|submit|admin|auth)(?:\b|_)/i.test(
          url.pathname,
        ))
    )
      throw Error(
        "Journey URLs must be reviewed same-origin HTTPS destinations without credentials or sensitive operations.",
      );
  }

  const payments = plan.criteria.flatMap((c) =>
    (c.actions ?? []).filter((a) => a.type === "testPayment"),
  );
  if (payments.length && !plan.testActions)
    throw Error(
      "Paying with the test card is a test action: approve it for a test site first.",
    );
  if (payments.some((a) => a.value !== "" && a.value !== "stripe"))
    throw Error(
      'A test payment never takes card details from the check. Leave its value empty (or "stripe"); AsBuilt uses Stripe\'s public test card.',
    );
  const count = plan.criteria.reduce((n, c) => n + (c.actions?.length || 0), 0);
  if (count > 20) throw Error("Limit each run to 20 actions in total.");
  if (count && plan.execution !== "interactive")
    throw Error("Actions require interactive verification.");
  if (
    plan.execution === "interactive" &&
    !plan.publicReadOnly &&
    !plan.actionsApproved
  )
    throw Error(
      'This check runs in interactive mode (a full browser with JavaScript), which you need to approve first. Once you have reviewed it, add "actionsApproved": true to the check file.',
    );
}
export const interactiveSampleCriteria: Criterion[] = [
  {
    id: "visit-details",
    expected: "Opening the details reveals the visit duration.",
    kind: "text",
    value: "Your visit takes 30 minutes.",
    actions: [{ type: "click", name: "Show visit details", value: "" }],
  },
  {
    id: "personal-preview",
    expected: "Entering a name updates the visit preview.",
    kind: "text",
    value: "Studio tour for Alex",
    actions: [
      { type: "fill", name: "First name", value: "Alex" },
      { type: "click", name: "Preview visit", value: "" },
    ],
  },
  {
    id: "class-preview",
    expected: "Selecting a class updates the visit preview.",
    kind: "text",
    value: "Trial class for Sam",
    actions: [
      { type: "fill", name: "First name", value: "Sam" },
      { type: "select", name: "Visit type", value: "Trial class" },
      { type: "click", name: "Preview visit", value: "" },
    ],
  },
];

export const journeySampleCriteria: Criterion[] = [
  {
    id: "location",
    expected: "Jamaica is selected",
    kind: "text",
    value: "Sending to Jamaica",
    actions: [{ type: "click", name: "Jamaica", value: "" }],
  },
  {
    id: "store",
    expected: "Location persists on the store page",
    kind: "text",
    value: "Sending to Jamaica",
    expectedUrl: "https://sample.asbuilt.invalid/store",
    actions: [
      {
        type: "navigate",
        name: "Island Market",
        value: "https://sample.asbuilt.invalid/store",
      },
    ],
  },
  {
    id: "product",
    expected: "The product belongs to Island Market",
    kind: "text",
    value: "Sold by Island Market",
    expectedUrl: "https://sample.asbuilt.invalid/product",
    actions: [
      {
        type: "navigate",
        name: "Test mango",
        value: "https://sample.asbuilt.invalid/product",
      },
    ],
  },
];
