import { HELP_URL } from "./help.ts";

/**
 * Setup a check needs before it can run, found before anything opens a
 * browser. A missing test account or switch is a setup step, not a finding
 * about the app and not a broken check file, so it is reported in plain words
 * with the exact fix, and it never fails the run.
 */
export type SetupNeed = { feature: string; problem: string; fix: string };

/** Pages in the user's own repository that each fix opens directly. */
export type SetupLinks = {
  newSecret?: string;
  workflow?: string;
  newVariable?: string;
};

export function setupLinks(
  env: Record<string, string | undefined>,
): SetupLinks {
  const repo = env.GITHUB_REPOSITORY;
  if (!repo || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return {};
  const server = /^https:\/\/[\w.-]+$/.test(env.GITHUB_SERVER_URL ?? "")
    ? env.GITHUB_SERVER_URL
    : "https://github.com";
  const base = `${server}/${repo}`;
  // "owner/repo/.github/workflows/asbuilt.yml@refs/heads/main"
  const m =
    /^[\w.-]+\/[\w.-]+\/(\.github\/workflows\/[\w.-]+\.ya?ml)@refs\/heads\/([\w./-]+)$/.exec(
      env.GITHUB_WORKFLOW_REF ?? "",
    );
  return {
    newSecret: `${base}/settings/secrets/actions/new`,
    newVariable: `${base}/settings/variables/actions/new`,
    ...(m ? { workflow: `${base}/edit/${m[2]}/${m[1]}` } : {}),
  };
}

const secretPage = (l: SetupLinks, ...names: string[]) =>
  l.newSecret
    ? ` Or [add ${names.length > 1 ? "them" : "it"} in GitHub](${l.newSecret}): ${names.map((n) => `\`${n}\``).join(", then ")}.`
    : " (Or in GitHub: Settings → Secrets and variables → Actions → New repository secret.)";
const workflowPage = (l: SetupLinks) =>
  l.workflow
    ? `[your workflow file](${l.workflow})`
    : ".github/workflows/asbuilt.yml";

const secretFix = (
  emailName: string,
  passwordName: string,
  inputs: string,
  l: SetupLinks,
) =>
  `Add a test account (never a real one) as two repository secrets. In a terminal in your project folder run \`gh secret set ${emailName}\`, then \`gh secret set ${passwordName}\`; each asks you to type the value, so it never shows on screen or in a chat.${secretPage(l, emailName, passwordName)} The next run picks them up if ${workflowPage(l)} passes ${inputs} to AsBuilt (the current template does; an older one may have those lines commented out). [How sign-in works](${HELP_URL}#sign-in)`;

export function setupNeeds(
  feature: string,
  raw: any,
  env: Record<string, string | undefined>,
  links: SetupLinks = {},
): SetupNeed[] {
  const needs: SetupNeed[] = [];
  const has = (k: string) => Boolean(env[k]?.trim());
  if (
    raw?.signIn &&
    !(has("ASBUILT_TEST_EMAIL") && has("ASBUILT_TEST_PASSWORD"))
  )
    needs.push({
      feature,
      problem:
        "This check signs in, but the workflow doesn't pass a test account yet.",
      fix: secretFix(
        "ASBUILT_TEST_EMAIL",
        "ASBUILT_TEST_PASSWORD",
        "test-email and test-password",
        links,
      ),
    });
  if (
    raw?.secondSignIn &&
    !(has("ASBUILT_SECOND_EMAIL") && has("ASBUILT_SECOND_PASSWORD"))
  )
    needs.push({
      feature,
      problem:
        "This check signs in a second account (for example a store), but the workflow doesn't pass one yet.",
      fix: secretFix(
        "ASBUILT_SECOND_EMAIL",
        "ASBUILT_SECOND_PASSWORD",
        "second-email and second-password",
        links,
      ),
    });
  for (const [config, key, input] of [
    [raw?.signIn, "ASBUILT_TEST_TOTP", "test-totp-secret"],
    [raw?.secondSignIn, "ASBUILT_SECOND_TOTP", "second-totp-secret"],
  ] as const)
    if (config?.codeLabel && !has(key))
      needs.push({
        feature,
        problem:
          "This check signs in with an authenticator code, but the workflow doesn't pass the test account's setup key yet.",
        fix: `When you add the authenticator to the test account, choose to enter the key by hand and copy that text key. Run \`gh secret set ${key}\` in your project folder and paste it when asked (it won't show).${secretPage(links, key)} Make sure your workflow passes \`${input}: \${{ secrets.${key} }}\` to AsBuilt (the current template does). Use this only for a test account on your test site. [How sign-in works](${HELP_URL}#sign-in)`,
      });
  if (raw?.testActions && env.ASBUILT_ALLOW_TEST_ACTIONS !== "true")
    needs.push({
      feature,
      problem:
        "This check takes cart, checkout or order steps, which AsBuilt only takes on a test site, and this workflow hasn't been marked as test-site only.",
      fix: `If this workflow only ever reaches your test site, add \`allow-test-actions: true\` under \`with:\` in ${workflowPage(links)}. If it can reach your live site, leave it off and keep this check for a test-site workflow. No test site yet? [Why you want one and how to set it up](${HELP_URL}#test-site)`,
    });
  return needs;
}

