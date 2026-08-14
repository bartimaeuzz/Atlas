import Link from "next/link";

/** Shared tab header for the Ledger area (2026-08-14 restructure, Oliver's
 * ask: "after enter ledger page shows petty cash and supplier tabs").
 * Petty Cash lives at /ledger (a month list -- see MonthList.tsx),
 * Supplier lives at /ledger/supplier-check -- these are separate routes,
 * not client-side tab state, same pattern as /reports' ReportTabLink.
 * Vendors/Categories admin links ride along on the right since both tabs
 * depend on that same vendor/category data. */
export function LedgerTabs({ active }: { active: "petty-cash" | "supplier" }) {
  return (
    <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
      <div className="flex items-center gap-2 text-sm">
        <TabLink href="/ledger" isActive={active === "petty-cash"}>
          Petty Cash
        </TabLink>
        <TabLink href="/ledger/supplier-check" isActive={active === "supplier"}>
          Supplier
        </TabLink>
      </div>
      <div className="flex items-center gap-3 text-xs">
        <Link href="/ledger/vendors" className="text-neutral-500 hover:text-black underline">
          Vendors
        </Link>
        <Link href="/ledger/categories" className="text-neutral-500 hover:text-black underline">
          Categories
        </Link>
      </div>
    </div>
  );
}

function TabLink({ href, isActive, children }: { href: string; isActive: boolean; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className={
        "px-3 py-1.5 rounded border " +
        (isActive ? "bg-black text-white border-black" : "text-neutral-600 hover:bg-neutral-50")
      }
    >
      {children}
    </Link>
  );
}
