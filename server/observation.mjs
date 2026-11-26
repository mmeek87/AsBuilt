// Shared by local and isolated browser runners. Matching options are part of the reviewed plan.
export async function observe(page, c, options = {}) {
  if (!c.within || c.kind === "manual" || !c.value.trim())
    return observeSingle(page, c, options);
  const { role, name, each = false } = c.within;
  const scopes = page
    .getByRole(role, { name, exact: true })
    .filter({ visible: true });
  if (options.waitMs) {
    try {
      await scopes
        .first()
        .waitFor({ state: "visible", timeout: options.waitMs });
    } catch {}
  }
  const count = await scopes.count();
  const label = `${role} “${name}”`;
  if (!count)
    return {
      status: options.staticMode ? "not_verified" : "fail",
      observed: `No visible ${label} scope found. An empty collection cannot pass.`,
    };
  if ((!each && count !== 1) || count > 100)
    return {
      status: "not_verified",
      observed: `Found ${count} visible ${label} scopes; ${each ? "the inspection limit is 100" : "exactly one scope is required"}.`,
    };
  const observations = [];
  for (let i = 0; i < count; i++) {
    // One wait budget for the scope, not one timeout per member. Never search outside it.
    observations.push(
      await observeSingle(scopes.nth(i), c, { ...options, waitMs: 0 }),
    );
  }
  if ((await scopes.count()) !== count)
    return {
      status: "not_verified",
      observed:
        "The visible collection changed size during inspection. Rerun after it settles.",
    };
  const failed = observations.filter((x) => x.status === "fail").length;
  const uncertain = observations.filter(
    (x) => x.status === "not_verified",
  ).length;
  const detail = observations
    .flatMap((x, i) =>
      x.status === "pass" ? [] : [`Item ${i + 1}: ${x.observed}`],
    )
    .slice(0, 3)
    .join(" ");
  return {
    status: failed ? "fail" : uncertain ? "not_verified" : "pass",
    observed:
      `Checked ${count} visible ${label} scope(s): ${count - failed - uncertain} passed, ${failed} failed, ${uncertain} not verified. ${detail || `Each scope contains the required ${c.kind} “${c.value}”.`} Only currently rendered visible members were checked.`.slice(
        0,
        1900,
      ),
  };
}