/** Most check files per run. Each runs on desktop and mobile. */
export const MAX_CHECK_FILES = 60;

/**
 * Whole-run time limit. An explicit input wins; otherwise allow about two
 * minutes per check file, never under 10 minutes.
 */
export function runMinutes(explicit: string, files: number) {
  const n = Number(explicit);
  if (explicit.trim() && Number.isFinite(n) && n > 0) return n;
  return Math.max(10, files * 2);
}

/**
 * Cart, checkout and order steps never run against a Production deployment,
 * whatever the check file or switch says. GitHub's deployment event names the
 * environment, which comes from the host, not from the page. (A Preview can
 * still be wired to live data, so the page's own test-site marker is required
 * as well.)
 */
export function productionDeployment(event: any) {
  const env = String(
    event?.deployment?.environment ??
      event?.deployment_status?.environment ??
      "",
  );
  return /\bprod(uction)?\b/i.test(env) ? env : undefined;
}

export function productionNeed(
  feature: string,
  environment: string,
): SetupNeed {
  return {
    feature,
    problem: `This run is checking the "${environment}" deployment, and AsBuilt never takes cart, checkout or order steps on a production deployment, even with the test-site switch on.`,
    fix: `Run this workflow only for preview or test deployments (the template's \`if:\` line skips Production), or remove \`allow-test-actions\` from it. [Why](${HELP_URL}#test-site)`,
  };
}

type Get = (
  url: URL,
) => Promise<{ status: number; headers: Record<string, string>; body: Buffer }>;

/**
 * One look at the address before any check opens a browser, so common setup
 * problems read as plain steps instead of a run of confusing failures.
 * - protected: a Vercel preview behind Deployment Protection, with no bypass
 *   secret configured. Every check would fail to load, so they're skipped.
 * - markerMissing: test-site markers that aren't in the page's HTML. Only a
 *   heads-up: the marker may be added by JavaScript, and AsBuilt still checks
 *   for it on screen before every step.
 */
export async function siteCheck(
  url: string,
  markers: string[],
  env: Record<string, string | undefined>,
  get: Get,
  links: SetupLinks = {},
): Promise<{ protected?: SetupNeed; markerMissing: string[] }> {
  let res;
  try {
    res = await get(new URL(url));
  } catch {
    return { markerMissing: [] }; // the checks themselves report an unreachable site
  }
  const vercel =
    Object.keys(res.headers).some((h) =>
      h.toLowerCase().startsWith("x-vercel"),
    ) || /vercel/i.test(res.headers.server ?? "");
  if (
    [401, 403].includes(res.status) &&
    vercel &&
    !env.ASBUILT_VERCEL_BYPASS_SECRET?.trim()
  )
    return {
      protected: {
        feature: "all checks",
        problem:
          "The preview is password-protected (Vercel Deployment Protection), so a browser from GitHub can't open it.",
        fix: `In [Vercel](https://vercel.com/dashboard): your project → Settings → Deployment Protection → Protection Bypass for Automation, copy the secret, then run \`gh secret set VERCEL_AUTOMATION_BYPASS_SECRET\` in your project folder and paste it when asked.${secretPage(links, "VERCEL_AUTOMATION_BYPASS_SECRET")} The current workflow template already passes it as \`vercel-bypass-secret\`. [More](${HELP_URL}#protected)`,
      },
      markerMissing: [],
    };
  const html = res.status < 400 ? res.body.toString("utf8") : "";
  return {
    markerMissing: html
      ? [...new Set(markers)].filter(
          (m) =>
            m &&
            !html.includes(m) &&
            !html.includes(m.replace(/·/g, "&middot;")),
        )
      : [],
  };
}

