/**
 * Mohom wordmark (2026-09-01, spec locked with Oliver 2026-08-31).
 *
 * "Atlas" is the working name of this codebase; the product a restaurant
 * receives is called Mohom. Three renderings, and the restaurant's own
 * name is part of two of them:
 *
 *  - Rail, collapsed (48px — every phone, and desktop when collapsed):
 *    the short mark alone, "MHM". There is no room for a name here; that
 *    is the whole reason the short mark exists.
 *  - Rail, expanded (216px): "MHM · Youk Thai" — mark in brand colour,
 *    middot separator (the app's separator everywhere, never a pipe),
 *    then the restaurant name in ink. Product first: the rail identifies
 *    the software.
 *  - Sign-in / recover pages: restaurant name LARGE, "MOHOM" small under
 *    it — reversed on purpose. Staff at a shared terminal need "am I in
 *    the right place?" answered by their own restaurant's name.
 *
 * While no restaurant name is set (Settings → Restaurant) every rendering
 * shows the mark alone — never "MHM · " with a dangling separator, and
 * never a hardcoded fallback name.
 *
 * The name is clamped to ONE line with an ellipsis in every rendering.
 * "Youk Thai" is short; the next customer's may be twice as long, and the
 * 2026-08-31 audits found three long-content-breaks-layout defects in one
 * day. Mark and separator never shrink; only the name gives way.
 */

export const PRODUCT_NAME = "Mohom";
export const PRODUCT_MARK = "MHM";

/** The short mark on its own — the collapsed rail's tile. */
export function MohomMark({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold tracking-wide ${className}`} aria-hidden="true">
      {PRODUCT_MARK}
    </span>
  );
}

/** Expanded-rail wordmark: mark · restaurant name, one line. */
export function RailWordmark({ restaurantName }: { restaurantName: string | null }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <MohomMark className="shrink-0 text-[17px] tracking-tight text-[var(--brand)] group-hover:text-[var(--brand-700)]" />
      {restaurantName && (
        <>
          <span className="shrink-0 text-[var(--ink-400)]" aria-hidden="true">
            ·
          </span>
          <span className="min-w-0 truncate text-sm font-semibold text-[var(--ink-900)]" title={restaurantName}>
            {restaurantName}
          </span>
        </>
      )}
    </span>
  );
}

/** Sign-in / recover header: restaurant name large, product small. */
export function LoginWordmark({ restaurantName }: { restaurantName: string | null }) {
  if (!restaurantName) {
    return <div className="text-2xl font-bold text-[var(--brand)] mb-4">{PRODUCT_NAME}</div>;
  }
  return (
    <div className="mb-4">
      <div className="text-2xl font-bold text-[var(--ink-900)] truncate" title={restaurantName}>
        {restaurantName}
      </div>
      <div className="text-xs font-semibold tracking-[0.2em] uppercase text-[var(--brand)] mt-1">{PRODUCT_NAME}</div>
    </div>
  );
}
