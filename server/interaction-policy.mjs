const sensitive =
  /\b(cart|favorite|buy|purchase|pay|checkout|order|delete|remove|send|publish|transfer|subscribe|book|confirm|submit|login|password)\b|sign in|log in/i;
export async function perform(
  page,
  action,
  destinations = [],
  testActions = undefined,
) {
  // Actions AsBuilt normally refuses run only when the user approved this
  // exact action as a test action, and only while the page proves it's a
  // test site.
  const approvedTest = !!testActions?.approved?.includes(action.name);
  if (sensitive.test(action.name) && !approvedTest)
    throw Error(
      "This action is outside the allowed interaction policy. On a test site, the user can approve it as a test action.",
    );
  if (testActions) {
    const marker = page
      .getByText(testActions.siteMarker, { exact: false })
      .filter({ visible: true });
    try {
      await marker.first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      throw Error(
        `The page doesn't show the test-site marker “${testActions.siteMarker}”, so AsBuilt didn't act. Test actions only run on a page that proves it's a test site.`,
      );
    }
  }
  const root = action.within
    ? page
        .getByRole(action.within.role, {
          name: action.within.name,
          exact: true,
        })
        .filter({ visible: true })
    : page;
  if (action.within && (await root.count()) !== 1)
    throw Error("The reviewed action section is missing or ambiguous.");
  if (action.type === "navigate") {
    const expected = new URL(action.value);
    if (
      expected.origin !== new URL(page.url()).origin ||
      expected.username ||
      expected.password ||
      expected.hash ||
      !destinations.includes(expected.href)
    )
      throw Error("Navigation destination is outside the reviewed policy.");
    const link = root
      .getByRole("link", { name: action.name, exact: true })
      .filter({ visible: true });
    try {
      await link.first().waitFor({ state: "visible", timeout: 5000 });
    } catch {
      const allLinks = root.getByRole("link").filter({ visible: true });
      const indexes = await allLinks.evaluateAll(
        (els, url) =>
          els
            .map((el, i) =>
              el instanceof HTMLAnchorElement && el.href === url ? i : -1,
            )
            .filter((i) => i >= 0)
            .slice(0, 3),
        expected.href,
      );
      const names = [];
      for (const i of indexes)
        names.push((await allLinks.nth(i).ariaSnapshot()).slice(0, 200));
      throw Error(
        `No visible link has the reviewed accessible name “${action.name}”. Matching destination candidates: ${names.join("; ") || "none"}. No click was attempted.`,
      );
    }
    const destinationsFound = await link.evaluateAll((els) =>
      els.map((el) =>
        el instanceof HTMLAnchorElement &&
        !el.download &&
        (!el.target || el.target === "_self")
          ? el.href
          : null,
      ),
    );
    if (
      !destinationsFound.length ||
      destinationsFound.some((href) => href !== expected.href)
    )
      throw Error(
        "Matching links do not all point to the reviewed destination; navigation was not attempted.",
      );
    // Equivalent links are the same reviewed navigation; never choose among conflicting destinations.
    try {
      await link.first().click({ timeout: 5000 });
    } catch (error) {
      throw Error(
        "Reviewed link click did not complete: " +
          String(error.message)
            .replace(/https?:\/\/[^\s]+/g, "[URL omitted]")
            .slice(0, 700),
      );
    }
    try {
      await page.waitForURL(expected.href, {
        timeout: 15000,
        waitUntil: "domcontentloaded",
      });
    } catch {
      throw Error(
        "Reviewed link was clicked, but the expected destination did not load within 15 seconds.",
      );
    }
    return;
  }
  if (action.type === "menu") {
    if (
      action.value &&
      (new URL(action.value).origin !== new URL(page.url()).origin ||
        !destinations.includes(action.value))
    )
      throw Error("Menu destination is outside the reviewed policy.");
    const item = root
      .getByRole("menuitem", {
        name: action.name,
        exact: action.match !== "contains",
      })
      .filter({ visible: true });
    await item.first().waitFor({ state: "visible", timeout: 5000 });
    if ((await item.count()) !== 1)
      throw Error("The reviewed menu item is ambiguous.");
    const safe = await item.evaluate(
      (el) =>
        !el.closest("form") &&
        !el.closest("a[href]") &&
        !el.closest('button[type="submit"]') &&
        !(el instanceof HTMLButtonElement && el.form) &&
        el.getAttribute("aria-disabled") !== "true",
    );
    if (!safe)
      throw Error("Menu target is outside the permitted interaction policy.");
    if (!action.value && (await item.getAttribute("aria-haspopup")) !== "menu")
      throw Error(
        "A menu choice requires a reviewed destination; only submenu triggers can omit it.",
      );
    await item.click({ timeout: 5000 });
    if (action.value)
      await page.waitForURL(action.value, {
        timeout: 15000,
        waitUntil: "domcontentloaded",
      });
    return;
  }
  const locator =
    action.type === "click"
      ? root
          .getByRole("button", {
            name: action.name,
            exact: action.match !== "contains",
          })
          .filter({ visible: true })
      : root.getByLabel(action.name, { exact: true });
  await locator.first().waitFor({ state: "visible", timeout: 3000 });
  if ((await locator.count()) !== 1)
    throw Error("The action target is ambiguous. Use an exact unique label.");
  const permitted = await locator.evaluate((el, [type, approved]) => {
    if (type === "click")
      return (
        el instanceof HTMLButtonElement &&
        // An approved test action may submit its form (for example
        // "Continue to payment"); anything else must not.
        (approved ||
          (!el.form && (el.type === "button" || !el.hasAttribute("type"))))
      );
    if (type === "select")
      return el instanceof HTMLSelectElement && !el.disabled;
    return (
      (el instanceof HTMLTextAreaElement ||
        (el instanceof HTMLInputElement &&
          ["text", "search", "email", "tel", "number"].includes(el.type))) &&
      !el.disabled &&
      !el.readOnly &&
      !/password|cc-|one-time-code/i.test(el.autocomplete || "")
    );
  }, [action.type, approvedTest]);
  if (!permitted) {
    const details = await locator.evaluate((el) => ({
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute("type"),
      form: !!el.form,
    }));
    throw Error(
      `Target is not a permitted field or non-submitting button (${details.tag}; type=${details.type ?? "implicit"}; associated form=${details.form}).`,
    );
  }
  if (action.type === "click") await locator.click({ timeout: 3000 });
  else if (action.type === "fill")
    await locator.fill(action.value, { timeout: 3000 });
  else await locator.selectOption({ label: action.value }, { timeout: 3000 });
}
