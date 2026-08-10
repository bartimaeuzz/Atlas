import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadMyEarnings } from "@/lib/staff/loadMyEarnings";
import { logout } from "@/lib/actions/auth";

export default async function MyPayPage() {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const data = await loadMyEarnings(session.id);
  if (!data) redirect("/login"); // employee record vanished mid-session — treat as signed out

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <div className="flex items-center justify-between mb-1">
        <h1 className="text-2xl font-semibold">My Pay</h1>
        <form action={logout}>
          <button type="submit" className="text-sm text-neutral-500 hover:underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="text-sm text-neutral-500 mb-8">
        {data.employee.name} — figures below are locked snapshots from each finalized shift, not
        recalculated live.
      </p>

      {data.shifts.length === 0 ? (
        <p className="text-sm text-neutral-500">No finalized shifts yet — check back after your first closing report is saved.</p>
      ) : (
        <>
          <div className="border rounded p-4 mb-8">
            <div className="text-xs text-neutral-500 mb-1">Total across {data.shifts.length} shift{data.shifts.length === 1 ? "" : "s"}</div>
            <div className="text-2xl font-semibold tabular-nums">${data.lifetimeTotal.toFixed(2)}</div>
          </div>

          <div className="space-y-6">
            {data.shifts.map((s) => (
              <ShiftCard key={s.shiftId} shift={s} viewerEmployeeId={data.employee.id} />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function ShiftCard({
  shift,
  viewerEmployeeId,
}: {
  shift: Awaited<ReturnType<typeof loadMyEarnings>> extends infer T ? (T extends { shifts: (infer S)[] } ? S : never) : never;
  viewerEmployeeId: number;
}) {
  const p = shift.payout;
  return (
    <section className="border rounded p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="font-medium">
          {shift.date} — {shift.period}
        </h2>
        <span className="text-lg font-semibold tabular-nums">${p.totalCorePayout.toFixed(2)}</span>
      </div>

      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 mb-4">
        {p.pool1Share > 0 && <Row label="Pool 1 (dine-in) tip" value={`$${p.pool1Share.toFixed(2)}`} />}
        {p.pool2Share > 0 && <Row label="Pool 2 (takeout/online) tip" value={`$${p.pool2Share.toFixed(2)}`} />}
        {p.pool3Share > 0 && <Row label="Pool 3 (delivery) tip" value={`$${p.pool3Share.toFixed(2)}`} />}
        {p.hostUpsellTipShare > 0 && <Row label="Drink bonus" value={`$${p.hostUpsellTipShare.toFixed(2)}`} />}
        <Row label="Total tip" value={`$${p.totalTip.toFixed(2)}`} />
        <Row label="Wage" value={`$${p.flatWageAmount.toFixed(2)}`} />
        {p.extraPayAmount > 0 && <Row label="Extra pay" value={`$${p.extraPayAmount.toFixed(2)}`} />}
        {p.incentiveAmount > 0 && <Row label="Incentive" value={`$${p.incentiveAmount.toFixed(2)}`} />}
      </dl>

      {shift.coworkers.length > 1 && (
        <div className="border-t pt-3">
          <div className="text-xs text-neutral-500 mb-2">Also worked this shift</div>
          <ul className="text-sm space-y-1">
            {shift.coworkers
              .filter((c) => c.employeeId !== viewerEmployeeId)
              .map((c) => (
                <li key={c.employeeId} className="flex justify-between">
                  <span>
                    {c.employeeName} <span className="text-neutral-400">— {c.positionName}</span>
                  </span>
                  {typeof c.tipShare === "number" && (
                    <span className="tabular-nums text-neutral-500">${(c.tipShare as number).toFixed(2)}</span>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="text-right tabular-nums">{value}</dd>
    </div>
  );
}
