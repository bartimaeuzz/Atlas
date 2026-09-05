/** Node-runtime instrumentation. Imported for its side effect by
 *  instrumentation.ts, only when NEXT_RUNTIME is "nodejs".
 *
 *  WHY IT EXISTS (2026-09-05, Oliver: "next time it happens, catch the
 *  culprit"). Production logged this once in seven days:
 *
 *    POST /ledger/supplier-check 200
 *    Unhandled Rejection: TypeError: fetch failed
 *    [cause] connect ETIMEDOUT 100.25.145.202:443
 *    Node.js process exited with exit status: 128
 *
 *  The response was already 200 — the crash came after — and the four
 *  lines Node prints name no file, no function and no route. Every server
 *  action on that page POSTs to the same URL, so "POST
 *  /ledger/supplier-check" narrows it to about a dozen candidates and no
 *  further. A promise nobody is holding has no stack by the time it
 *  rejects, so the only way to learn where it came from is to be
 *  listening when it happens.
 *
 *  See project memory: project-atlas-unhandled-rejection-supplier-check.
 */

// A file with no import or export is a global SCRIPT to TypeScript, not a
// module, and `await import("./instrumentation-node")` on a script is
// TS2306. This file is imported purely for the side effect below, so it
// has nothing else to export.
export {};

process.on("unhandledRejection", (reason: unknown) => {
  const error = reason instanceof Error ? reason : undefined;

  // One block, one line per fact, every line carrying the same prefix so
  // the daily log check can grep for it and so no line is orphaned when
  // the platform interleaves output from concurrent requests.
  console.error(
    [
      "[ATLAS-UNHANDLED] an unawaited promise rejected — see project memory",
      `[ATLAS-UNHANDLED] when: ${new Date().toISOString()}`,
      `[ATLAS-UNHANDLED] name: ${error?.name ?? typeof reason}`,
      `[ATLAS-UNHANDLED] message: ${error?.message ?? String(reason)}`,
      // The cause is where the useful detail lives for a fetch failure:
      // the bare message is always "fetch failed", and the cause carries
      // the syscall, the address and the errno.
      `[ATLAS-UNHANDLED] cause: ${formatCause(error)}`,
      // THE POINT OF THE WHOLE FILE. "fetch failed" is thrown inside
      // undici, so the frames below it are what name our code.
      `[ATLAS-UNHANDLED] stack: ${error?.stack ?? "(no stack — the rejection was not an Error)"}`,
    ].join("\n")
  );

  // Behaviour deliberately unchanged: without a listener Node crashes on
  // an unhandled rejection, and attaching one silently stops that. The
  // instance still goes down, exactly as it did before — this file adds
  // evidence, it does not decide to keep alive a process whose state
  // nobody has looked at. Re-thrown on the next tick so it lands as an
  // uncaught exception rather than being swallowed here.
  process.nextTick(() => {
    throw reason;
  });
});

function formatCause(error: Error | undefined): string {
  const cause = (error as { cause?: unknown } | undefined)?.cause;
  if (cause === undefined) return "(none)";
  if (cause instanceof Error) {
    const extra = cause as unknown as Record<string, unknown>;
    const parts = ["code", "errno", "syscall", "address", "port"]
      .filter((k) => extra[k] !== undefined)
      .map((k) => `${k}=${String(extra[k])}`);
    return `${cause.name}: ${cause.message}${parts.length ? ` (${parts.join(" ")})` : ""}`;
  }
  return String(cause);
}
