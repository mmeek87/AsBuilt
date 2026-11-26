import React, { useEffect, useState } from "react";
import type { summarizeCoverage } from "../server/product-review.ts";
type Coverage = ReturnType<typeof summarizeCoverage>;
const labels = {
  verified: "Verified",
  mismatch: "Observed mismatch",
  partial: "Partial evidence",
  not_tested: "Not tested",
  unclear: "Unclear expectation",
};
async function request(path: string, body?: unknown) {
  const r = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const v = await r.json();
  if (!r.ok) throw Error(v.error || "Request failed");
  return v;
}
export function ProductReviews({ openRun }: { openRun: (id: string) => void }) {
  const [reviews, setReviews] = useState<
    { id: string; title: string; createdAt: string; revision?: number }[]
  >([]);
  const [review, setReview] = useState<Coverage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [approved, setApproved] = useState<string | null>(null);
  async function load(id?: string) {
    setError("");
    try {
      setReviews(await request("/api/products"));
      if (id) setReview(await request(`/api/products/${id}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  return (
    <section className="utility-page product-coverage">
      <h1>Product coverage</h1>
      <p className="intro">
        What you asked for, what was checked, and what still needs evidence.
      </p>
      <button className="secondary small" onClick={() => void load(review?.id)}>
        Refresh coverage
      </button>
      {error && <p role="alert">{error}</p>}
      {!reviews.length && (
        <p>
          Ask your connected assistant to review the original build requests,
          documentation and end-to-end tests, then save a product review. It
          gathers the context for you; missing access stays visible.
        </p>
      )}
      <ul className="review-list">
        {reviews.map((r) => (
          <li key={r.id}>
            <button
              onClick={() => {
                setApproved(null);
                void load(r.id);
              }}
            >
              {r.title} {r.revision ? `· revision ${r.revision}` : ""}
              <small>{new Date(r.createdAt).toLocaleString()}</small>
            </button>
          </li>
        ))}
      </ul>
      {review && (
        <>
          <h2>{review.title}</h2>
          <p>{review.understanding}</p>
          <p>Baseline revision {review.revision}</p>
          {review.parentId && (
            <button
              className="secondary small"
              onClick={() => {
                setApproved(null);
                void load(review.parentId);
              }}
            >
              View previous baseline
            </button>
          )}
          {review.changeRequest && (
            <p>Latest request: {review.changeRequest}</p>
          )}
          {review.changes && (
            <details>
              <summary>What changed</summary>
              <p>
                {review.changes.added.length} requirements added ·{" "}
                {review.changes.changed.length} changed ·{" "}
                {review.changes.removed.length} removed
              </p>
              <ul>
                {review.changes.removed.map((r) => (
                  <li key={r.requirementId}>
                    {r.requirementId}: {r.reason}
                  </li>
                ))}
              </ul>
              <p>
                Previous evidence remains on its original baseline. This
                revision needs fresh checks.
              </p>
            </details>
          )}
          {review.discovery && (
            <section>
              <h3>Product understanding</h3>
              <p>{review.discovery.initialIntent}</p>
              <h3>Discovered functions</h3>
              <ul>
                {review.discovery.functions.map((f) => (
                  <li key={f.id}>
                    <strong>{f.title}</strong> · {f.actor}
                    {f.exclusion && <p>Outside this baseline: {f.exclusion}</p>}
                    <ul>
                      {f.requirementIds.map((id) => {
                        const r = review.requirements.find((r) => r.id === id)!;
                        return (
                          <li key={id}>
                            {r.title} — {labels[r.status]}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
              <h3>Connected journeys</h3>
              <ul>
                {review.discovery.journeys.map((j) => (
                  <li key={j.id}>
                    <strong>{j.title}</strong>
                    <p>
                      {j.functionIds
                        .map(
                          (id) =>
                            review.discovery!.functions.find(
                              (f) => f.id === id,
                            )!.title,
                        )
                        .join(" → ")}
                    </p>
                    {j.gap && <p>Journey gap: {j.gap}</p>}
                  </li>
                ))}
              </ul>
              <p>
                A journey map describes the flow; it does not mean that the
                end-to-end journey passed.
              </p>
              {!!review.discovery.openQuestions.length && (
                <>
                  <h3>Questions that affect expected behavior</h3>
                  <ul>
                    {review.discovery.openQuestions.map((q, i) => (
                      <li key={i}>{q}</li>
                    ))}
                  </ul>
                </>
              )}
            </section>
          )}
          <p>
            {Object.entries(review.counts)
              .map(
                ([key, count]) =>
                  `${count} ${labels[key as keyof typeof labels].toLowerCase()}`,
              )
              .join(" · ")}
          </p>
          {review.observedMismatches > 0 && (
            <p role="note">
              <strong>
                {review.observedMismatches === 1
                  ? "1 unclear requirement also failed a check."
                  : `${review.observedMismatches} unclear requirements also failed checks.`}
              </strong>{" "}
              Confirm the intended behavior, then decide whether to fix the app
              or the check.
            </p>
          )}
          <p>
            This covers the recorded requirements. It does not certify the whole
            site.
          </p>
          {!!review.missingContext.length && (
            <section>
              <h3>Missing context</h3>
              <ul>
                {review.missingContext.map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </section>
          )}
          {!!review.decisions.length && (
            <details>
              <summary>Reconciled decisions</summary>
              {review.decisions.map((d, i) => (
                <p key={i}>{d.summary}</p>
              ))}
            </details>
          )}
          <h3>Requested outcomes</h3>
          {review.requirements.map((r) => (
            <section key={r.id} className="source-section">
              <h3>
                {r.title} — {labels[r.status]}
                {r.status !== "mismatch" && r.observedMismatch
                  ? " · a check failed"
                  : ""}
              </h3>
              <p>
                {r.actor} · {r.priority}
                {r.basis === "inferred" ? " · inferred expectation" : ""}
              </p>
              {r.uncertainty && <p>Needs clarification: {r.uncertainty}</p>}
              <details>
                <summary>Why this is a requirement</summary>
                {r.citations.map((c, i) => (
                  <blockquote key={i}>
                    <p>{c.quote}</p>
                    <small>
                      {review.sources.find((s) => s.id === c.sourceId)?.title} ·
                      line {c.line}
                    </small>
                  </blockquote>
                ))}
              </details>
              <ul>
                {r.outcomes.map((o) => (
                  <li key={o.id}>
                    <strong>
                      {labels[o.status]}
                      {o.status !== "mismatch" && o.observedMismatch
                        ? " (a check failed)"
                        : ""}
                      :{" "}
                    </strong>
                    {o.expected}
                    {o.gap && <p>Coverage gap: {o.gap}</p>}
                    {o.evidence.map((e, i) => (
                      <div key={i}>
                        {e.note && <p>{e.note}</p>}
                        {e.runId && (
                          <button
                            className="secondary small"
                            onClick={() => openRun(e.runId!)}
                          >
                            View run evidence
                          </button>
                        )}
                      </div>
                    ))}
                  </li>
                ))}
              </ul>
            </section>
          ))}
          <h3>Planned scenarios</h3>
          {review.scenarios.map((s) => (
            <details key={s.id}>
              <summary>{s.title}</summary>
              <p>
                {s.plan.target} · {s.plan.browser ?? "chromium"} · desktop and
                mobile · {s.plan.execution ?? "static"}
              </p>
              <ol>
                {s.plan.criteria.map((c) => (
                  <li key={c.id}>
                    {c.expected}
                    {!!c.actions?.length && (
                      <p>
                        Actions:{" "}
                        {c.actions
                          .map(
                            (a) =>
                              `${a.type} “${a.name}”${a.value ? ` → ${a.value}` : ""}`,
                          )
                          .join("; ")}
                      </p>
                    )}
                    {c.expectedUrl && <p>Destination: {c.expectedUrl}</p>}
                    {c.within && (
                      <p>
                        Within {c.within.each ? "every visible" : "one visible"}{" "}
                        {c.within.role} named “{c.within.name}”. Hidden or
                        unloaded members are not covered.
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              {s.plan.network === "browser" && (
                <p>
                  Normal HTTPS loading permits page-initiated requests,
                  including writes. Use isolated test data and sandbox services.
                  No guarantee of zero server-side changes.
                </p>
              )}
              <label className="check">
                <input
                  type="checkbox"
                  checked={approved === s.id}
                  onChange={(e) => setApproved(e.target.checked ? s.id : null)}
                />
                I approve this scenario, its listed actions and its network
                traffic.
              </label>
              <button
                disabled={busy || approved !== s.id}
                onClick={async () => {
                  setBusy(true);
                  setError("");
                  setApproved(null);
                  try {
                    const r = await request(`/api/products/${review.id}/run`, {
                      scenarioId: s.id,
                      approved: true,
                      ...(s.plan.execution === "interactive"
                        ? { actionsApproved: true }
                        : {}),
                      ...(s.plan.network === "browser"
                        ? { networkApproved: true }
                        : {}),
                    });
                    openRun(r.id);
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Run this scenario
              </button>
            </details>
          ))}
          <details>
            <summary>Sources and existing test context</summary>
            <ul>
              {review.sources.map((s) => (
                <li key={s.id}>
                  <strong>{s.title}</strong> — {s.kind}
                  <p>
                    {s.reference}
                    {s.revision ? ` · ${s.revision}` : ""}
                  </p>
                </li>
              ))}
            </ul>
            <p>
              Test files and historical results are context. Only linked fresh
              runs contribute to coverage.
            </p>
          </details>
          <details>
            <summary>Evidence limits</summary>
            <ul>
              {review.limitations.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </details>
        </>
      )}
    </section>
  );
}
