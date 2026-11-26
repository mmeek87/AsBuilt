import type { Page } from "playwright";
export function signIn(
  page: Page,
  config: {
    path: string;
    emailLabel: string;
    passwordLabel: string;
    submit: string;
    signedInText: string;
    signedInPath?: string;
    dismiss?: string;
  },
  credentials: { email: string; password: string } | undefined,
  origin: string,
): Promise<{ ok: true } | { ok: false; reason: string }>;
export function alreadySignedIn(
  page: Page,
  config: { signedInText: string; signedInPath?: string },
  origin: string,
): Promise<boolean>;
