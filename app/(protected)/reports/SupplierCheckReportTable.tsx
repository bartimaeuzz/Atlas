import Link from "next/link";
import type { SupplierCheckReportData } from "@/lib/reports/loadSupplierCheckReport";
import { formatMoney } from "@/app/(protected)/ledger/formatMoney";
import {
  Card,
  Badge,
  DayLabel,
  EmptyState,
  TableCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  TFoot,
  StackedCardList,
  StackedCard,
  StackedField,
  StackedTotal,
} from "@/components/ui";

/** Range view of checks written to suppliers -- one row per check
 * payment, Memo column shows which invoice numbers it settled, matching
 * the DNA "Export" sheet's own layout. Status column (2026-08-14) shows
 * Printed vs Paid, the two-stage lifecycle added after Oliver's
 * conversation with Aey. The full column set (with payee address, for
 * printing) is in the .xlsx export only -- this on-page table stays
 * readable at a glance, same split as Sales & Tax's page-vs-export.
 *
 * Retrofitted onto the design system 2026-08-22 (shared formatMoney,
 * weekday-prefixed dates, stacked cards on phone). */
export function SupplierCheckReportTable({ data }: { data: SupplierCheckReportData }) {
  return (
    <section>
      <div className="grid grid-cols-2 gap-3 mb-4 max-w-md">
        <SummaryStat label="Total paid" value={formatMoney(data.totalAmount)} />
        <SummaryStat label="Checks written" value={String(data.checkCount)} />
      </div>

      {data.rows.length === 0 ? (
        <EmptyState message="No supplier check payments in this range." />
      ) : (
        <>
          {/* Phone: stacked cards */}
          <StackedCardList>
            {data.rows.map((row) => (
              <StackedCard
                key={row.paymentId}
                title={
                  <Link href="/ledger/supplier-check" className="underline underline-offset-2">
                    {row.vendorName}
                  </Link>
                }
                trailing={<StatusBadge status={row.status} />}
              >
                {/* "Paid on", not "Paid": the card already shows a Paid/Printed
                    status badge beside the vendor name, and two different
                    meanings of the same word on one card is exactly the
                    ambiguity this audience does not need. */}
                <StackedField label="Paid on" value={<DayLabel iso={row.paidDate} />} />
                <StackedField label="Check #" value={row.checkNumber || "—"} numeric />
                <StackedField label="Memo (invoices)" value={row.invoiceNumbers.join(", ") || "—"} />
                <StackedField label="Amount" value={formatMoney(row.totalAmount)} numeric />
              </StackedCard>
            ))}
            <StackedTotal label={`Total (${data.checkCount} checks)`} value={formatMoney(data.totalAmount)} />
          </StackedCardList>

          {/* Desktop: table */}
          <TableCard>
            <Table minWidth={680}>
              <THead>
                <TR>
                  <TH>Paid</TH>
                  <TH numeric>Check #</TH>
                  <TH>Pay</TH>
                  <TH>Memo (invoices)</TH>
                  <TH numeric>Amount</TH>
                  <TH>Status</TH>
                </TR>
              </THead>
              <TBody>
                {data.rows.map((row) => (
                  <TR key={row.paymentId}>
                    <TD className="whitespace-nowrap">
                      <Link href="/ledger/supplier-check" className="hover:underline underline-offset-2">
                        <DayLabel iso={row.paidDate} />
                      </Link>
                    </TD>
                    <TD numeric>{row.checkNumber || "—"}</TD>
                    <TD emphasis>{row.vendorName}</TD>
                    <TD muted>{row.invoiceNumbers.join(", ") || "—"}</TD>
                    <TD numeric emphasis>
                      {formatMoney(row.totalAmount)}
                    </TD>
                    <TD>
                      <StatusBadge status={row.status} />
                    </TD>
                  </TR>
                ))}
              </TBody>
              <TFoot>
                <TD colSpan={4} emphasis>
                  Total
                </TD>
                <TD numeric emphasis>
                  {formatMoney(data.totalAmount)}
                </TD>
                <TD />
              </TFoot>
            </Table>
          </TableCard>
        </>
      )}
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  return status === "paid" ? <Badge tone="success">Paid</Badge> : <Badge tone="warning">Printed</Badge>;
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="!p-3">
      <div className="text-xs text-[var(--ink-500)]">{label}</div>
      <div className="text-lg font-semibold tabular-nums text-[var(--ink-900)]">{value}</div>
    </Card>
  );
}
