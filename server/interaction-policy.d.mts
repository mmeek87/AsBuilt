import type { Page } from "playwright";
import type { Criterion } from "./schema.ts";
export function perform(
  page: Page,
  action: NonNullable<Criterion["actions"]>[number],
  destinations?: string[],
): Promise<void>;
