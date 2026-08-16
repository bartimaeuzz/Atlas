import Link from "next/link";
import { loadLedgerCards } from "@/lib/ledger/loadCard";
import { NewPeriodForm } from "../NewPeriodForm";

/** Dedicated "New statement period" page, same pattern as Supplier
 * Check's /new -- redirects to the new period's detail page on success. */
export default async function NewCardStatementPeriodPage() {
  const allCards = await loadLedgerCards();
  const cards = allCards.filter((c) => c.active);

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8 font-sans">
      <Link href="/ledger/card" className="text-sm text-neutral-500 hover:text-black">
        &larr; Card
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-4">New statement period</h1>
      {cards.length === 0 ? (
        <p className="text-sm text-neutral-500 border rounded p-4">
          No active cards yet —{" "}
          <Link href="/ledger/cards" className="underline hover:text-black">
            add one first
          </Link>
          .
        </p>
      ) : (
        <NewPeriodForm cards={cards} />
      )}
    </main>
  );
}