export type ChecklistItem = { label: string; done: boolean; how: string };

/**
 * Progress toward the deeper checks (sign-in, cart, checkout, order steps on
 * a test site), shown in every comment until it's all done, so setup is one
 * visible list instead of a surprise per run.
 */
export function deeperChecklist(o: {
  env: Record<string, string | undefined>;
  raws: any[];
  settingsMarker?: string;
  markerMissing: string[];
  production?: string;
  links?: SetupLinks;
}): ChecklistItem[] {
  const l = o.links ?? {};
  const has = (k: string) => Boolean(o.env[k]?.trim());
  const items: ChecklistItem[] = [
    {
      label: "Test account",
      done: has("ASBUILT_TEST_EMAIL") && has("ASBUILT_TEST_PASSWORD"),
      how: `make an account just for testing on your test site, then run \`gh secret set ASBUILT_TEST_EMAIL\` and \`gh secret set ASBUILT_TEST_PASSWORD\` in your project folder.${secretPage(l, "ASBUILT_TEST_EMAIL", "ASBUILT_TEST_PASSWORD")}`,
    },
  ];
  if (o.raws.some((r) => r?.secondSignIn))
    items.push({
      label: "Second test account (for example a store)",
      done: has("ASBUILT_SECOND_EMAIL") && has("ASBUILT_SECOND_PASSWORD"),
      how: `\`gh secret set ASBUILT_SECOND_EMAIL\` and \`gh secret set ASBUILT_SECOND_PASSWORD\`.${secretPage(l, "ASBUILT_SECOND_EMAIL", "ASBUILT_SECOND_PASSWORD")}`,
    });
  if (o.raws.some((r) => r?.signIn?.codeLabel || r?.secondSignIn?.codeLabel))
    items.push({
      label: "Authenticator setup key for two-step sign-in",
      done:
        (!o.raws.some((r) => r?.signIn?.codeLabel) ||
          has("ASBUILT_TEST_TOTP")) &&
        (!o.raws.some((r) => r?.secondSignIn?.codeLabel) ||
          has("ASBUILT_SECOND_TOTP")),
      how: `\`gh secret set ASBUILT_TEST_TOTP\` with the test account's text setup key.${secretPage(l, "ASBUILT_TEST_TOTP")}`,
    });
  const configured = [
    ...o.raws.map((r) => r?.testActions?.siteMarker).filter(Boolean),
    ...(o.settingsMarker ? [o.settingsMarker] : []),
  ];
  items.push({
    label: "Test-site banner",
    done:
      configured.length > 0 &&
      !configured.some((m) => o.markerMissing.includes(m)),
    how: configured.length
      ? `AsBuilt didn't find “${configured.find((m) => o.markerMissing.includes(m))}” in the page. Show it only on your test site, or ask your assistant to pick other text only the test site shows.`
      : `show text like “TEST SITE · test data only” only on your test site, and name it as the check's \`siteMarker\`. Ask your assistant to add both. [Why](${HELP_URL}#test-site)`,
  });
  items.push({
    label: "Test-site switch",
    done: o.env.ASBUILT_ALLOW_TEST_ACTIONS === "true",
    how: `add \`allow-test-actions: true\` to the AsBuilt step in ${workflowPage(l)}, only if this workflow never reaches your live site. No test site yet? [Set one up](${HELP_URL}#test-site)`,
  });
  if (o.production)
    items.push({
      label: "A preview or test deployment",
      done: false,
      how: `this run checked “${o.production}”. Cart, checkout and order steps never run on production; run this workflow on previews or your test site.`,
    });
  return items;
}
