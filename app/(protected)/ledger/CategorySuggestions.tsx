"use client";

/** The categories a vendor has actually been booked under, offered as
 * chips instead of pre-filled into the field (2026-08-31 -- see
 * useVendorCategoryPair for why several links are a question and not an
 * answer). None is selected: choosing is one deliberate tap, which is
 * the whole point.
 *
 * Renders BELOW the category select, never above it: a block above the
 * label pushes this grid cell out of line with the field beside it, which
 * is the exact regression the 2026-08-31 visual audit caught on the
 * vendor chips this feature replaces.
 */
export function CategorySuggestions({
  categoryIds,
  categories,
  onPick,
}: {
  categoryIds: number[];
  categories: { id: number; name: string }[];
  onPick: (categoryId: string) => void;
}) {
  const named = categoryIds
    .map((id) => categories.find((c) => c.id === id))
    .filter((c): c is { id: number; name: string } => c !== undefined);
  if (named.length === 0) return null;

  return (
    <div role="group" aria-label="Categories this vendor is usually booked under" className="mt-1.5">
      <p className="text-xs text-[var(--ink-500)]">Used before with — tap to choose</p>
      <div className="flex flex-wrap items-center gap-1.5 mt-1">
        {named.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => onPick(String(c.id))}
            className="min-h-8 px-2.5 rounded-[var(--radius-full)] text-xs font-medium border bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)] hover:bg-[var(--hover)]"
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
