import { TEST_CARDS, TEST_HOLDER } from "./test-cards.mjs";
const sensitive =
  /\b(cart|favorite|buy|purchase|pay|checkout|order|delete|remove|send|publish|transfer|subscribe|book|confirm|submit|login|password)\b|sign in|log in/i;
export async function perform(
  page,
  action,
  destinations = [],
  testActions = undefined,
  memory = new Map(),
) {
  if (action.type === "remember") return remember(page, action, memory);
  if (
    action.type === "fill" &&
    /^\{\{[a-zA-Z][a-zA-Z0-9]{0,30}\}\}$/.test(action.value)
  ) {
    const name = action.value.slice(2, -2);
    if (!memory.has(name))
      throw Error(`Nothing was remembered as “${name}”, so nothing was typed.`);
    action = { ...action, value: memory.get(name) };
  }
  // Actions AsBuilt normally refuses run only when the user approved this
  // exact action as a test action, and only while the page proves it's a
  // test site.
  const approvedTest =
    testActions?.approved === "all"
      ? !/password|log ?in|sign ?in|log ?out|sign ?out/i.test(action.name)
      : !!testActions?.approved?.includes(action.name);
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
  if (action.type === "testPayment") {
    if (!approvedTest)
      throw Error(
        "Paying with the test card is outside the allowed interaction policy until it's approved as a test action.",
      );
    if (action.value === "" || action.value === "stripe")
      return payWithStripeTestCard(page);
    return fillProviderTestCard(page, action.value, action.fields);
  }
  if (action.type === "check") {
    const box = root
      .getByRole("radio", { name: action.name, exact: true })
      .or(root.getByRole("checkbox", { name: action.name, exact: true }))
      .filter({ visible: true });
    await box.first().waitFor({ state: "visible", timeout: 5000 });
    // Some sites render the same choice more than once (one per store or
    // section); ticking the first visible one is the reviewed choice.
    await box.first().check({ timeout: 5000 });
    return;
  }
  if (action.type === "reload") {
    await page.reload({ waitUntil: "load", timeout: 25000 });
    await page
      .waitForLoadState("networkidle", { timeout: 5000 })
      .catch(() => {});
    return;
  }
  if (action.type === "navigate" && action.value.endsWith("/*"))
    return openNewestMatching(page, root, action, destinations);
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
  const permitted = await locator.evaluate(
    (el, [type, approved]) => {
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
    },
    [action.type, approvedTest],
  );
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
  // A toast or animation can briefly cover a control; allow it to clear.
  if (action.type === "click") await locator.click({ timeout: 8000 });
  else if (action.type === "fill")
    await locator.fill(action.value, { timeout: 3000 });
  else await locator.selectOption({ label: action.value }, { timeout: 3000 });
}

// Another provider's card form, filled with that provider's published test
// card. The check gives only the fields' labels; the numbers come from
// test-cards.mjs. Each field must be exactly one visible match across the
// page and its frames (provider forms often put each field in its own
// frame), or nothing is typed. This only fills the form: paying is the
// check's next, separately approved click.
async function fillProviderTestCard(page, provider, fields) {
  const card = TEST_CARDS[provider];
  if (!card || !fields?.number)
    throw Error(
      "This test payment has no known provider or card-number field, so AsBuilt didn't type anything.",
    );
  const [month, year] = card.expiry.split("/");
  const plan = [
    ["number", fields.number, card.number],
    ...(fields.expiry ? [["expiry", fields.expiry, card.expiry]] : []),
    ...(fields.expiryMonth
      ? [["expiry month", fields.expiryMonth, month]]
      : []),
    ...(fields.expiryYear ? [["expiry year", fields.expiryYear, year]] : []),
    ...(fields.cvc ? [["security code", fields.cvc, card.cvc]] : []),
    ...(fields.name ? [["name", fields.name, TEST_HOLDER.name]] : []),
    ...(fields.postal
      ? [["postal code", fields.postal, TEST_HOLDER.postal]]
      : []),
  ];
  // Find every field first; type nothing unless all of them are found.
  const deadline = Date.now() + 45000;
  const found = [];
  for (const [what, label, value] of plan) {
    let hits = [];
    while (Date.now() < deadline) {
      hits = [];
      for (const frame of page.frames()) {
        const loc = frame
          .getByLabel(label, { exact: true })
          .or(frame.getByPlaceholder(label, { exact: true }))
          .filter({ visible: true });
        const n = await loc.count().catch(() => 0);
        for (let i = 0; i < n; i++) hits.push(loc.nth(i));
      }
      if (hits.length) break;
      await page.waitForTimeout(500);
    }
    if (hits.length !== 1)
      throw Error(
        hits.length
          ? `Found ${hits.length} visible “${label}” fields for the ${what}; AsBuilt needs exactly one, so it didn't type anything.`
          : `No visible “${label}” field for the ${what} appeared (also looked inside payment frames), so AsBuilt didn't type anything. Check the field's label or placeholder in the check.`,
      );
    found.push([hits[0], value]);
  }
  for (const [field, value] of found) {
    await field.click({ timeout: 5000 });
    await field.fill("", { timeout: 5000 }).catch(() => {});
    // Typing (not pasting) lets the provider's own formatting run.
    await field.pressSequentially(value, { delay: 40, timeout: 15000 });
  }
}

