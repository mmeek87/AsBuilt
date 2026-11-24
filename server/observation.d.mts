import type { Page } from "playwright";
import type { Criterion, Result } from "./schema.ts";
export function observe(
  page: Page,
  c: Criterion,
  options?: { staticMode?: boolean; waitMs?: number },
): Promise<Pick<Result, "status" | "observed">>;
