import Link from "next/link";
import { loadLedgerCategories } from "@/lib/ledger/loadLedgerAdmin";
import { CategoryForm } from "./CategoryForm";
import { ToggleCategoryActiveButton } from "./ToggleCategoryActiveButton";
import { SetCategoryPnlGroupSelect } from "./SetCategoryPnlGroupSelect";

/** Ledger expense categories admin (2026-08-14, Ledger v1) — same
 * retire-not-delete pattern as Positions. Seeded from Soothr's real
 * category taxonomy (Bar/Food/Drinks/Mis/PAYROLL BOH/PAYROLL FOH/Fixed
 * expenses/Car/SHM) as an editable starting point, not a fixed list —
 * restaurant-configurable like everything else in Atlas.
 *
 * Gained a P&L bucket selector per row (2026-08-16, Analytics/P&L
 * feature) — see ledgerCategories' own schema comment in db/schema.ts
 * for why this exists: the P&L rollup reads this tag, not the category
 * NAME, to decide where a category's dollars land. "PAYROLL BOH"/
 * "PAYROLL FOH" default to "Excluded" here on purpose (Atlas's own
 * computed wage data is the P&L's payroll source of truth instead). */
export default async function LedgerCategoriesPage() {
  const categories = await loadLedgerCategories();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/ledger" className="text-sm text-neutral-500 hover:text-black">
        &larr; Ledger
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Expense categories</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Categories used across Petty Cash, Supplier Check, and Card entries. Retiring a category
        keeps every past entry that used it intact; it just stops being offered for new ones. The
        &ldquo;P&amp;L&rdquo; dropdown controls which line of the{" "}
        <Link href="/analytics" className="underline hover:text-black">
          Analytics / P&amp;L
        </Link>{" "}
        report this category rolls up into.
      </p>

      {categories.length === 0 ? (
        <p className="text-neutral-500 text-sm mb-4">No categories yet.</p>
      ) : (
        <ul className="divide-y border rounded mb-6 text-sm">
          {categories.map((c) => (
            <li key={c.id} className={"px-3 py-2 flex items-center justify-between gap-2" + (c.active ? "" : " opacity-50")}>
              <span>
                {c.name}
                {!c.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <SetCategoryPnlGroupSelect categoryId={c.id} pnlGroup={c.pnlGroup} />
                <ToggleCategoryActiveButton categoryId={c.id} nextActive={!c.active} />
              </span>
            </li>
          ))}
        </ul>
      )}

      <CategoryForm />
    </main>
  );
}
