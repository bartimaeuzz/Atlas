"use client";

import Link from "next/link";
import { useTransition } from "react";
import { toggleLedgerVendorActive } from "@/lib/actions/ledger";

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
        <p className="text-sm text-neutral-400">No vendors yet.</p>
      ) : (
        <ul className="divide-y border rounded text-sm">
          {vendors.map((v) => (
            <li key={v.id} className={"px-3 py-2 flex items-center justify-between" + (v.active ? "" : " opacity-50")}>
              <span>
                {v.name}
                {!v.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
              </span>
              <div className="flex items-center gap-3">
                <Link href={`/ledger/vendors/${v.id}/edit`} className="text-xs text-neutral-500 hover:text-black underline">
                  Edit
                </Link>
                <ToggleVendorActiveButton vendorId={v.id} nextActive={!v.active} />
              </div>
            </li>
          ))}
        </ul>
      )}

      <Link href="/ledger/vendors/new" className="text-sm underline text-neutral-500 hover:text-black">
        + Add a vendor
      </Link>
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
      className="text-xs text-neutral-500 hover:text-black underline disabled:opacity-50"
    >
      {nextActive ? "Reactivate" : "Retire"}
    </button>
  );
}
