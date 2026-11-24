import type { Page } from "playwright";
export function perform(
  page: Page,
  action: { type: "click" | "fill" | "select"; name: string; value: string },
): Promise<void>;