// Stripe's public test card. Live Stripe declines it, so this can never
// charge real money; it is also never read from a plan.
const TEST_CARD = {
  number: "4242424242424242",
  expiry: "12 / 34",
  cvc: "123",
  name: "AsBuilt Test",
  postal: "10001",
  email: "asbuilt-test@example.com",
};
const STRIPE_FRAME =
  'iframe[src^="https://js.stripe.com/"], iframe[src^="https://checkout.stripe.com/"]';

async function payWithStripeTestCard(page) {
  const frameEl = page.locator(STRIPE_FRAME).filter({ visible: true });
  try {
    await frameEl.first().waitFor({ state: "visible", timeout: 45000 });
  } catch {
    throw Error(
      "No Stripe payment form appeared on the page, so AsBuilt didn't pay.",
    );
  }
  // Stripe Checkout (embedded) shows one frame; Payment Element may show
  // several (one per field), so look in each until the card number appears.
  const frames = await frameEl.count();
  let stripe;
  for (let i = 0; i < frames && !stripe; i++) {
    const f = page.frameLocator(STRIPE_FRAME).nth(i);
    const found = await f
      .locator(
        '#cardNumber, input[name="cardnumber"], input[name="number"], [data-testid="card-accordion-item-button"]',
      )
      .or(f.getByText("Pay without Link"))
      .first()
      .waitFor({ state: "attached", timeout: i === 0 ? 45000 : 5000 })
      .then(
        () => true,
        () => false,
      );
    if (found) stripe = f;
  }
  if (!stripe)
    throw Error("AsBuilt couldn't find Stripe's card form, so it didn't pay.");
  const number = stripe.locator(
    '#cardNumber, input[name="cardnumber"], input[name="number"]',
  );
  const skipLink = stripe.getByText("Pay without Link");
  if (await skipLink.isVisible().catch(() => false)) await skipLink.click();
  await page.waitForTimeout(1000);
  if (
    !(await number
      .first()
      .isVisible()
      .catch(() => false))
  ) {
    // Stripe covers the Card row with an invisible button; click it directly.
    const card = stripe.locator('[data-testid="card-accordion-item-button"]');
    if (await card.count()) await card.first().dispatchEvent("click");
  }
  await number.first().fill(TEST_CARD.number, { timeout: 45000 });
  await stripe
    .locator('#cardExpiry, input[name="exp-date"], input[name="expiry"]')
    .first()
    .fill(TEST_CARD.expiry, { timeout: 10000 });
  await stripe
    .locator('#cardCvc, input[name="cvc"]')
    .first()
    .fill(TEST_CARD.cvc, { timeout: 10000 });
  const optional = [
    ["#email", TEST_CARD.email],
    ["#billingName", TEST_CARD.name],
    [
      '#billingPostalCode, input[name="postal"], input[name="postalCode"]',
      TEST_CARD.postal,
    ],
  ];
  for (const [selector, value] of optional) {
    const field = stripe.locator(selector).first();
    if (
      (await field.isVisible().catch(() => false)) &&
      !(await field.inputValue().catch(() => ""))
    )
      await field.fill(value, { timeout: 5000 });
  }
  const submit = stripe
    .locator('button[type="submit"], .SubmitButton')
    .filter({ visible: true });
  if (!(await submit.count())) {
    // Payment Element: the site's own button submits; the next step clicks it.
    return;
  }
  // Wait for Stripe to finish and the site to move on. Stripe may need a
  // moment after the last field before Pay accepts the click, so press it
  // again if nothing has happened.
  const before = page.url();
  for (let attempt = 0; attempt < 3; attempt++) {
    await submit
      .first()
      .click({ timeout: 10000 })
      .catch(() => {});
    const moved = await page
      .waitForURL((u) => u.href !== before, {
        timeout: attempt === 2 ? 60000 : 20000,
      })
      .then(
        () => true,
        () => false,
      );
    if (moved) return;
    // Still processing? Don't press again while Stripe is busy.
    if (
      await submit
        .first()
        .isDisabled()
        .catch(() => false)
    ) {
      const done = await page
        .waitForURL((u) => u.href !== before, { timeout: 45000 })
        .then(
          () => true,
          () => false,
        );
      if (done) return;
    }
  }
  // Never report the site as broken because the payment step itself stalled.
  throw Error(
    "Stripe's payment didn't finish: the page didn't move on after paying with the test card, so the outcome couldn't be checked.",
  );
}

