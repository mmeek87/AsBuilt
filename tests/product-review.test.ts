// Product coverage is where AsBuilt turns run evidence into "verified",
// "mismatch" or "not tested" for a whole product. These tests pin the
// integrity rules: no pass without fresh, matching, complete evidence.
import test from "node:test";
import assert from "node:assert/strict";
import {
  productService,
  validateProductSpec,
  type ProductReview,
  type ProductStorage,
} from "../server/product-review.ts";
import type { Report, Result } from "../server/schema.ts";

const source = {
  id: "req",
  title: "Original request",
  kind: "user_request" as const,
  reference: "chat",
  content:
    "Shoppers abroad choose a store.\nThe store page shows its products.\nCheckout is coming later.",
};
const criterion = {
  id: "heading",
  expected: "The store heading is visible",
  kind: "heading" as const,
  value: "Mandeville Fresh Mart",
};
const plan = {
  intent: "Shoppers can open a store page",
  target: "sample",
  execution: "static" as const,
  criteria: [criterion],
};
function spec(overrides: Record<string, unknown> = {}) {
  return {
    title: "eBarrel",
    understanding: "Diaspora shoppers buy from local stores.",
    sources: [source],
    missingContext: [],
    decisions: [],
    requirements: [
      {
        id: "store-page",
        title: "Open a store",
        actor: "Shopper",
        priority: "critical",
        citations: [{ sourceId: "req", line: 2, quote: "shows its products" }],
        outcomes: [
          {
            id: "store-heading",
            expected: "Store name is shown",
            checks: [{ scenarioId: "store", criterionId: "heading" }],
          },
        ],
      },
    ],
    scenarios: [{ id: "store", title: "Store", plan }],
    ...overrides,
  };
}
function memory() {
  const items = new Map<string, ProductReview>();
  const storage: ProductStorage = {
    list: async () => [...items.values()],
    get: async (id) => {
      const r = items.get(id);
      if (!r) throw Error("Product review not found.");
      return structuredClone(r);
    },
    create: async (r) => void items.set(r.id, structuredClone(r)),
    appendRun: async (id, run) => void items.get(id)!.runs.push(run),
  };
  return storage;
}
function result(
  viewport: "Desktop" | "Mobile",
  status: Result["status"],
  screenshot = `/evidence/x/${viewport}.png`,
): Result {
  return {
    criterion,
    viewport,
    status,
    observed: "observed",
    screenshot,
    steps: [],
  };
}
function harness() {
  const reports = new Map<string, Report>();
  let next: Partial<Report> = {};
  const service = productService(
    memory(),
    async (id) => {
      const r = reports.get(id);
      if (!r) throw Error("Report not found.");
      return r;
    },
    async (input: any) => {
      const report = {
        id: crypto.randomUUID(),
        status: "complete",
        createdAt: new Date().toISOString(),
        mode: "sample",
        plan: input,
        results: [],
        blockedRequests: 0,
        limitations: [],
        ...next,
      } as Report;
      reports.set(report.id, report);
      return report;
    },
  );
  return {
    service,
    reports,
    willReturn: (r: Partial<Report>) => (next = r),
  };
}
const outcomeStatus = (summary: any) =>
  summary.requirements[0].outcomes[0].status;

test("a requirement cannot rest only on code or tests unless marked inferred and uncertain", () => {
  const code = { ...source, id: "code", kind: "code" as const };
  const fromCode = spec({
    sources: [code],
    requirements: [
      {
        ...spec().requirements[0],
        citations: [{ sourceId: "code", line: 2, quote: "shows its products" }],
      },
    ],
  });
  assert.throws(() => validateProductSpec(fromCode), /cannot be the only source/);
  const inferred = structuredClone(fromCode) as any;
  inferred.requirements[0].basis = "inferred";
  inferred.requirements[0].uncertainty = "Not confirmed by the founder.";
  assert.doesNotThrow(() => validateProductSpec(inferred));
});

test("citations must match the captured source text at the cited line", () => {
  const bad = spec() as any;
  bad.requirements[0].citations = [
    { sourceId: "req", line: 1, quote: "shows its products" },
  ];
  assert.throws(() => validateProductSpec(bad), /Citation does not match/);
  bad.requirements[0].citations = [
    { sourceId: "req", line: 2, quote: "ships worldwide" },
  ];
  assert.throws(() => validateProductSpec(bad), /Citation does not match/);
});

test("every outcome needs planned evidence or an explicit gap", () => {
  const bad = spec() as any;
  bad.requirements[0].outcomes[0].checks = [];
  assert.throws(() => validateProductSpec(bad), /planned evidence or an explicit coverage gap/);
  bad.requirements[0].outcomes[0].checks = [
    { scenarioId: "store", criterionId: "missing" },
  ];
  assert.throws(() => validateProductSpec(bad), /Unknown check/);
});

test("saved scenarios cannot carry approval; approval comes only from the run call", async () => {
  const h = harness();
  const withApproval = spec() as any;
  withApproval.scenarios[0].plan = { ...plan, approved: true };
  assert.throws(() => validateProductSpec(withApproval));
  const saved = await h.service.save(spec());
  await assert.rejects(
    h.service.run({ id: saved.id, scenarioId: "store" }),
    "a run without approved:true must be refused",
  );
});

