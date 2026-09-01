"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { toggleLedgerVendorActive } from "@/lib/actions/ledger";
import { EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";

interface Vendor {
  id: number;
  name: string;
  active: boolean;
}

/** Same "dedicated /new and /[id]/edit pages, not an inline expandable
 * form" pattern as Positions admin -- simpler and more robust than
 * managing an inline form's open/closed state against a server action
 * that redirect()s on success. */
export function VendorsList({ vendors }: { vendors: Vendor[] }) {
  return (
    <div className="space-y-4">
      {vendors.length === 0 ? (
        <EmptyState message="No vendors yet." />
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-lg)] text-sm bg-[var(--card)]">
          {vendors.map((v) => (
            <li key={v.id} className={"px-3 py-2.5 flex items-center justify-between gap-2" + (v.active ? "" : " opacity-50")}>
              <span className="text-[var(--ink-900)]">
                {v.name}
                {!v.active && <span className="ml-2 text-xs text-[var(--ink-500)]">(retired)</span>}
              </span>
              <div className="flex items-center gap-3">
                <Link
                  href={`/ledger/vendors/${v.id}/edit`}
                  className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}
                >
                  Edit
                </Link>
                <ToggleVendorActiveButton vendorId={v.id} nextActive={!v.active} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <LinkButton href="/ledger/vendors/new" variant="secondary" size="sm">
        + Add a vendor
      </LinkButton>
    </div>
  );
}

/** 2026-08-21 visual-audit fix: Retire fired instantly here with no
 * confirmation -- the same gap fixed on People's EmployeeToggleActive-
 * Button and on Ledger's Category/Card toggles earlier the same day.
 * This instance was missed by that sweep because it lives inline in
 * VendorsList.tsx rather than in its own Toggle*ActiveButton.tsx file,
 * so a filename-shaped search didn't surface it. Reactivate stays
 * instant (it's the undo path, not itself destructive). */
function ToggleVendorActiveButton({ vendorId, nextActive }: { vendorId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);

  function doToggle() {
    startTransition(async () => {
      await toggleLedgerVendorActive(vendorId, nextActive);
      setConfirmOpen(false);
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={isPending}
        onClick={() => (nextActive ? doToggle() : setConfirmOpen(true))}
        className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
      >
        {nextActive ? "Reactivate" : "Retire"}
      </button>
      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Retire this vendor?"
        description="It'll stop showing up when logging new entries. Past entries under it stay intact, and you can reactivate it any time from this page."
        confirmLabel="Retire"
        loading={isPending}
        onConfirm={doToggle}
      />
    </>
  );
}
