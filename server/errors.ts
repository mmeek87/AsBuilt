import { z } from "zod";

/**
 * Turn any thrown value into a safe, plain-language HTTP response.
 *
 * AsBuilt's own validation errors are written for users and are shown as-is.
 * System and programming errors (file paths, database codes, stack-ish
 * messages) are never shown: they can reveal local paths or infrastructure
 * and they don't tell a nontechnical user what to do.
 */
export function publicError(error: unknown): { status: number; error: string } {
  if (error instanceof z.ZodError)
    return {
      status: 400,
      error:
        "Some fields are missing or invalid. Review the plan and try again.",
    };
  const e = error as { type?: string; status?: number; code?: unknown };
  if (e?.type === "entity.parse.failed")
    return { status: 400, error: "The request was not valid JSON." };
  if (e?.type === "entity.too.large")
    return {
      status: 413,
      error:
        "This request is too large. Use shorter source excerpts and record what you left out.",
    };
  if (e?.code === "ENOENT")
    return {
      status: 404,
      error: "That item was not found. It may have been deleted.",
    };
  if (
    !(error instanceof Error) ||
    e.code !== undefined ||
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof ReferenceError ||
    error instanceof SyntaxError
  )
    return {
      status: 500,
      error:
        "AsBuilt could not complete this request. Nothing was marked as passed. Try again, and check the service logs if it keeps happening.",
    };
  if (/\bnot found\b/i.test(error.message))
    return { status: 404, error: error.message };
  return { status: 400, error: error.message };
}