/**
 * Open the first visible link (lists usually show the newest first) whose
 * name contains the reviewed text and whose address is one more path segment
 * under the reviewed prefix, for example a new order:
 * "https://shop.example/merchant/orders/*". Never leaves the preview.
 */
async function openNewestMatching(page, root, action, destinations) {
  if (!destinations.includes(action.value))
    throw Error("Navigation destination is outside the reviewed policy.");
  const prefix = new URL(action.value.slice(0, -1));
  if (prefix.origin !== new URL(page.url()).origin)
    throw Error("Navigation destination is outside the reviewed policy.");
  const links = root
    .getByRole("link", {
      name: action.name,
      exact: action.match !== "contains",
    })
    .filter({ visible: true });
  try {
    await links.first().waitFor({ state: "visible", timeout: 10000 });
  } catch {
    throw Error(
      `No matching link named “${action.name}” is visible, so nothing was opened.`,
    );
  }
  const hrefs = await links.evaluateAll((els) =>
    els.map((el) => (el instanceof HTMLAnchorElement ? el.href : "")),
  );
  const segment = /^[A-Za-z0-9_-]{1,80}$/;
  const i = hrefs.findIndex((href) => {
    try {
      const u = new URL(href);
      return (
        u.origin === prefix.origin &&
        u.pathname.startsWith(prefix.pathname) &&
        segment.test(u.pathname.slice(prefix.pathname.length)) &&
        !u.username &&
        !u.password
      );
    } catch {
      return false;
    }
  });
  if (i < 0)
    throw Error(
      `No matching link named “${action.name}” points under the reviewed address, so nothing was opened.`,
    );
  const target = hrefs[i];
  await links.nth(i).click({ timeout: 8000 });
  await page.waitForURL(
    (u) => u.href.split(/[?#]/)[0] === target.split(/[?#]/)[0],
    {
      timeout: 15000,
      waitUntil: "domcontentloaded",
    },
  );
}

/**
 * Read one short value shown on the page, such as a pickup code. The text of
 * the smallest visible element(s) must match the reviewed anchored pattern,
 * and every match must be the same value; otherwise nothing is remembered.
 * The value stays in this run's memory only.
 */
async function remember(page, action, memory) {
  const pattern = action.value;
  const read = async () =>
    page.locator("body").evaluate((body, source) => {
      const re = new RegExp(source);
      const found = new Set();
      for (const el of body.querySelectorAll("*")) {
        if (
          !(el instanceof HTMLElement) ||
          (!el.offsetParent && getComputedStyle(el).position !== "fixed")
        )
          continue;
        const text = (el.innerText || "").trim();
        if (!re.test(text)) continue;
        // Only the innermost element holding the value counts.
        if (
          [...el.children].some((child) =>
            re.test((child.innerText || "").trim()),
          )
        )
          continue;
        found.add(text);
      }
      return [...found];
    }, pattern);
  let values = await read();
  for (let i = 0; i < 5 && values.length === 0; i++) {
    await page.waitForTimeout(2000);
    values = await read();
  }
  if (values.length !== 1)
    throw Error(
      values.length
        ? `More than one value on the page matches the pattern for “${action.name}”, so nothing was remembered.`
        : `No value on the page matches the pattern for “${action.name}”, so nothing was remembered.`,
    );
  if (values[0].length > 100) throw Error("The remembered value is too long.");
  memory.set(action.name, values[0]);
}

// The isolated worker has no network interface of its own (traffic goes
// through AsBuilt's reviewed tunnel), so the browser would report
// navigator.onLine === false and apps that check it would say "no
// connection". With approved browser networking the page is online.
export async function reportOnline(context) {
  await context.addInitScript(() => {
    try {
      Object.defineProperty(Navigator.prototype, "onLine", {
        configurable: true,
        get: () => true,
      });
    } catch {}
  });
}
