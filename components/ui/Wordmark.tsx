/**
 * Mohom wordmark (mark drawn 2026-09-02; placement decisions below).
 *
 * "Atlas" is the working name of this codebase; the product a restaurant
 * receives is Mohom. The mark is the hourglass "M" — two M's meeting at
 * the waist — drawn as a single path in `currentColor`, so it takes its
 * container's text colour (white on the deep tile, brand indigo on a
 * light ground). The certified minimum render is 16px; never smaller.
 *
 * Three renderings, restaurant-name-first per the locked 2026-08-31
 * decision (staff at a shared terminal need "am I in the right place?"
 * answered by their OWN restaurant's name, so the name leads and the
 * product identifies quietly):
 *
 *  - Rail, collapsed (the 48px icon rail / desktop collapsed): the M
 *    alone, white in the deep-indigo tile — the app icon, in the app.
 *  - Rail, expanded (216px): [M] · restaurant name, one line, the name
 *    truncating and the mark never shrinking.
 *  - Sign-in / recover: restaurant name LARGE, the drawn "Mohom" wordmark
 *    small beneath it (replacing the old uppercase-tracked text, which the
 *    design system bans because positive tracking detaches Thai tone
 *    marks). No restaurant name yet → the wordmark alone.
 *
 * Placement note vs the brand book: the book assigns the horizontal
 * lockup to the sidebar header and the tall column lockup to sign-in.
 * This app's header and sign-in are built around the RESTAURANT name
 * (locked decision), so the drawn full wordmark serves as the small
 * product identifier instead, and the tall column lockup stays a print
 * asset. The M and the horizontal wordmark are used; the column is not.
 */

export const PRODUCT_NAME = "Mohom";

/** The hourglass M — collapsed-rail tile and the expanded rail's mark.
 * Colour comes from the parent (currentColor); pass height via className. */
export function MohomMark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" role="img" aria-label="Mohom" fill="currentColor" className={`w-auto ${className}`}>
      <path d="M0 100 L0 0 L30 0 L60 26 L90 0 L120 0 L120 100 L90 100 L90 29.11 L60 55.11 L30 29.11 L30 100 Z M30 0 L30 70.89 L60 44.89 L90 70.89 L90 0 L120 0 L120 100 L90 100 L60 74 L30 100 L0 100 L0 0 Z" />
    </svg>
  );
}

/** The full "Mohom" wordmark, horizontal. Small product identifier under a
 * restaurant name; larger when the name is not set. */
export function MohomWordmark({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 604 100" role="img" aria-label="Mohom" fill="currentColor" className={`w-auto ${className}`}>
      <path d="M0 100 L0 0 L30 0 L60 26 L90 0 L120 0 L120 100 L90 100 L90 29.11 L60 55.11 L30 29.11 L30 100 Z M30 0 L30 70.89 L60 44.89 L90 70.89 L90 0 L120 0 L120 100 L90 100 L60 74 L30 100 L0 100 L0 0 Z M136 50 a52 52 0 1 0 104 0 a52 52 0 1 0 -104 0 Z M164 50 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0 Z M256 0 L286 0 L286 37 L318 37 L318 0 L348 0 L348 100 L318 100 L318 63 L286 63 L286 100 L256 100 Z M364 50 a52 52 0 1 0 104 0 a52 52 0 1 0 -104 0 Z M392 50 a24 24 0 1 1 48 0 a24 24 0 1 1 -48 0 Z M484 100 L484 0 L514 0 L544 26 L574 0 L604 0 L604 100 L574 100 L574 29.11 L544 55.11 L514 29.11 L514 100 Z M514 0 L514 70.89 L544 44.89 L574 70.89 L574 0 L604 0 L604 100 L574 100 L544 74 L514 100 L484 100 L484 0 Z" />
    </svg>
  );
}

/** Expanded-rail wordmark: mark · restaurant name, one line. */
export function RailWordmark({ restaurantName }: { restaurantName: string | null }) {
  return (
    <span className="flex items-center gap-1.5 min-w-0">
      <MohomMark className="shrink-0 h-5 text-[var(--brand)] group-hover:text-[var(--brand-700)]" />
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

/** Sign-in / recover header: restaurant name large, the drawn wordmark small. */
export function LoginWordmark({ restaurantName }: { restaurantName: string | null }) {
  if (!restaurantName) {
    return <MohomWordmark className="h-7 text-[var(--brand)] mb-4 mx-auto" />;
  }
  return (
    <div className="mb-4">
      <div className="text-2xl font-bold text-[var(--ink-900)] truncate" title={restaurantName}>
        {restaurantName}
      </div>
      <MohomWordmark className="h-3.5 text-[var(--brand)] mt-1.5 mx-auto" />
    </div>
  );
}
