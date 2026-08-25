import Link from "next/link";
import { loadLedgerCardsWithStats } from "@/lib/ledger/loadCard";
import { CardForm } from "./CardForm";
import { ToggleCardActiveButton } from "./ToggleCardActiveButton";
import { DeleteCardButton } from "./DeleteCardButton";
import { EmptyState } from "@/components/ui/Card";
import { RenameCardControl } from "./RenameCardControl";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Card admin (2026-08-16, Card v1) -- retire-not-delete as the everyday
 * pattern (same as Vendors/Categories), plus an ADMIN-only hard delete
 * since 2026-08-25 (Oliver): statements can always be re-imported, so
 * losing a card's data is annoying rather than severe. Youk Thai may
 * have more than one card, each with its own statement to reconcile. */
export default async function LedgerCardsPage() {
  const [cards, viewer, session] = await Promise.all([
    loadLedgerCardsWithStats(),
    getViewerCapabilities(),
    getCurrentStaffSession(),
  ]);
  // Card admin sits behind LEDGER_CARD_MANAGE since 2026-08-24 -- this
  // only decides what renders; every action re-checks independently.
  const canManage = viewer?.has("LEDGER_CARD_MANAGE") ?? false;
  // Hard delete needs the role too, not just the grant -- a manager
  // holding the card key can rename/retire but not erase history.
  const canDelete = canManage && session?.systemRole === "ADMIN";

  return (
    <main className="max-w-2xl mx-auto p-6 sm:p-8">
      {/* 2026-08-21 visual-audit nit: the label said "Ledger" while the
          href goes to the Card tab -- a back link should name where it
          actually lands (Nielsen #4, consistency), matching how
          card/new and card/period already label theirs "Card". */}
      <Link href="/ledger/card" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Card
      </Link>
      <h1 className="text-[28px] font-bold text-[var(--ink-900)] mt-2 mb-1">Cards</h1>
      <p className="text-sm text-[var(--ink-500)] mb-6">
        Every card whose statement gets reconciled here. Retiring a card keeps its past statement
        periods intact; it just stops being offered for new ones.
      </p>

      {cards.length === 0 ? (
        <div className="mb-6">
          <EmptyState message="No cards yet." />
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] mb-6 text-sm bg-[var(--card)]">
          {cards.map((c) => (
            <li key={c.id} className={"px-3 py-2.5 flex items-center justify-between gap-3" + (c.active ? "" : " opacity-50")}>
              {canManage ? (
                // Owns the whole left side: name text at rest, the edit
                // field in the name's own position while renaming.
                <RenameCardControl key={c.name} cardId={c.id} currentName={c.name} />
              ) : (
                <span className="text-[var(--ink-900)] truncate">{c.name}</span>
              )}
              <span className="flex items-center gap-3 shrink-0">
                {!c.active && <span className="text-xs text-[var(--ink-500)]">(retired)</span>}
                {canManage && <ToggleCardActiveButton cardId={c.id} nextActive={!c.active} />}
                {canDelete && (
                  <DeleteCardButton
                    cardId={c.id}
                    cardName={c.name}
                    periodCount={c.periodCount}
                    transactionCount={c.transactionCount}
                    earliestPeriodStart={c.earliestPeriodStart}
                  />
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canManage && <CardForm />}
    </main>
  );
}
