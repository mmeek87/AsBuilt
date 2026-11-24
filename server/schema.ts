import { z } from "zod";
export const actionSchema = z
  .object({
    type: z.enum(["click", "fill", "select"]),
    name: z.string().min(1).max(100),
    value: z.string().max(200),
  })
  .strict();
export const criterionSchema = z
  .object({
    id: z.string().max(80),
    expected: z.string().min(1).max(1000),
    kind: z.enum(["text", "heading", "button", "required", "manual"]),
    value: z.string().max(200),
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
  mode: "sample" | "preview";
  plan: Plan;
  results: Result[];
  blockedRequests: number;
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
    else if (quoted && /\b(see|show|display|visible|text)\b/i.test(expected))
      kind = "text";
    return { id: `criterion-${i + 1}`, expected, kind, value: quoted };
  });
}
export const sampleIntent =
  'Show a heading called "Plan your visit". The "Email address" field is required. Show a button called "Book a visit". Show the text "Free cancellation". Send a confirmation email after booking.';

export function validateExecution(plan: Plan) {
  const count = plan.criteria.reduce((n, c) => n + (c.actions?.length || 0), 0);
  if (count > 20) throw Error("Limit each run to 20 actions in total.");
  if (count && plan.execution !== "interactive")
    throw Error("Actions require interactive verification.");
  if (plan.execution === "interactive" && !plan.actionsApproved)
    throw Error("Review and approve the interactive actions before running.");
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
