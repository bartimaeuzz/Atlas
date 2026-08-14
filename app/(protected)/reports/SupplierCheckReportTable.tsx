import Link from "next/link";
import type { SupplierCheckReportData } from "@/lib/reports/loadSupplierCheckReport";

/** Range view of checks written to suppliers (2026-08-14) -- one row per
 * check payment, Memo column shows which invoice numbers it settled,
 * matching the DNA "Export" sheet's own layout. The full column set
 * (with payee address, for printing) is in the .xlsx export only --
 * this on-page table stays readable at a glance, same split as Sales &
 * Tax's page-vs-export. */
export function SupplierCheckReportTable({ data }: { data: SupplierCheckReportData }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-4 mb-4 max-w-md">
        <SummaryStat label="Total paid" value={`$${data.totalAmount.toFixed(2)}`} />
        <SummaryStat label="Checks written" value={String(data.checkCount)} />
      </div>

      {data.rows.length === 0 ? (
        <p className="text-sm text-neutral-500">No supplier check payments in this range.</p>
      ) : (
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-left text-neutral-500 border-b">
              <th className="py-1.5">Paid</th>
              <th className="py-1.5">Check #</th>
              <th className="py-1.5">Pay</th>
              <th className="py-1.5">Memo (invoices)</th>
              <th className="py-1.5 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.paymentId} className="border-b">
                <td className="py-1.5">
                  <Link href="/ledger/supplier-check" className="hover:underline">
                    {row.paidDate}
                  </Link>
                </td>
                <td className="py-1.5">{row.checkNumber || "—"}</td>
                <td className="py-1.5">{row.vendorName}</td>
                <td className="py-1.5 text-neutral-500">{row.invoiceNumbers.join(", ")}</td>
                <td className="py-1.5 text-right tabular-nums">${row.totalAmount.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 font-medium">
              <td className="py-2" colSpan={4}>
                Total
              </td>
              <td className="py-2 text-right tabular-nums">${data.totalAmount.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      )}
    </section>
  );
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border rounded p-3 bg-neutral-50">
      <div className="text-xs text-neutral-500">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
