import Link from "next/link";
import { Tab } from "@/components/ui/Tabs";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Shared tab header for the Ledger area (2026-08-14 restructure, Oliver's
 * ask: "after enter ledger page shows petty cash and supplier tabs").
 * Petty Cash lives at /ledger (a month list -- see MonthList.tsx),
 * Supplier lives at /ledger/supplier-check -- these are separate routes,
 * not client-side tab state, same pattern as /reports' ReportTabLink.
 * Vendors/Categories admin links ride along on the right since both tabs
 * depend on that same vendor/category data.
 *
 * Card tab added 2026-08-16 -- a third channel, reconcile-a-statement-
 * period shape rather than log-as-you-go (see db/schema.ts's
 * cardStatementPeriods comment). "Cards" joins Vendors/Categories on the
 * right since it's the same kind of admin-managed reference data.
 *
 * Restyled onto the design system 2026-08-19 -- reuses the shared Tab
 * primitive (functional primary active state, not brand indigo -- see
 * that component's own doc comment) instead of hand-rolled black/white
 * pill styling. */
export function LedgerTabs({ active }: { active: "petty-cash" | "supplier" | "card" }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="flex items-center gap-2 text-sm">
        <Tab href="/ledger" active={active === "petty-cash"}>
          Petty Cash
        </Tab>
        <Tab href="/ledger/supplier-check" active={active === "supplier"}>
          Supplier
        </Tab>
        <Tab href="/ledger/card" active={active === "card"}>
          Card
        </Tab>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <Link href="/ledger/vendors" className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Vendors
        </Link>
        <Link href="/ledger/categories" className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Categories
        </Link>
        <Link href="/ledger/cards" className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Cards
        </Link>
      </div>
    </div>
  );
}
