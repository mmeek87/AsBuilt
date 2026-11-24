import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import type { Criterion, Report } from "../server/schema.ts";
import "./style.css";
type Config = {
  hosting?: "vercel";
  executionEnabled?: boolean;
  github: boolean;
  agent: boolean;
  comments: boolean;
  origins: string[];
  sampleIntent: string;
  interactiveSampleCriteria: Criterion[];
  journeySampleCriteria: Criterion[];
  interactivePreviews: boolean;
  installUrl: string | null;
};
type Draft = {
  mode: "agent" | "guided";
  summary: string;
  criteria: Criterion[];
  gaps: string[];
  activity: string[];
  evidence: { path: string; line: number; quote: string }[];
  source?: {
    url: string;
    sha: string;
    repository: string;
    pr?: number;
    title: string;
  };
};
const kindLabels = {
  text: "Visible text",
  heading: "Heading",
  button: "Button",
  link: "Link",
  required: "Required field",
  manual: "Needs a separate test",
};
const statusLabels = {
  pass: "Pass",
  fail: "Fail",
  not_verified: "Not verified",
};
async function api(path: string, body?: unknown, method?: "DELETE") {
  const response = await fetch(path, {
    method: method ?? (body === undefined ? "GET" : "POST"),
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const value = await response.json();
  if (!response.ok)
    throw Error(value.error || "Something went wrong. Please try again.");
  return value;
}
function Icon({
  name,
}: {
  name: "plus" | "history" | "connect" | "lock" | "file";
}) {
  const paths = {
    plus: "M12 5v14M5 12h14",
    history: "M3 11a9 9 0 1 1 2 7M3 4v7h7m2-4v5l3 2",
    connect:
      "m9 15 6-6m-7 3-2 2a4 4 0 0 0 6 6l2-2m-2-12 2-2a4 4 0 0 1 6 6l-2 2",
    lock: "M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3",
    file: "M6 3h8l4 4v14H6zM14 3v5h4M9 12h6m-6 4h6",
  };
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name]} />
    </svg>
  );
}
function Arrow() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M5 12h14m-5-5 5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function App() {
  const [config, setConfig] = useState<Config | null>(null),
    [locked, setLocked] = useState(false),
    [token, setToken] = useState(""),
    [remember, setRemember] = useState(true),
    [step, setStep] = useState(0),
    [intent, setIntent] = useState(""),
    [mode, setMode] = useState<"sample" | "preview">("sample"),
    [sourceUrl, setSourceUrl] = useState(""),
    [target, setTarget] = useState(""),
    [share, setShare] = useState(false),
    [approved, setApproved] = useState(false),
    [draft, setDraft] = useState<Draft | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [history, setHistory] = useState<any[]>([]),
    [repos, setRepos] = useState<{ name: string }[]>([]),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [comment, setComment] = useState<{ body: string; nonce: string } | null>(
      null,
    ),
    [commentApproved, setCommentApproved] = useState(false);
  const [view, setView] = useState<"review" | "history" | "connections">(
    "review",
  );
  const [execution, setExecution] = useState<"static" | "interactive">(
    "static",
  );
  const [journey, setJourney] = useState(false);
  const [readUrls, setReadUrls] = useState("");
  const [actionsApproved, setActionsApproved] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  async function load() {
    try {
      setConfig(await api("/api/config"));
      setLocked(false);
      setHistory(await api("/api/runs"));
    } catch {
      setLocked(true);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    heading.current?.focus();
  }, [step, view]);
  useEffect(() => {
    if (!report || !["queued", "running"].includes(report.status)) return;
    let stopped = false;
    const id = setInterval(() => {
      api(`/api/runs/${report.id}`)
        .then((r) => {
          if (!stopped) {
            setReport(r);
            if (!["queued", "running"].includes(r.status))
              void api("/api/runs").then(setHistory);
          }
        })
        .catch((e) => {
          if (!stopped) setError(e.message);
        });
    }, 1200);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, [report?.id, report?.status]);
  async function action(label: string, fn: () => Promise<void>) {
    setBusy(label);
    setError("");
    setNotice("");
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy("");
    }
  }
  function changeCriterion(i: number, patch: Partial<Criterion>) {
    setApproved(false);
    setActionsApproved(false);
    setDraft((d) =>
      d
        ? {
            ...d,
            criteria: d.criteria.map((c, j) =>
              j === i ? { ...c, ...patch } : c,
            ),
          }
        : d,
    );
  }
  const complete = report?.status === "complete";
  const briefMode = step === 2 && report ? report.mode : mode;
  const briefRepository =
    step === 2 && report
      ? report.plan.source?.repository
      : draft?.source?.repository;
  const briefTarget = step === 2 && report ? report.plan.target : target;
  return (
    <>
      <a className="skip" href="#main">
        Skip to main content
      </a>
      <aside className="app-nav" aria-label="Workspace navigation">
        <a className="brand" href="/" aria-label="AsBuilt home">
          <svg width="27" height="27" viewBox="0 0 28 28" aria-hidden="true">
            <rect width="28" height="28" rx="7" fill="currentColor" />
            <path d="M8 8h5v3h-2v9H8zm12 12h-5v-3h2V8h3z" fill="#ffe17a" />
          </svg>
          <span>asbuilt</span>
        </a>
        <div className="workspace-name">
          <span className="workspace-avatar">W</span>Personal workspace
          <span className="local-label">Local</span>
        </div>
        <nav aria-label="Workspace">
          <button
            className={view === "review" ? "nav-item active" : "nav-item"}
            aria-current={view === "review" ? "page" : undefined}
            onClick={() => {
              setView("review");
              setStep(0);
              setError("");
            }}
          >
            <Icon name="plus" />
            New review
          </button>
          <button
            className={view === "history" ? "nav-item active" : "nav-item"}
            aria-current={view === "history" ? "page" : undefined}
            onClick={() => {
              setView("history");
              setError("");
              void api("/api/runs")
                .then(setHistory)
                .catch((e) => setError(e.message));
            }}
          >
            <Icon name="history" />
            Past reviews<span className="nav-count">{history.length}</span>
          </button>
          <button
            className={view === "connections" ? "nav-item active" : "nav-item"}
            aria-current={view === "connections" ? "page" : undefined}
            onClick={() => {
              setView("connections");
              setError("");
            }}
          >
            <Icon name="connect" />
            Connections
          </button>
          {!locked && (
            <button
              className="nav-item"
              onClick={() =>
                void action("Signing out…", async () => {
                  await api("/api/logout", {});
                  window.location.reload();
                })
              }
            >
              <Icon name="lock" />
              Sign out
            </button>
          )}
        </nav>
        <div className="nav-bottom">
          <span className="privacy-symbol">
            <Icon name="lock" />
          </span>
          <div>
            {config?.hosting === "vercel"
              ? "Reports stay in your private workspace"
              : "Reports stay on this device"}
            <small>Source sharing asks for approval.</small>
          </div>
        </div>
      </aside>
      <header className="topbar">
        <span className="breadcrumb">
          Workspace <span>/</span>{" "}
          <strong>
            {view === "history"
              ? "Past reviews"
              : view === "connections"
                ? "Connections"
                : step === 0
                  ? "New review"
                  : step === 1
                    ? "Review plan"
                    : "Verification report"}
          </strong>
        </span>
        <span className="version">
          Local preview <span>v0.1</span>
        </span>
      </header>
      <main id="main">
        {locked ? (
          <section className="unlock">
            <h1 ref={heading} tabIndex={-1}>
              Open your workspace
            </h1>
            <p>
              Unlock AsBuilt with your workspace access key. Your GitHub
              credentials stay on the server.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void action("Unlocking…", async () => {
                  await api("/api/session", { token, remember });
                  setToken("");
                  await load();
                });
              }}
            >
              <label htmlFor="key">Workspace access key</label>
              <input
                id="key"
                type="password"
                autoComplete="off"
                required
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-describedby="key-help"
              />
              <p id="key-help" className="hint">
                For the local app, use the key in <code>.data/token</code>. For
                the online app, use the hosted access key you configured.
              </p>
              <label className="remember-device">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                />
                Remember this device for 30 days
              </label>
              <button disabled={!!busy}>
                {busy || "Open workspace"}
                <Arrow />
              </button>
            </form>
          </section>
        ) : !config ? (
          <p role="status">Opening your workspace…</p>
        ) : (
          <>
            {view === "history" && (
              <section className="utility-page">
                <h1 ref={heading} tabIndex={-1}>
                  Past reviews
                </h1>
                <p className="intro">
                  Your checks, observations, and screenshots in one place.
                </p>
                {history.length === 0 ? (
                  <div className="empty-state">
                    <Icon name="history" />
                    <h2>No reviews yet</h2>
                    <p>
                      Your first completed or interrupted run will appear here.
                    </p>
                    <button
                      onClick={() => {
                        setView("review");
                        setStep(0);
                      }}
                    >
                      Start a review
                      <Arrow />
                    </button>
                  </div>
                ) : (
                  <>
                    <h2 className="sr-only">Recent runs</h2>
                    <ul className="review-list">
                      {history.map((h) => (
                        <li key={h.id} data-testid={`review-${h.id}`}>
                          <button
                            onClick={() =>
                              void action("Opening report…", async () => {
                                setReport(await api(`/api/runs/${h.id}`));
                                setComment(null);
                                setStep(2);
                                setView("review");
                              })
                            }
                          >
                            <span className="review-file">
                              <Icon name="file" />
                            </span>
                            <span className="review-title">
                              {h.mode === "sample"
                                ? "Sample verification"
                                : "Preview verification"}
                              <small>{h.intent}</small>
                            </span>
                            <span className="review-date">
                              {new Date(h.createdAt).toLocaleDateString()}
                            </span>
                            <span className="history-state">{h.status}</span>
                            <Arrow />
                          </button>
                          <button
                            className="delete-review"
                            disabled={
                              !!busy || ["queued", "running"].includes(h.status)
                            }
                            aria-label={`Delete ${h.mode === "sample" ? "sample" : "preview"} review from ${new Date(h.createdAt).toLocaleString()}`}
                            onClick={() => {
                              if (
                                !window.confirm(
                                  "Delete this review and its screenshots? This cannot be undone.",
                                )
                              )
                                return;
                              void action("Deleting review…", async () => {
                                await api(
                                  `/api/runs/${h.id}`,
                                  { confirmed: true },
                                  "DELETE",
                                );
                                setHistory((current) =>
                                  current.filter((r) => r.id !== h.id),
                                );
                                if (report?.id === h.id) {
                                  setReport(null);
                                  setStep(0);
                                  setComment(null);
                                }
                                setNotice("Review and screenshots deleted.");
                              });
                            }}
                          >
                            Delete
                          </button>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>
            )}
            {view === "connections" && (
              <section className="utility-page">
                <h1 ref={heading} tabIndex={-1}>
                  Connections
                </h1>
                <p className="intro">
                  Give AsBuilt the context it needs. Start with the sample while
                  you set things up.
                </p>
                <div className="connection-row">
                  <Icon name="connect" />
                  <div>
                    <h2>GitHub App</h2>
                    <p>
                      Read selected repositories and pin reviews to a specific
                      commit.
                    </p>
                    <details>
                      <summary>Setup steps</summary>
                      <ol>
                        <li>
                          Create a GitHub App with read-only Contents and Pull
                          requests permissions.
                        </li>
                        <li>Install it on selected test repositories.</li>
                        <li>
                          Add the app ID, installation ID, and private key path
                          to the server’s .env file, then restart.
                        </li>
                      </ol>
                      <p>
                        Full instructions are in the project README. Keep
                        credentials on the server.
                      </p>
                    </details>
                    {config.installUrl && (
                      <a
                        href={config.installUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Install GitHub App
                      </a>
                    )}
                  </div>
                  <span className="setup-state">
                    {config.github ? "Configured" : "Not connected"}
                  </span>
                </div>
                <div className="connection-row">
                  <Icon name="file" />
                  <div>
                    <h2>Planning agent</h2>
                    <p>
                      Turn requirements and selected source files into a
                      proposed test plan.
                    </p>
                    <details>
                      <summary>Setup steps</summary>
                      <p>
                        Set OPENAI_API_KEY and ASBUILT_MODEL in the server’s
                        .env file, then restart. You approve source sharing
                        separately for each review.
                      </p>
                    </details>
                  </div>
                  <span className="setup-state">
                    {config.agent ? "Configured" : "Not connected"}
                  </span>
                </div>
                <div className="connection-row">
                  <Icon name="connect" />
                  <div>
                    <h2>AI tools</h2>
                    <p>
                      Use AsBuilt from Codex, Claude Desktop or Claude Code.
                      Reviews and evidence stay in this workspace.
                    </p>
                    <details>
                      <summary>Connection guide</summary>
                      <p>
                        Keep AsBuilt running, then enable its local MCP
                        connection in your AI app. Ask it to check the AsBuilt
                        connection before planning a review. You approve checks
                        before they run.
                      </p>
                      <p>
                        Setup and troubleshooting are in docs/phase4.md. ChatGPT
                        web requires a separate hosted connection; it cannot use
                        this local address.
                      </p>
                    </details>
                  </div>
                  <span className="setup-state">Local MCP available</span>
                </div>
                <div className="connection-row">
                  <Icon name="lock" />
                  <div>
                    <h2>Approved previews</h2>
                    <p>
                      {config.origins.length
                        ? config.origins.join(", ")
                        : "No preview origins added yet."}
                    </p>
                    <details>
                      <summary>Setup steps</summary>
                      <p>
                        Add exact HTTPS staging origins to
                        ASBUILT_PREVIEW_ORIGINS in .env. Never add a production
                        store. Restart after updating.
                      </p>
                    </details>
                  </div>
                  <span className="setup-state">
                    {config.origins.length ? "Configured" : "Not configured"}
                  </span>
                </div>
              </section>
            )}
            {view === "review" && (
              <div className="review-workspace">
                <nav className="steps" aria-label="Verification progress">
                  {["Describe", "Review checks", "See evidence"].map(
                    (label, i) => (
                      <span
                        key={label}
                        aria-current={step === i ? "step" : undefined}
                        className={step === i ? "current" : ""}
                      >
                        <span className="step-number">{i + 1}</span>
                        {label}
                      </span>
                    ),
                  )}
                </nav>
                <div className="page-layout">
                  <div className="work">
                    {step === 0 && (
                      <>
                        <h1 ref={heading} tabIndex={-1}>
                          New review
                        </h1>
                        <p className="intro">
                          Describe what your app should do. Review the checks
                          before anything runs.
                        </p>
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void action(
                              mode === "preview" && sourceUrl
                                ? "Reading your repository…"
                                : "Drafting your checks…",
                              async () => {
                                const d = await api("/api/plan", {
                                  intent,
                                  ...(mode === "preview" && sourceUrl
                                    ? { url: sourceUrl, shareSource: share }
                                    : {}),
                                });
                                setDraft(d);
                                setExecution(
                                  d.criteria.some(
                                    (c: Criterion) => c.actions?.length,
                                  )
                                    ? "interactive"
                                    : "static",
                                );
                                setActionsApproved(false);
                                setApproved(false);
                                setStep(1);
                              },
                            );
                          }}
                        >
                          <fieldset className="mode-picker">
                            <legend>Review source</legend>
                            <label
                              className={mode === "sample" ? "chosen" : ""}
                            >
                              <input
                                type="radio"
                                name="mode"
                                checked={mode === "sample"}
                                onChange={() => {
                                  setMode("sample");
                                  setShare(false);
                                }}
                              />
                              <span>
                                <strong>Sample project</strong>
                                <small>No setup needed</small>
                              </span>
                            </label>
                            <label
                              className={mode === "preview" ? "chosen" : ""}
                            >
                              <input
                                type="radio"
                                name="mode"
                                checked={mode === "preview"}
                                onChange={() => setMode("preview")}
                              />
                              <span>
                                <strong>My project</strong>
                                <small>GitHub + preview</small>
                              </span>
                            </label>
                          </fieldset>
                          {mode === "preview" && (
                            <section className="source-section">
                              <h2>Connect the change</h2>
                              <p className="hint">
                                {config.github
                                  ? "GitHub App configured. Only installed repositories can be read."
                                  : "GitHub is not connected yet. Follow the GitHub App steps in README."}
                              </p>
                              {config.installUrl && (
                                <a
                                  href={config.installUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  Install the GitHub App{" "}
                                  <span className="sr-only">
                                    (opens a new tab)
                                  </span>
                                </a>
                              )}
                              {config.github && (
                                <button
                                  type="button"
                                  className="secondary small"
                                  disabled={!!busy}
                                  onClick={() =>
                                    void action("Connecting…", async () => {
                                      const data =
                                        await api("/api/repositories");
                                      setRepos(data.repositories);
                                      setNotice(
                                        data.truncated
                                          ? "Showing the first 100 installed repositories."
                                          : "Repository access checked.",
                                      );
                                    })
                                  }
                                >
                                  Check repository connection
                                </button>
                              )}
                              {repos.length > 0 && (
                                <p className="hint">
                                  Available:{" "}
                                  {repos.map((r) => r.name).join(", ")}
                                </p>
                              )}
                              <label htmlFor="source">
                                GitHub pull request or commit URL{" "}
                                <span className="optional">Optional</span>
                              </label>
                              <input
                                id="source"
                                type="url"
                                placeholder="https://github.com/your-team/project/pull/12"
                                value={sourceUrl}
                                onChange={(e) => setSourceUrl(e.target.value)}
                                aria-describedby="source-help"
                              />
                              <p id="source-help" className="hint">
                                {config.agent
                                  ? "The agent reads selected source files and proposes checks."
                                  : "AI agent not configured. Set the model and API key in .env to analyze a repository."}{" "}
                                Leave this blank to draft checks without
                                repository analysis.
                              </p>
                              {sourceUrl && (
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={share}
                                    onChange={(e) => setShare(e.target.checked)}
                                    required
                                  />
                                  <span>
                                    I approve sharing selected source files with
                                    the configured OpenAI model for this review.
                                  </span>
                                </label>
                              )}
                              <label htmlFor="target">
                                Preview or staging URL{" "}
                                <span className="optional">
                                  Optional for planning
                                </span>
                              </label>
                              <input
                                id="target"
                                type="url"
                                value={target}
                                onChange={(e) => setTarget(e.target.value)}
                                placeholder="https://your-preview.example.com"
                                aria-describedby="target-help"
                              />
                              <p id="target-help" className="hint">
                                {config.origins.length
                                  ? `Approved origins: ${config.origins.join(", ")}`
                                  : "No preview origins approved yet. Add your staging origin to ASBUILT_PREVIEW_ORIGINS."}{" "}
                                Never use a production store.
                              </p>
                            </section>
                          )}
                          <div className="label-row">
                            <label htmlFor="intent">What should happen?</label>
                            {mode === "sample" && (
                              <button
                                type="button"
                                className="text-button"
                                onClick={() => setIntent(config.sampleIntent)}
                              >
                                Use an example
                              </button>
                            )}
                          </div>
                          <div className="intent-editor">
                            <textarea
                              id="intent"
                              required
                              minLength={3}
                              maxLength={5000}
                              rows={6}
                              value={intent}
                              onChange={(e) => setIntent(e.target.value)}
                              placeholder={
                                'For example: Show a heading called "Plan your visit". The "Email address" field is required.'
                              }
                              aria-describedby="intent-help"
                            />
                            <div className="editor-foot">
                              <span>
                                <Icon name="file" />
                                {mode === "sample"
                                  ? "Sample studio"
                                  : "Your project"}
                              </span>
                              <span>Desktop & mobile</span>
                            </div>
                          </div>
                          <p id="intent-help" className="hint">
                            {mode === "sample"
                              ? "Try a fictional booking page. No real bookings or orders."
                              : "Describe observable behavior. Exact button and field names help."}
                          </p>
                          <div className="form-footer">
                            <span className="hint">
                              You’re in control of what runs.
                            </span>
                            <button
                              disabled={
                                !!busy ||
                                !!(
                                  mode === "preview" &&
                                  sourceUrl &&
                                  (!config.agent || !config.github)
                                )
                              }
                            >
                              {busy || "Create review plan"}
                              <Arrow />
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                    {step === 1 && draft && (
                      <>
                        <button
                          className="text-button back"
                          onClick={() => {
                            setStep(0);
                            setError("");
                          }}
                        >
                          Back to your intent
                        </button>
                        <h1 ref={heading} tabIndex={-1}>
                          Review your checks
                        </h1>
                        <p className="intro">
                          These are proposed checks, not results. Edit them so
                          they reflect what you actually want.
                        </p>
                        <div className="draft-note">
                          <span className="tag">
                            {draft.mode === "agent"
                              ? "Agent plan · not tested"
                              : "Guided draft · no AI analysis"}
                          </span>
                          <p>{draft.summary}</p>
                        </div>
                        {draft.source && (
                          <details className="source-evidence">
                            <summary>
                              Source reviewed · {draft.source.repository} ·{" "}
                              {draft.source.sha.slice(0, 7)}
                            </summary>
                            <p>{draft.source.title}</p>
                            <ul>
                              {draft.activity.map((a, i) => (
                                <li key={i}>{a}</li>
                              ))}
                            </ul>
                            {draft.evidence.map((e, i) => (
                              <blockquote key={i}>
                                <a
                                  href={`https://github.com/${draft.source!.repository}/blob/${draft.source!.sha}/${e.path}#L${e.line}`}
                                  target="_blank"
                                  rel="noreferrer"
                                >
                                  {e.path}:{e.line}
                                </a>
                                <pre>{e.quote}</pre>
                              </blockquote>
                            ))}
                          </details>
                        )}
                        <form
                          onSubmit={(e) => {
                            e.preventDefault();
                            void action(
                              "Starting browser checks…",
                              async () => {
                                const source = draft.source
                                  ? {
                                      url: draft.source.url,
                                      sha: draft.source.sha,
                                      repository: draft.source.repository,
                                      ...(draft.source.pr
                                        ? { pr: draft.source.pr }
                                        : {}),
                                    }
                                  : undefined;
                                const r = await api("/api/runs", {
                                  intent,
                                  criteria: draft.criteria,
                                  target: mode === "sample" ? "sample" : target,
                                  approved,
                                  execution,
                                  ...(execution === "interactive"
                                    ? {
                                        actionsApproved,
                                        journey,
                                        readUrls: readUrls
                                          .split("\n")
                                          .map((x) => x.trim())
                                          .filter(Boolean),
                                      }
                                    : {}),
                                  ...(source ? { source } : {}),
                                });
                                setReport(r);
                                setComment(null);
                                setStep(2);
                              },
                            );
                          }}
                        >
                          <fieldset className="execution-choice">
                            <legend>Browser mode</legend>
                            <select
                              aria-label="Browser mode"
                              value={execution}
                              onChange={(e) => {
                                setExecution(
                                  e.target.value as "static" | "interactive",
                                );
                                setApproved(false);
                                setActionsApproved(false);
                              }}
                            >
                              <option
                                value="static"
                                disabled={draft.criteria.some(
                                  (c) => c.actions?.length,
                                )}
                              >
                                Static page checks
                              </option>
                              <option value="interactive">
                                Interactive checks
                              </option>
                            </select>
                            {execution === "interactive" && (
                              <>
                                <label className="check">
                                  <input
                                    type="checkbox"
                                    checked={journey}
                                    onChange={(e) => {
                                      setJourney(e.target.checked);
                                      setApproved(false);
                                      setActionsApproved(false);
                                    }}
                                  />
                                  Keep one session for this journey
                                </label>
                                {journey && (
                                  <>
                                    <label htmlFor="read-urls">
                                      Reviewed read-only data URLs (one exact
                                      URL per line)
                                    </label>
                                    <textarea
                                      id="read-urls"
                                      value={readUrls}
                                      onChange={(e) => {
                                        setReadUrls(e.target.value);
                                        setApproved(false);
                                        setActionsApproved(false);
                                      }}
                                    />
                                    <p>
                                      Only same-origin GET requests to these
                                      exact URLs are allowed. Do not include
                                      credentials or personal data.
                                    </p>
                                  </>
                                )}
                              </>
                            )}
                            <p className="hint">
                              {execution === "interactive"
                                ? journey
                                  ? "Checkpoints run in order in one session per screen size. Later actions stop if a checkpoint does not pass."
                                  : "Each check starts fresh. Add the clicks, typing, or selections needed before checking the result."
                                : "Checks visible content with JavaScript disabled. Remove actions to return to this mode."}
                            </p>
                            {execution === "interactive" &&
                              mode === "sample" && (
                                <button
                                  type="button"
                                  className="secondary small"
                                  onClick={() => {
                                    setJourney(true);
                                    setReadUrls("");
                                    setIntent(
                                      "Choose Jamaica, open Island Market, then view its product while preserving location.",
                                    );
                                    setDraft({
                                      ...draft,
                                      criteria: config.journeySampleCriteria,
                                      summary:
                                        "Fictional location-to-store-to-product journey.",
                                      gaps: [
                                        "This fixture contains no real stores, customers or purchases.",
                                      ],
                                    });
                                    setApproved(false);
                                    setActionsApproved(false);
                                  }}
                                >
                                  Load journey example
                                </button>
                              )}
                            {execution === "interactive" &&
                              mode === "sample" && (
                                <button
                                  type="button"
                                  className="secondary small"
                                  onClick={() => {
                                    setJourney(false);
                                    setReadUrls("");
                                    setIntent(
                                      "Reveal visit details and preview visits using synthetic names and visit types.",
                                    );
                                    setDraft({
                                      ...draft,
                                      criteria:
                                        config.interactiveSampleCriteria,
                                      summary:
                                        "A bundled interaction example. Review and edit each action before running.",
                                      gaps: [
                                        "The sample does not create bookings or send email.",
                                      ],
                                    });
                                    setActionsApproved(false);
                                    setApproved(false);
                                  }}
                                >
                                  Load interaction example
                                </button>
                              )}
                            {execution === "interactive" &&
                              mode === "preview" &&
                              !config.interactivePreviews && (
                                <p className="hint">
                                  Interactive previews require an isolated
                                  Docker worker. See docs/phase2.md. You can run
                                  the sample now.
                                </p>
                              )}
                          </fieldset>
                          <div className="criteria">
                            {draft.criteria.map((c, i) => (
                              <fieldset className="criterion" key={c.id}>
                                <legend>Check {i + 1}</legend>
                                <label htmlFor={`expected-${c.id}`}>
                                  Expected behavior
                                </label>
                                <input
                                  id={`expected-${c.id}`}
                                  required
                                  value={c.expected}
                                  maxLength={1000}
                                  onChange={(e) =>
                                    changeCriterion(i, {
                                      expected: e.target.value,
                                    })
                                  }
                                />
                                <div className="criterion-fields">
                                  <div>
                                    <label htmlFor={`kind-${c.id}`}>
                                      How to check
                                    </label>
                                    <select
                                      id={`kind-${c.id}`}
                                      value={c.kind}
                                      onChange={(e) =>
                                        changeCriterion(i, {
                                          kind: e.target
                                            .value as Criterion["kind"],
                                        })
                                      }
                                    >
                                      {Object.entries(kindLabels).map(
                                        ([k, v]) => (
                                          <option key={k} value={k}>
                                            {v}
                                          </option>
                                        ),
                                      )}
                                    </select>
                                  </div>
                                  {journey && execution === "interactive" && (
                                    <div>
                                      <label htmlFor={`url-${c.id}`}>
                                        Expected page URL (optional)
                                      </label>
                                      <input
                                        id={`url-${c.id}`}
                                        type="url"
                                        value={c.expectedUrl ?? ""}
                                        onChange={(e) =>
                                          changeCriterion(i, {
                                            expectedUrl:
                                              e.target.value || undefined,
                                          })
                                        }
                                      />
                                    </div>
                                  )}
                                  {c.kind !== "manual" && (
                                    <div>
                                      <label htmlFor={`value-${c.id}`}>
                                        Text or accessible name
                                      </label>
                                      <input
                                        id={`value-${c.id}`}
                                        required
                                        maxLength={200}
                                        value={c.value}
                                        onChange={(e) =>
                                          changeCriterion(i, {
                                            value: e.target.value,
                                          })
                                        }
                                      />
                                    </div>
                                  )}
                                  {c.kind !== "manual" && (
                                    <>
                                      <div>
                                        <label htmlFor={`match-${c.id}`}>
                                          Text matching
                                        </label>
                                        <select
                                          id={`match-${c.id}`}
                                          value={c.match ?? "exact"}
                                          onChange={(e) =>
                                            changeCriterion(i, {
                                              match: e.target
                                                .value as Criterion["match"],
                                            })
                                          }
                                        >
                                          <option value="exact">
                                            Exact text
                                          </option>
                                          <option value="contains">
                                            Contains text
                                          </option>
                                        </select>
                                      </div>
                                      <div>
                                        <label htmlFor={`occurrence-${c.id}`}>
                                          Visible matches needed
                                        </label>
                                        <select
                                          id={`occurrence-${c.id}`}
                                          value={c.occurrence ?? "unique"}
                                          onChange={(e) =>
                                            changeCriterion(i, {
                                              occurrence: e.target
                                                .value as Criterion["occurrence"],
                                            })
                                          }
                                        >
                                          <option value="unique">
                                            Exactly one
                                          </option>
                                          <option value="at_least_one">
                                            At least one
                                          </option>
                                        </select>
                                      </div>
                                    </>
                                  )}
                                </div>
                                {execution === "interactive" &&
                                  c.kind !== "manual" && (
                                    <div className="action-editor">
                                      <h2>Before checking</h2>
                                      {(c.actions || []).map((a, ai) => (
                                        <div className="action-row" key={ai}>
                                          <div>
                                            <label
                                              htmlFor={`action-type-${i}-${ai}`}
                                            >
                                              Action {ai + 1}
                                            </label>
                                            <select
                                              id={`action-type-${i}-${ai}`}
                                              value={a.type}
                                              onChange={(e) =>
                                                changeCriterion(i, {
                                                  actions: c.actions!.map(
                                                    (x, j) =>
                                                      j === ai
                                                        ? {
                                                            ...x,
                                                            type: e.target
                                                              .value as
                                                              | "click"
                                                              | "fill"
                                                              | "select"
                                                              | "navigate"
                                                              | "menu",
                                                          }
                                                        : x,
                                                  ),
                                                })
                                              }
                                            >
                                              {journey && (
                                                <>
                                                  <option value="menu">
                                                    Choose reviewed menu item
                                                  </option>
                                                  <option value="navigate">
                                                    Follow reviewed link
                                                  </option>
                                                </>
                                              )}
                                              <option value="click">
                                                Click button
                                              </option>
                                              <option value="fill">
                                                Type in field
                                              </option>
                                              <option value="select">
                                                Select option
                                              </option>
                                            </select>
                                          </div>
                                          <div>
                                            <label
                                              htmlFor={`action-name-${i}-${ai}`}
                                            >
                                              {a.type === "click"
                                                ? "Button name"
                                                : a.type === "menu"
                                                  ? "Menu item name"
                                                  : a.type === "navigate"
                                                    ? "Link name"
                                                    : "Field label"}
                                            </label>
                                            <input
                                              id={`action-name-${i}-${ai}`}
                                              required
                                              maxLength={100}
                                              value={a.name}
                                              onChange={(e) =>
                                                changeCriterion(i, {
                                                  actions: c.actions!.map(
                                                    (x, j) =>
                                                      j === ai
                                                        ? {
                                                            ...x,
                                                            name: e.target
                                                              .value,
                                                          }
                                                        : x,
                                                  ),
                                                })
                                              }
                                            />
                                          </div>
                                          {(a.type === "click" ||
                                            a.type === "menu") && (
                                            <div>
                                              <label
                                                htmlFor={`action-match-${i}-${ai}`}
                                              >
                                                Action name matching
                                              </label>
                                              <select
                                                id={`action-match-${i}-${ai}`}
                                                value={a.match ?? "exact"}
                                                onChange={(e) =>
                                                  changeCriterion(i, {
                                                    actions: c.actions!.map(
                                                      (x, j) =>
                                                        j === ai
                                                          ? {
                                                              ...x,
                                                              match: e.target
                                                                .value as
                                                                | "exact"
                                                                | "contains",
                                                            }
                                                          : x,
                                                    ),
                                                  })
                                                }
                                              >
                                                <option value="exact">
                                                  Exact name
                                                </option>
                                                <option value="contains">
                                                  Contains text (unique target
                                                  required)
                                                </option>
                                              </select>
                                            </div>
                                          )}
                                          {journey && (
                                            <div>
                                              <label
                                                htmlFor={`scope-role-${i}-${ai}`}
                                              >
                                                Within section (optional)
                                              </label>
                                              <select
                                                id={`scope-role-${i}-${ai}`}
                                                value={a.within?.role ?? ""}
                                                onChange={(e) =>
                                                  changeCriterion(i, {
                                                    actions: c.actions!.map(
                                                      (x, j) =>
                                                        j === ai
                                                          ? {
                                                              ...x,
                                                              within: e.target
                                                                .value
                                                                ? {
                                                                    role: e
                                                                      .target
                                                                      .value as
                                                                      | "region"
                                                                      | "dialog"
                                                                      | "navigation"
                                                                      | "main",
                                                                    name:
                                                                      x.within
                                                                        ?.name ??
                                                                      "",
                                                                  }
                                                                : undefined,
                                                            }
                                                          : x,
                                                    ),
                                                  })
                                                }
                                              >
                                                <option value="">
                                                  Whole page
                                                </option>
                                                <option value="region">
                                                  Named region
                                                </option>
                                                <option value="dialog">
                                                  Dialog
                                                </option>
                                                <option value="navigation">
                                                  Navigation
                                                </option>
                                                <option value="main">
                                                  Main content
                                                </option>
                                              </select>
                                              {a.within && (
                                                <>
                                                  <label
                                                    htmlFor={`scope-name-${i}-${ai}`}
                                                  >
                                                    Exact section name
                                                  </label>
                                                  <input
                                                    id={`scope-name-${i}-${ai}`}
                                                    maxLength={100}
                                                    value={a.within.name}
                                                    onChange={(e) =>
                                                      changeCriterion(i, {
                                                        actions: c.actions!.map(
                                                          (x, j) =>
                                                            j === ai
                                                              ? {
                                                                  ...x,
                                                                  within: {
                                                                    ...x.within!,
                                                                    name: e
                                                                      .target
                                                                      .value,
                                                                  },
                                                                }
                                                              : x,
                                                        ),
                                                      })
                                                    }
                                                  />
                                                </>
                                              )}
                                            </div>
                                          )}
                                          {a.type !== "click" && (
                                            <div>
                                              <label
                                                htmlFor={`action-value-${i}-${ai}`}
                                              >
                                                {a.type === "navigate" ||
                                                a.type === "menu"
                                                  ? "Reviewed destination URL"
                                                  : "Test value"}
                                              </label>
                                              <input
                                                id={`action-value-${i}-${ai}`}
                                                required={a.type !== "menu"}
                                                placeholder={
                                                  a.type === "menu"
                                                    ? "Leave empty only to open a submenu"
                                                    : undefined
                                                }
                                                maxLength={
                                                  a.type === "navigate" ||
                                                  a.type === "menu"
                                                    ? 2048
                                                    : 200
                                                }
                                                value={a.value}
                                                onChange={(e) =>
                                                  changeCriterion(i, {
                                                    actions: c.actions!.map(
                                                      (x, j) =>
                                                        j === ai
                                                          ? {
                                                              ...x,
                                                              value:
                                                                e.target.value,
                                                            }
                                                          : x,
                                                    ),
                                                  })
                                                }
                                              />
                                            </div>
                                          )}
                                          <button
                                            type="button"
                                            className="text-button"
                                            aria-label={`Remove action ${ai + 1} from check ${i + 1}`}
                                            onClick={() =>
                                              changeCriterion(i, {
                                                actions: c.actions!.filter(
                                                  (_, j) => j !== ai,
                                                ),
                                              })
                                            }
                                          >
                                            Remove
                                          </button>
                                        </div>
                                      ))}
                                      <button
                                        type="button"
                                        className="text-button"
                                        disabled={(c.actions?.length || 0) >= 6}
                                        onClick={() =>
                                          changeCriterion(i, {
                                            actions: [
                                              ...(c.actions || []),
                                              {
                                                type: "click",
                                                name: "",
                                                value: "",
                                              },
                                            ],
                                          })
                                        }
                                      >
                                        Add an action
                                      </button>
                                    </div>
                                  )}
                                {c.kind === "manual" && (
                                  <p className="hint">
                                    This will be marked “Not verified.” The
                                    runner cannot safely check this behavior
                                    yet.
                                  </p>
                                )}
                                <button
                                  type="button"
                                  className="text-button remove"
                                  disabled={draft.criteria.length === 1}
                                  aria-label={`Remove check ${i + 1}`}
                                  onClick={() => {
                                    setDraft({
                                      ...draft,
                                      criteria: draft.criteria.filter(
                                        (_, j) => i !== j,
                                      ),
                                    });
                                    setApproved(false);
                                  }}
                                >
                                  Remove check
                                </button>
                              </fieldset>
                            ))}
                          </div>
                          <button
                            type="button"
                            className="secondary small"
                            disabled={draft.criteria.length >= 12}
                            onClick={() =>
                              setDraft({
                                ...draft,
                                criteria: [
                                  ...draft.criteria,
                                  {
                                    id: crypto.randomUUID(),
                                    expected: "",
                                    kind: "text",
                                    value: "",
                                  },
                                ],
                              })
                            }
                          >
                            Add a check
                          </button>
                          <div className="scope">
                            <h2>What this run covers</h2>
                            <p>
                              {execution === "interactive"
                                ? journey
                                  ? "Reviewed checkpoints share one JavaScript-enabled session per viewport. Link destinations and data URLs above are part of your approval."
                                  : "Reviewed actions run with JavaScript enabled in a fresh browser for each check, on desktop and mobile. Only synthetic test data should be entered."
                                : "Desktop and mobile, in a fresh browser. Static checks run with JavaScript disabled."}
                            </p>
                            <p>
                              <strong>Target:</strong>{" "}
                              {mode === "sample"
                                ? "Bundled fictional studio"
                                : target || "Not selected yet"}
                            </p>
                            {mode === "preview" && (
                              <>
                                <label htmlFor="review-target">
                                  Approved preview URL
                                </label>
                                <input
                                  id="review-target"
                                  type="url"
                                  required
                                  value={target}
                                  onChange={(e) => {
                                    setTarget(e.target.value);
                                    setApproved(false);
                                  }}
                                  placeholder="https://your-preview.example.com"
                                />
                              </>
                            )}
                            <ul>
                              {draft.gaps.map((g, i) => (
                                <li key={i}>{g}</li>
                              ))}
                            </ul>
                          </div>
                          {execution === "interactive" && (
                            <label className="check approval">
                              <input
                                type="checkbox"
                                required
                                checked={actionsApproved}
                                onChange={(e) =>
                                  setActionsApproved(e.target.checked)
                                }
                              />
                              <span>
                                I approve the exact actions and synthetic test
                                values above. No submissions, purchases,
                                passwords, or real customer data.
                              </span>
                            </label>
                          )}
                          <label className="check approval">
                            <input
                              type="checkbox"
                              required
                              checked={approved}
                              onChange={(e) => setApproved(e.target.checked)}
                            />
                            <span>
                              I’ve reviewed these checks and approve this{" "}
                              {mode === "sample" ? "sample" : "preview-only"}{" "}
                              browser run. This is not a live production site.
                            </span>
                          </label>
                          {config.executionEnabled === false && (
                            <p role="status" className="hint">
                              Online browser tests are not enabled yet. Complete
                              the worker setup before running checks.
                            </p>
                          )}
                          <div className="form-footer">
                            <span className="hint">
                              {execution === "interactive"
                                ? "Reviewed actions only. No submissions or purchases."
                                : "No clicks, submissions, or purchases."}
                            </span>
                            <button
                              disabled={
                                !!busy ||
                                !approved ||
                                config.executionEnabled === false ||
                                (execution === "interactive" &&
                                  (!actionsApproved ||
                                    (mode === "preview" &&
                                      !config.interactivePreviews)))
                              }
                            >
                              {busy || "Run reviewed checks"}
                              <Arrow />
                            </button>
                          </div>
                        </form>
                      </>
                    )}
                    {step === 2 && report && (
                      <>
                        <button
                          className="text-button back"
                          onClick={() => {
                            setStep(draft ? 1 : 0);
                            setError("");
                          }}
                        >
                          Back to {draft ? "your checks" : "a new verification"}
                        </button>
                        <h1 ref={heading} tabIndex={-1}>
                          {complete
                            ? "Verification report"
                            : report.status === "interrupted"
                              ? "This run needs another try."
                              : "Checking what’s there."}
                        </h1>
                        <p className="intro">
                          {report.mode === "sample"
                            ? "Real browser observations on a fictional sample. These are not findings about your product."
                            : "Results apply only to the target and checks recorded below."}
                        </p>
                        <div className="report-meta">
                          <span className="tag">
                            {report.mode === "sample"
                              ? "Sample application"
                              : "Approved preview"}
                          </span>
                          <span>
                            {new Date(report.createdAt).toLocaleString()}
                          </span>
                        </div>
                        {["queued", "running"].includes(report.status) && (
                          <div className="running" role="status">
                            <span className="spinner" aria-hidden="true" />
                            Opening fresh desktop and mobile browsers. You can
                            leave this page; the local run continues.
                          </div>
                        )}
                        {report.error && (
                          <p role="alert" className="error">
                            {report.error}
                          </p>
                        )}
                        {report.results.length > 0 && (
                          <>
                            <div
                              className="result-counts"
                              aria-label="Result summary"
                            >
                              {(["pass", "fail", "not_verified"] as const).map(
                                (s) => (
                                  <span key={s}>
                                    <strong>
                                      {
                                        report.results.filter(
                                          (r) => r.status === s,
                                        ).length
                                      }
                                    </strong>
                                    {statusLabels[s]}
                                  </span>
                                ),
                              )}
                            </div>
                            <p className="hint">
                              Each check is counted once per viewport. “Pass” is
                              limited to the exact observation below.
                            </p>
                            <h2 className="sr-only">Verification results</h2>
                            <div className="results">
                              {report.results.map((r, i) => (
                                <details
                                  key={i}
                                  className="result"
                                  open={r.status !== "pass"}
                                >
                                  <summary>
                                    <span className={`status ${r.status}`}>
                                      {statusLabels[r.status]}
                                    </span>
                                    <span className="result-name">
                                      {r.criterion.expected}
                                      <small>{r.viewport}</small>
                                    </span>
                                  </summary>
                                  <div className="result-body">
                                    <dl>
                                      <dt>Expected</dt>
                                      <dd>{r.criterion.expected}</dd>
                                      <dt>Observed</dt>
                                      <dd>{r.observed}</dd>
                                    </dl>
                                    <h3>Reproduce this check</h3>
                                    <ol>
                                      {r.steps.map((s, j) => (
                                        <li key={j}>{s}</li>
                                      ))}
                                    </ol>
                                    {r.screenshot && (
                                      <a
                                        className="evidence-link"
                                        href={r.screenshot}
                                        target="_blank"
                                        rel="noreferrer"
                                      >
                                        View {r.viewport.toLowerCase()}{" "}
                                        screenshot{" "}
                                        <span className="sr-only">
                                          (opens a new tab)
                                        </span>
                                        <Arrow />
                                      </a>
                                    )}
                                    {r.fixPrompt && (
                                      <>
                                        <h3>Suggested next-step prompt</h3>
                                        <p className="fix-prompt">
                                          {r.fixPrompt}
                                        </p>
                                        <button
                                          className="secondary small"
                                          onClick={() =>
                                            void action(
                                              "Copying…",
                                              async () => {
                                                await navigator.clipboard.writeText(
                                                  r.fixPrompt!,
                                                );
                                                setNotice("Prompt copied.");
                                              },
                                            )
                                          }
                                        >
                                          Copy prompt
                                        </button>
                                      </>
                                    )}
                                  </div>
                                </details>
                              ))}
                            </div>
                          </>
                        )}
                        {complete && (
                          <div className="screenshots">
                            {(["Desktop", "Mobile"] as const).map((v) => {
                              const shot = report.results.find(
                                (r) => r.viewport === v && r.screenshot,
                              )?.screenshot;
                              return shot ? (
                                <figure key={v}>
                                  <a
                                    href={shot}
                                    target="_blank"
                                    rel="noreferrer"
                                  >
                                    <img
                                      src={shot}
                                      alt={`${v} screenshot of the tested page. Open full-size evidence.`}
                                    />
                                  </a>
                                  <figcaption>
                                    {v} · captured during this run
                                  </figcaption>
                                </figure>
                              ) : null;
                            })}
                          </div>
                        )}
                        <details className="scope">
                          <summary>Scope, source, and limitations</summary>
                          <p>
                            <strong>Target:</strong> {report.plan.target}
                            {report.plan.journey &&
                              " · Continuous journey (one session per viewport)"}
                          </p>
                          <p>
                            <strong>Commit:</strong>{" "}
                            {report.plan.source?.sha ||
                              "No GitHub source attached"}
                          </p>
                          <p>
                            <strong>Browser:</strong> Chromium{" "}
                            {report.browserVersion || "not started"}. JavaScript{" "}
                            {report.plan.execution === "interactive"
                              ? "enabled in the interaction worker"
                              : "disabled"}
                            .
                          </p>
                          <p>
                            <strong>Blocked requests:</strong>{" "}
                            {report.blockedRequests}
                          </p>
                          {!!report.blockedResources?.length && (
                            <>
                              <p>
                                Blocked resource origins (up to 40 groups).
                                Paths and URL parameters are omitted for
                                privacy. Counts do not establish their effect on
                                a check.
                              </p>
                              <ul>
                                {report.blockedResources.map((r, i) => (
                                  <li key={i}>
                                    {r.origin} · {r.resourceType} · {r.reason} ·{" "}
                                    {r.count} request(s)
                                  </li>
                                ))}
                              </ul>
                            </>
                          )}
                          <ul>
                            {report.limitations.map((l, i) => (
                              <li key={i}>{l}</li>
                            ))}
                          </ul>
                        </details>
                        <div className="report-actions">
                          <button
                            className="secondary"
                            onClick={() => {
                              const url = URL.createObjectURL(
                                new Blob([JSON.stringify(report, null, 2)], {
                                  type: "application/json",
                                }),
                              );
                              const a = document.createElement("a");
                              a.href = url;
                              a.download = `asbuilt-${report.id}.json`;
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 1000);
                            }}
                          >
                            Download report
                          </button>
                          {complete &&
                            config.comments &&
                            report.mode === "preview" &&
                            report.plan.source?.pr && (
                              <button
                                className="secondary"
                                disabled={!!busy}
                                onClick={() =>
                                  void action(
                                    "Preparing comment…",
                                    async () => {
                                      setComment(
                                        await api(
                                          `/api/runs/${report.id}/comment-preview`,
                                          {},
                                        ),
                                      );
                                      setCommentApproved(false);
                                    },
                                  )
                                }
                              >
                                Review PR comment
                              </button>
                            )}
                          <button
                            onClick={() => {
                              setStep(0);
                              setReport(null);
                              setDraft(null);
                              setError("");
                              setComment(null);
                            }}
                          >
                            Start a new review
                            <Arrow />
                          </button>
                        </div>
                        {comment && (
                          <section className="scope">
                            <h2>Approve the exact PR comment</h2>
                            <pre>{comment.body}</pre>
                            <label className="check">
                              <input
                                type="checkbox"
                                checked={commentApproved}
                                onChange={(e) =>
                                  setCommentApproved(e.target.checked)
                                }
                              />
                              <span>
                                Post this text to the attached pull request.
                                Local screenshots will not be uploaded.
                              </span>
                            </label>
                            <button
                              disabled={!commentApproved || !!busy}
                              onClick={() =>
                                void action(
                                  "Posting approved comment…",
                                  async () => {
                                    await api(
                                      `/api/runs/${report.id}/comment`,
                                      {
                                        nonce: comment.nonce,
                                        approved: true,
                                      },
                                    );
                                    setComment(null);
                                    setNotice(
                                      "The approved report was posted to the pull request.",
                                    );
                                  },
                                )
                              }
                            >
                              Post approved comment
                            </button>
                          </section>
                        )}
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
        {busy && (
          <p className="feedback" role="status">
            {busy}
          </p>
        )}
        {error && (
          <p className="feedback error" role="alert">
            {error}
          </p>
        )}
        {notice && (
          <p className="feedback" role="status">
            {notice}
          </p>
        )}
      </main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
