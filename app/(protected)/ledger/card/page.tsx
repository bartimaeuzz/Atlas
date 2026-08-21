import Link from "next/link";
import { loadCardStatementPeriods } from "@/lib/ledger/loadCard";
import { LedgerTabs } from "../LedgerTabs";
import { PeriodsTable } from "./PeriodsTable";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** Card landing page (2026-08-16) -- a flat list of every statement
 * period across every card, most recent first, same "holistic table"
 * shape as Supplier Check's Checks list rather than Petty Cash's
 * per-card sub-navigation, since most restaurants only have a handful of
 * cards and periods total. "New statement period" is its own page (see
 * ./new), same pattern as Supplier Check's "Log an invoice". */
export default async function CardPage() {
  // Permission System Phase C view guard (2026-08-21).
  // VIEW_LEDGER_CARD_REPORT gates the Card statement pages -- the card is
  // held by Partner tier and above (Oliver, 2026-08-21), and this is the
  // read surface for it. Reconciling a period is separately gated by
  // FA_LEDGER_CARD_RECONCILE on the server action (Phase B part 2).
  // /ledger/cards (the card reference-data admin page) is intentionally
  // left on the plain manager guard, same as vendors/categories.
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_LEDGER_CARD_REPORT")) return <NoAccess pageLabel="the Card report" />;
  // Someone granted the card key alone gets no Petty Cash / Supplier
  // tabs -- those pages would refuse them.
  const showOverview = viewer.has("VIEW_LEDGER_OVERVIEW");

  const periods = await loadCardStatementPeriods();

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <PageHeader title="Ledger" description="Reconcile each card's statement against what was actually charged." />

      <LedgerTabs active="card" showOverview={showOverview} showCard />

      <div className="flex items-center justify-between gap-3 mb-6">
        <LinkButton href="/ledger/card/new" size="sm">
          + New statement period
        </LinkButton>
        <Link href="/ledger/cards" className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
          Manage cards
        </Link>
      </div>

      {periods.length === 0 ? (
        <EmptyState message="No statement periods yet. Start one once a card's statement is ready to reconcile." />
      ) : (
        <PeriodsTable periods={periods} />
      )}
    </main>
  );
}
