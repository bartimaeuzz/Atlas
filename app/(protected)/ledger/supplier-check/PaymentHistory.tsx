import type { PaymentHistoryView } from "@/lib/ledger/loadSupplierCheck";

/** Most recent checks first, each showing which invoice numbers it
 * settled -- the "did we already pay this" lookup a manager needs. */
export function PaymentHistory({ payments }: { payments: PaymentHistoryView[] }) {
  if (payments.length === 0) {
    return <p className="text-sm text-neutral-400 border rounded p-3">No payments recorded yet.</p>;
  }

  return (
    <ul className="divide-y border rounded text-sm">
      {payments.map((p) => (
        <li key={p.id} className="px-3 py-2.5">
          <div className="flex items-center justify-between">
            <span className="font-medium">{p.vendorName}</span>
            <span className="font-medium">${p.totalAmount.toFixed(2)}</span>
          </div>
          <div className="text-neutral-500 text-xs mt-0.5">
            {p.paidDate}
            {p.checkNumber && ` · check #${p.checkNumber}`} · by {p.paidByName}
          </div>
          <div className="text-neutral-400 text-[11px] mt-0.5">invoices: {p.invoiceNumbers.join(", ")}</div>
        </li>
      ))}
    </ul>
  );
}
