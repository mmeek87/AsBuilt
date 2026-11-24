// Shared by local and isolated browser runners. Matching options are part of the reviewed plan.
export async function observe(
  page,
  c,
  { staticMode = false, waitMs = 0 } = {},
) {
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
      observed: `${hidden ? `Found ${hidden} matching element(s), but none are visible.` : `No visible ${mode} ${c.kind} match found for “${c.value}”.`}${staticMode ? " This is a static observation with JavaScript disabled; the cause is unknown. Review the matching rule or use a separately approved JavaScript-enabled test." : ""}`,
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
