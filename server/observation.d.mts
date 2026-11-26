import type { Page } from "playwright";
import type { Criterion, Result } from "./schema.ts";
export function observe(
  page: Page,
  c: Criterion,
  options?: { staticMode?: boolean; waitMs?: number },
): Promise<Pick<Result, "status" | "observed">>;
export function blocker(
  page: Page,
  documentStatus?: number,
): Promise<string>;
export function failureContext(
  page: import("playwright").Page,
  c: { kind: string; value: string },
): Promise<string>;
