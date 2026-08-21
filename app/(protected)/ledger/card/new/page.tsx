import Link from "next/link";
import { loadLedgerCards } from "@/lib/ledger/loadCard";
import { NewPeriodForm } from "../NewPeriodForm";
import { EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** Dedicated "New statement period" page, same pattern as Supplier
 * Check's /new -- redirects to the new period's detail page on success. */
export default async function NewCardStatementPeriodPage() {
  if (!(await hasCapability("VIEW_LEDGER_CARD_REPORT"))) return <NoAccess pageLabel="the Card report" />;

  const allCards = await loadLedgerCards();
  const cards = allCards.filter((c) => c.active);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <Link href="/ledger/card" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Card
      </Link>
      <h1 className="text-2xl font-bold text-[var(--ink-900)] mt-2 mb-4">New statement period</h1>
      {cards.length === 0 ? (
        <EmptyState
          message="No active cards yet — add one first."
          action={
            <LinkButton href="/ledger/cards" variant="secondary" size="sm">
              Add a card
            </LinkButton>
          }
        />
      ) : (
        <NewPeriodForm cards={cards} />
      )}
    </main>
  );
}
