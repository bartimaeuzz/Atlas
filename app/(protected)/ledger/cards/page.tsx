import Link from "next/link";
import { loadLedgerCards } from "@/lib/ledger/loadCard";
import { CardForm } from "./CardForm";
import { ToggleCardActiveButton } from "./ToggleCardActiveButton";

/** Card admin (2026-08-16, Card v1) -- same retire-not-delete pattern as
 * Vendors/Categories. Youk Thai may have more than one card, each with
 * its own separate statement to reconcile. */
export default async function LedgerCardsPage() {
  const cards = await loadLedgerCards();

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/ledger/card" className="text-sm text-neutral-500 hover:text-black">
        &larr; Ledger
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Cards</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Every card whose statement gets reconciled here. Retiring a card keeps its past statement
        periods intact; it just stops being offered for new ones.
      </p>

      {cards.length === 0 ? (
        <p className="text-neutral-500 text-sm mb-4">No cards yet.</p>
      ) : (
        <ul className="divide-y border rounded mb-6 text-sm">
          {cards.map((c) => (
            <li key={c.id} className={"px-3 py-2 flex items-center justify-between" + (c.active ? "" : " opacity-50")}>
              <span>
                {c.name}
                {!c.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
              </span>
              <ToggleCardActiveButton cardId={c.id} nextActive={!c.active} />
            </li>
          ))}
        </ul>
      )}

      <CardForm />
    </main>
  );
}
