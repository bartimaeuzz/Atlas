import Link from "next/link";
import { loadPayrollRegister } from "@/lib/payroll/loadPayrollRegister";
import { toIso, weekStartFor, datesInWeek, shiftWeek } from "@/lib/schedule/weekMath";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { MarkPaidButton, RevertToDraftButton } from "./PayrollActions";

function weekLabel(weekStart: string): string {
  const days = datesInWeek(weekStart);
  const start = new Date(`${days[0]}T12:00:00Z`);
  const end = new Date(`${days[6]}T12:00:00Z`);
  const startStr = start.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const endStr = end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  return `${startStr} - ${endStr}`;
}

/** Payroll (2026-08-17) — weekly payroll register. Reuses Atlas's own
 * already-computed shift payouts (see lib/payroll/loadPayrollRegister.ts),
 * one Monday-Sunday week at a time, matching the weekly cadence Soothr's
 * real payroll DNA file uses. A week stays DRAFT (live numbers, can
 * change if shift data changes) until every shift that week is
 * finalized and a manager marks it PAID, which locks a snapshot. See
 * project_atlas_payroll memory for the full design conversation. */
export default async function PayrollPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const params = await searchParams;
  const todayIso = toIso(new Date());
  const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(params.week ?? "") ? weekStartFor(params.week!) : weekStartFor(todayIso);

  const [register, session] = await Promise.all([loadPayrollRegister(weekStart), getCurrentStaffSession()]);
  const isAdmin = session?.systemRole === "ADMIN";

  const prevWeek = shiftWeek(weekStart, -1);
  const nextWeek = shiftWeek(weekStart, 1);

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Payroll</h1>
      <p className="text-neutral-500 text-sm mb-4">
        What every employee is owed for the week, built from Atlas&apos;s own finalized shift payouts.
      </p>

      <div className="flex items-center justify-between gap-3 mb-4">
        <Link href={`/payroll?week=${prevWeek}`} className="text-sm px-3 py-1.5 rounded border hover:bg-neutral-50">
          ← Prev week
        </Link>
        <div className="text-sm font-medium">{weekLabel(weekStart)}</div>
        <Link href={`/payroll?week=${nextWeek}`} className="text-sm px-3 py-1.5 rounded border hover:bg-neutral-50">
          Next week →
        </Link>
      </div>

      <div className="flex items-center gap-2 mb-4">
        {register.status === "paid" ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-green-100 text-green-700">
            Paid{register.paidByName ? ` — by ${register.paidByName}` : ""}
            {register.paidAt ? ` on ${new Date(register.paidAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-600">
            Draft — live numbers
          </span>
        )}
      </div>

      {register.status === "draft" && register.unfinalizedShiftCount > 0 && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-3 text-sm mb-4">
          {register.unfinalizedShiftCount} shift{register.unfinalizedShiftCount === 1 ? "" : "s"} this week{" "}
          {register.unfinalizedShiftCount === 1 ? "isn't" : "aren't"} finalized yet — finalize every shift before this
          week&apos;s payroll can be marked paid.
        </div>
      )}

      {register.rows.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-4">No finalized shift payouts for this week yet.</p>
      ) : (
        <div className="border rounded overflow-x-auto mb-4">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-neutral-50 text-neutral-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left py-2 px-3">Employee</th>
                <th className="text-right py-2 px-3">Wage</th>
                <th className="text-right py-2 px-3">Extra</th>
                <th className="text-right py-2 px-3">Incentive</th>
                <th className="text-right py-2 px-3">Deduction</th>
                <th className="text-right py-2 px-3">Tip</th>
                <th className="text-right py-2 px-3 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              {register.rows.map((row) => (
                <tr key={row.employeeId} className="border-t">
                  <td className="py-2 px-3">{row.employeeName}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${row.flatWageAmount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${row.extraPayAmount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">${row.incentiveAmount.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums">
                    {row.deductionAmount > 0 ? `-$${row.deductionAmount.toFixed(2)}` : "—"}
                  </td>
                  <td className="py-2 px-3 text-right tabular-nums">${row.totalTip.toFixed(2)}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold">${row.totalCorePayout.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t bg-neutral-50">
                <td className="py-2 px-3 font-semibold" colSpan={6}>
                  Total
                </td>
                <td className="py-2 px-3 text-right tabular-nums font-semibold">${register.total.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {register.rows.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <a
            href={`/payroll/export?week=${weekStart}`}
            className="px-4 py-2 rounded border text-sm hover:bg-neutral-50"
          >
            Download .xlsx (check export + pay stubs + acknowledgment)
          </a>
          {register.status === "draft" && (
            <MarkPaidButton weekStartDate={weekStart} disabled={!register.canMarkPaid} />
          )}
          {register.status === "paid" && isAdmin && <RevertToDraftButton weekStartDate={weekStart} />}
        </div>
      )}
    </main>
  );
}