test("nothing is verified before a run, and a full matching pass verifies", async () => {
  const h = harness();
  const saved = await h.service.save(spec());
  assert.equal(outcomeStatus(await h.service.get(saved.id)), "not_tested");
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "pass")] });
  await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  const summary = await h.service.get(saved.id);
  assert.equal(outcomeStatus(summary), "verified");
  assert.equal(summary.counts.verified, 1);
});

test("a single failing viewport is a mismatch, not a pass", async () => {
  const h = harness();
  const saved = await h.service.save(spec());
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "fail")] });
  await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  assert.equal(outcomeStatus(await h.service.get(saved.id)), "mismatch");
});

test("missing screenshots, a missing viewport, or an interrupted run never count as passes", async () => {
  for (const [label, partial] of [
    ["no screenshot", { results: [result("Desktop", "pass"), result("Mobile", "pass", "")] }],
    ["one viewport", { results: [result("Desktop", "pass")] }],
    ["interrupted", { status: "interrupted", results: [result("Desktop", "pass"), result("Mobile", "pass")] }],
  ] as const) {
    const h = harness();
    const saved = await h.service.save(spec());
    h.willReturn(partial as unknown as Partial<Report>);
    await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
    assert.equal(outcomeStatus(await h.service.get(saved.id)), "not_tested", label);
  }
});

test("a run whose plan differs from the frozen scenario is not evidence", async () => {
  const h = harness();
  const saved = await h.service.save(spec());
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "pass")] });
  const run = await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  // Simulate a report whose recorded plan was altered (e.g. a relaxed check).
  const report = h.reports.get(run.id)!;
  report.plan = {
    ...report.plan,
    criteria: [{ ...criterion, match: "contains" }],
  } as any;
  const outcome = (await h.service.get(saved.id)).requirements[0].outcomes[0];
  assert.equal(outcome.status, "not_tested");
  assert.match(outcome.evidence[0].note!, /does not match the frozen scenario/);
});

test("deleted evidence is not a pass", async () => {
  const h = harness();
  const saved = await h.service.save(spec());
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "pass")] });
  const run = await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  h.reports.delete(run.id);
  assert.equal(outcomeStatus(await h.service.get(saved.id)), "not_tested");
});

test("the latest attempt governs: a later failure overrides an earlier pass", async () => {
  const h = harness();
  const saved = await h.service.save(spec());
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "pass")] });
  await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  h.willReturn({ results: [result("Desktop", "fail"), result("Mobile", "pass")] });
  await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  const summary = await h.service.get(saved.id);
  assert.equal(outcomeStatus(summary), "mismatch");
  assert.equal(summary.runs.length, 2, "earlier attempts are preserved");
});

test("an observed failure on an uncertain requirement stays visible", async () => {
  const h = harness();
  const uncertain = spec() as any;
  uncertain.requirements[0].uncertainty = "Founder has not confirmed the heading.";
  const saved = await h.service.save(uncertain);
  h.willReturn({ results: [result("Desktop", "fail"), result("Mobile", "fail")] });
  await h.service.run({ id: saved.id, scenarioId: "store", approved: true });
  const summary = await h.service.get(saved.id);
  const requirement = summary.requirements[0];
  assert.equal(requirement.status, "unclear");
  // The expectation is unconfirmed, but the observed failure must not be hidden.
  assert.equal(requirement.observedMismatch, true);
  assert.equal(summary.counts.unclear, 1);
  assert.equal(summary.observedMismatches, 1);
});

test("revisions start untested and must explain removed requirements", async () => {
  const h = harness();
  const baseline = {
    ...spec(),
    discovery: {
      entry: "existing_product",
      initialIntent: "Diaspora shopping",
      functions: [
        { id: "browse", title: "Browse stores", actor: "Shopper", sourceIds: ["req"], requirementIds: ["store-page"] },
      ],
      journeys: [],
      openQuestions: [],
    },
  };
  const parent = await h.service.establish(baseline);
  h.willReturn({ results: [result("Desktop", "pass"), result("Mobile", "pass")] });
  await h.service.run({ id: parent.id, scenarioId: "store", approved: true });
  assert.equal(outcomeStatus(await h.service.get(parent.id)), "verified");

  const child = await h.service.revise({
    parentId: parent.id,
    changeRequest: "Rename the store heading",
    spec: baseline,
    removals: [],
  });
  assert.equal(child.revision, 2);
  assert.equal(outcomeStatus(await h.service.get(child.id)), "not_tested");
  assert.equal(outcomeStatus(await h.service.get(parent.id)), "verified");

  const dropped = structuredClone(baseline) as any;
  dropped.requirements = [
    { ...dropped.requirements[0], id: "other" },
  ];
  dropped.discovery.functions[0].requirementIds = ["other"];
  await assert.rejects(
    h.service.revise({ parentId: parent.id, changeRequest: "x x x", spec: dropped, removals: [] }),
    /explicit reason/,
  );
  const noFunction = structuredClone(baseline) as any;
  noFunction.discovery.functions[0].id = "renamed";
  await assert.rejects(
    h.service.revise({ parentId: parent.id, changeRequest: "x x x", spec: noFunction, removals: [] }),
    /Keep discovered function browse/,
  );
});
