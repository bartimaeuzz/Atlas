"use client";

import { useState } from "react";

/** The before/after specifics, collapsed by default.
 *
 * Rendered as formatted JSON on purpose. This is the raw record — anyone
 * opening it is asking exactly what changed, and inventing a prettier view
 * per log type would be a second thing to keep in sync with the writer for
 * no gain. The summary above it is the human sentence; this is the receipt.
 */
export function DetailDisclosure({ detail }: { detail: string }) {
  const [open, setOpen] = useState(false);

  let pretty = detail;
  try {
    pretty = JSON.stringify(JSON.parse(detail), null, 2);
  } catch {
    // Stored text that isn't JSON is still worth showing as-is rather than
    // hidden behind an error nobody can act on.
  }

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="text-xs font-semibold text-[var(--primary)] min-h-9 inline-flex items-center"
      >
        {open ? "Hide what changed" : "See what changed"}
      </button>
      {open && (
        <pre className="mt-1.5 p-3 bg-[var(--paper)] border border-[var(--border)] rounded-[var(--radius-md)] text-[11px] leading-relaxed text-[var(--ink-700)] overflow-x-auto">
          {pretty}
        </pre>
      )}
    </div>
  );
}
