import type { Page } from "playwright";
import type { Criterion } from "./schema.ts";
export function perform(
  page: Page,
  action: NonNullable<Criterion["actions"]>[number],
  destinations?: string[],
  testActions?: { siteMarker: string; approved: string[] | "all" },
  memory?: Map<string, string>,
): Promise<void>;
export function reportOnline(context: import("playwright").BrowserContext): Promise<void>;
