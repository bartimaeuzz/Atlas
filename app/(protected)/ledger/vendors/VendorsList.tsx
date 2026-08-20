"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleLedgerVendorActive } from "@/lib/actions/ledger";
import { EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

interface Vendor {
  id: number;
  name: string;
  payeeAddressLine1: string | null;
  payeeAddressLine2: string | null;
  payeeAddressLine3: string | null;
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

function ToggleVendorActiveButton({ vendorId, nextActive }: { vendorId: number; nextActive: boolean }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => startTransition(() => toggleLedgerVendorActive(vendorId, nextActive))}
      className={`text-xs text-[var(--ink-500)] hover:text-[var(--ink-900)] underline disabled:opacity-50 ${TAP_TARGET_PAD}`}
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
