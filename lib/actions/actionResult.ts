import { unstable_rethrow } from "next/navigation";

/** Server actions must RETURN expected failures, never throw them:
 * production builds redact any Error thrown out of a server action to
 * "Minified React error #441", so every validation sentence written for
 * a user reached them as that garbage instead. Development shows thrown
 * messages, which is why the class passed every local check until
 * Oliver hit it live (2026-08-24, card statement total).
 *
 * Wrap a throwing action body in this to convert it: Next's own
 * control-flow throws (redirect/notFound) are rethrown untouched via
 * unstable_rethrow, everything else comes back as { error }. Callers
 * that ignore the return value keep their old behaviour minus the
 * production crash. */
export interface ActionResult {
  error: string | null;
}

export async function asActionResult(fn: () => Promise<void>): Promise<ActionResult> {
  try {
    await fn();
  } catch (e) {
    unstable_rethrow(e);
    return { error: e instanceof Error ? e.message : String(e) };
  }
  return { error: null };
}