async function observeSingle(page, c, { staticMode = false, waitMs = 0 } = {}) {
  if (c.kind === "manual" || !c.value.trim())
    return {
      status: "not_verified",
      observed:
        "This behavior needs a dedicated safe test. No browser action was attempted.",
    };
  const exact = c.match !== "contains";
  const mode = exact ? "exact" : "containing";
  const locator =
    c.kind === "text"
      ? page.getByText(c.value, { exact })
      : c.kind === "required"
        ? page.getByLabel(c.value, { exact })
        : page.getByRole(c.kind, { name: c.value, exact });
  const visible = locator.filter({ visible: true });
  // "Must not be visible": never wait for the item to appear, and never
  // conclude absence from a static (JavaScript-off) page.
  if (c.occurrence === "none") {
    const shown = await visible.count();
    if (shown)
      return {
        status: "fail",
        observed: `Found ${shown} visible ${c.kind} match(es) for “${c.value}”, which should not be shown here.`,
      };
    return staticMode
      ? {
          status: "not_verified",
          observed: `No visible ${c.kind} “${c.value}” in a static (JavaScript-off) page; it could still appear once scripts run.`,
        }
      : {
          status: "pass",
          observed: `No visible ${mode} ${c.kind} match for “${c.value}” after the page settled (none allowed).`,
        };
  }
  if (waitMs) {
    try {
      await visible.first().waitFor({ state: "visible", timeout: waitMs });
    } catch {}
  }
  const count = await visible.count();
  if (!count) {
    const hidden = await locator.count();
    if (exact && !hidden) {
      const partial = (
        c.kind === "text"
          ? page.getByText(c.value, { exact: false })
          : c.kind === "required"
            ? page.getByLabel(c.value, { exact: false })
            : page.getByRole(c.kind, { name: c.value, exact: false })
      ).filter({ visible: true });
      const partialCount = await partial.count();
      if (partialCount)
        return {
          status: "not_verified",
          observed: `No visible exact ${c.kind} match for “${c.value}”. Found ${partialCount} visible containing match(es). Review whether the plan should use contains-text matching; the exact check was not verified.`,
        };
    }
    // A role mismatch is a check-definition issue, not proof that the UI is broken.
    if (["heading", "button", "link"].includes(c.kind)) {
      const alternatives = [];
      for (const role of ["heading", "button", "link"]) {
        if (
          role !== c.kind &&
          (await page
            .getByRole(role, { name: c.value, exact })
            .filter({ visible: true })
            .count())
        )
          alternatives.push(role);
      }
      const textCount = await page
        .getByText(c.value, { exact })
        .filter({ visible: true })
        .count();
      if (alternatives.length || textCount)
        return {
          status: "not_verified",
          observed: `No visible ${c.kind} with ${mode} name “${c.value}”. Found ${alternatives.length ? "matching " + alternatives.join("/") + " role" : "matching visible text"} instead. Review the check type; the requested role was not verified.`,
        };
    }
    return {
      status: staticMode ? "not_verified" : "fail",
      observed: `${hidden ? `Found ${hidden} matching element(s), but none are visible.` : `No visible ${mode} ${c.kind} match found for “${c.value}”.`}${staticMode ? " This is a static observation with JavaScript disabled; the cause is unknown. Review the matching rule or use a separately approved JavaScript-enabled test." : await failureContext(page, c)}`,
    };
  }
  if ((c.occurrence ?? "unique") === "unique" && count !== 1)
    return {
      status: "not_verified",
      observed: `Found ${count} visible matches for “${c.value}”; this check requires exactly one. Narrow the check or explicitly choose at least one.`,
    };
  if (c.kind === "required") {
    const values = await visible.evaluateAll((els) =>
      els.map((el) =>
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
          ? el.required
          : null,
      ),
    );
    const pass = values.includes(true);
    return {
      status: pass ? "pass" : values.includes(null) ? "not_verified" : "fail",
      observed: pass
        ? "A matching visible native field has required validation. Submission behavior was not exercised."
        : values.includes(null)
          ? "Custom field validation was not tested."
          : "The matching visible native field(s) do not have required validation.",
    };
  }
  return {
    status: "pass",
    observed: `Found ${count} visible ${c.kind} match(es) for “${c.value}” (${mode}; ${(c.occurrence ?? "unique") === "unique" ? "exactly one required" : "at least one required"}).`,
  };
}

/**
 * What the page was doing when an expected outcome didn't show, so a failure
 * points at its likely cause instead of only "not found":
 *  - still busy: disabled buttons, aria-busy regions, progress bars, or
 *    loading text such as “Verifying…”, so a stuck step reads as stuck;
 *  - closest match: visible headings, buttons, links or text close to the
 *    expected wording, so a reworded heading is obvious and quick to fix.
 * Facts only, quoted from the page, never a diagnosis. Best effort: any error
 * here leaves the plain failure unchanged.
 */
