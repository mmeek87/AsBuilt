const sensitive =
  /\b(buy|purchase|pay|checkout|order|delete|remove|send|publish|transfer|subscribe|book|confirm|submit|login|password)\b|sign in|log in/i;
export async function perform(page, action) {
  if (sensitive.test(action.name))
    throw Error("This action is outside the allowed interaction policy.");
  const locator =
    action.type === "click"
      ? page.getByRole("button", { name: action.name, exact: true })
      : page.getByLabel(action.name, { exact: true });
  await locator.first().waitFor({ state: "visible", timeout: 3000 });
  if ((await locator.count()) !== 1)
    throw Error("The action target is ambiguous. Use an exact unique label.");
  const permitted = await locator.evaluate((el, type) => {
    if (type === "click")
      return (
        el instanceof HTMLButtonElement && el.type === "button" && !el.form
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
  }, action.type);
  if (!permitted)
    throw Error("Target is not a permitted field or non-submitting button.");
  if (action.type === "click") await locator.click({ timeout: 3000 });
  else if (action.type === "fill")
    await locator.fill(action.value, { timeout: 3000 });
  else await locator.selectOption({ label: action.value }, { timeout: 3000 });
}
