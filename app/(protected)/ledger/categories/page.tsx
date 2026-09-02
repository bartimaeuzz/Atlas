import Link from "next/link";
import { loadLedgerCategories } from "@/lib/ledger/loadLedgerAdmin";
import { CategoryForm } from "./CategoryForm";
import { ToggleCategoryActiveButton } from "./ToggleCategoryActiveButton";
import { SetCategoryPnlGroupSelect } from "./SetCategoryPnlGroupSelect";
import { EmptyState, Section } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

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
  const [categories, canSeeAnalytics] = await Promise.all([loadLedgerCategories(), hasCapability("VIEW_ANALYTICS")]);

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      <Link href="/ledger" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Ledger
      </Link>
      <h1 className="text-3xl font-bold text-[var(--ink-900)] mt-2 mb-1">Expense categories</h1>
      <p className="text-sm text-[var(--ink-500)] mb-6">
        Categories used across Petty Cash, Supplier Check, and Card entries. Retiring a category
        keeps every past entry that used it intact; it just stops being offered for new ones. The
        &ldquo;P&amp;L&rdquo; dropdown controls which line of the{" "}
        {/* Phase C (2026-08-21): plain text, not a link, for anyone
            without VIEW_ANALYTICS -- the sentence still explains what the
            dropdown does, it just stops offering a door that's locked. */}
        {canSeeAnalytics ? (
          <Link href="/analytics" className="underline hover:text-[var(--ink-900)]">
            Analytics / P&amp;L
          </Link>
        ) : (
          "Analytics / P&L"
        )}{" "}
        report this category rolls up into.
      </p>

      <Section>
        {categories.length === 0 ? (
          <EmptyState message="No categories yet." />
        ) : (
          <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] mb-6 text-sm bg-[var(--card)]">
            {categories.map((c) => (
              <li key={c.id} className={"px-3 py-2.5 flex items-center justify-between gap-2 flex-wrap" + (c.active ? "" : " opacity-50")}>
                <span className="text-[var(--ink-900)]">
                  {c.name}
                  {!c.active && <span className="ml-2 text-xs text-[var(--ink-500)]">(retired)</span>}
                </span>
                <span className="flex items-center gap-2 shrink-0">
                  <SetCategoryPnlGroupSelect categoryId={c.id} pnlGroup={c.pnlGroup} />
                  <ToggleCategoryActiveButton categoryId={c.id} nextActive={!c.active} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <CategoryForm />
    </main>
  );
}