export async function failureContext(page, c) {
  try {
    const seen = await page.evaluate(
      ({ kind }) => {
        const visible = (el) => {
          const r = el.getBoundingClientRect();
          const st = getComputedStyle(el);
          return (
            r.width > 0 &&
            r.height > 0 &&
            st.visibility !== "hidden" &&
            st.display !== "none"
          );
        };
        const name = (el) =>
          (el.getAttribute("aria-label") || el.textContent || "")
            .replace(/\s+/g, " ")
            .trim();
        const disabled = [
          ...document.querySelectorAll(
            "button, [role=button], input[type=submit]",
          ),
        ]
          .filter(
            (el) =>
              visible(el) &&
              (el.disabled || el.getAttribute("aria-disabled") === "true"),
          )
          .map(name)
          .filter(Boolean);
        const busy = [
          ...document.querySelectorAll("[aria-busy=true], [role=progressbar]"),
        ].filter(visible).length;
        const loading = [];
        const walker = document.createTreeWalker(
          document.body,
          NodeFilter.SHOW_TEXT,
        );
        const lines = [];
        while (walker.nextNode()) {
          const t = walker.currentNode.textContent.replace(/\s+/g, " ").trim();
          const el = walker.currentNode.parentElement;
          if (!t || !el || !visible(el)) continue;
          lines.push(t);
          // Loading text: a short "-ing…" phrase that ends in an ellipsis
          // ("Verifying…", "Saving..."), or a bare "Loading" / "Please wait".
          // Labels like "Sending to" don't count.
          if (
            (t.length < 40 && /(…|\.\.\.)$/.test(t) && /\b\w+ing\b/i.test(t)) ||
            /^(loading|please wait)$/i.test(t)
          )
            loading.push(t);
        }
        const sel = {
          heading: "h1,h2,h3,h4,h5,h6,[role=heading]",
          button: "button,[role=button],input[type=submit]",
          link: "a[href],[role=link]",
        }[kind];
        const names = sel
          ? [...document.querySelectorAll(sel)]
              .filter(visible)
              .map(name)
              .filter(Boolean)
          : lines;
        return { disabled, busy, loading, names };
      },
      { kind: c.kind },
    );
    const q = (t) => `“${t.length > 80 ? t.slice(0, 79) + "…" : t}”`;
    const parts = [];
    const busyBits = [
      ...[...new Set(seen.disabled)]
        .slice(0, 3)
        .map((n) => `button ${q(n)} was disabled`),
      ...[...new Set(seen.loading)]
        .slice(0, 2)
        .map((t) => `${q(t)} was showing`),
      ...(seen.busy ? [`${seen.busy} region(s) were marked busy`] : []),
    ];
    if (busyBits.length)
      parts.push(
        `The page still looked busy: ${busyBits.join("; ")}. A step may not have finished, or may be stuck.`,
      );
    const want = c.value.toLowerCase().replace(/\s+/g, " ").trim();
    const words = new Set(want.split(" ").filter((w) => w.length > 2));
    const score = (t) => {
      const l = t.toLowerCase();
      if (l === want) return 100;
      if (l.includes(want) || want.includes(l)) return 50;
      return [...words].filter((w) => l.includes(w)).length;
    };
    const close = [...new Set(seen.names)]
      .map((t) => [t, score(t)])
      .filter(
        ([t, n]) =>
          n >= Math.max(1, Math.ceil(words.size / 2)) && t.length < 200,
      )
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);
    if (close.length)
      parts.push(
        `Closest visible ${c.kind === "text" ? "text" : c.kind + (close.length > 1 ? "s" : "")}: ${close.map(q).join(", ")}.${close.some((t) => t.toLowerCase() === want) ? " Same words with different capitals; if that's intended, update the check." : ""}`,
      );
    return parts.length ? " " + parts.join(" ") : "";
  } catch {
    return "";
  }
}

/**
 * Environmental reasons a missing outcome can't be blamed on the app.
 * Called only when a check would otherwise fail. Returns a plain-language
 * explanation (the check becomes Not verified) or "" (the failure stands).
 *  - The current page itself returned an HTTP error (outage, bad gateway).
 *  - The page asks for a password and the check doesn't sign in, so content
 *    behind sign-in was not observable.
 */
export async function blocker(page, documentStatus) {
  if (documentStatus === 401 || documentStatus === 403)
    return `The page returned HTTP ${documentStatus}: it's protected or needs sign-in, so this outcome could not be observed. For a Vercel preview with Deployment Protection, add the project's automation bypass secret (see docs/github-action.md). This isn't a confirmed defect.`;
  if (documentStatus && documentStatus >= 400)
    return `The page returned HTTP ${documentStatus}, so this outcome could not be observed. This looks like an environment problem (the site was down or erroring), not a confirmed defect. Retry when the site is available.`;
  try {
    const password = await page
      .locator('input[type="password"]')
      .filter({ visible: true })
      .count();
    if (password > 0)
      return "This page asks for a password, and this check doesn't sign in, so content behind sign-in could not be checked. Check a page that doesn't need sign-in, or add sign-in with a dedicated test account.";
  } catch {}
  return "";
}
