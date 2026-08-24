import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadMyEarnings } from "@/lib/staff/loadMyEarnings";
import { MyEarningsView } from "./MyEarningsView";

export default async function MyPayPage() {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const data = await loadMyEarnings(session.id);
  if (!data) redirect("/login"); // employee record vanished mid-session — treat as signed out

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">My Pay</h1>
      <p className="text-sm text-[var(--ink-500)] mb-8">
        {data.employee.name} — figures below are locked snapshots from each finalized shift, not
        recalculated live.
      </p>

      {data.shifts.length === 0 ? (
        <p className="text-sm text-[var(--ink-500)]">No finalized shifts yet — check back after your first closing report is saved.</p>
      ) : (
        <>
          <div className="border rounded p-4 mb-8">
            <div className="text-xs text-[var(--ink-500)] mb-1">Total across {data.shifts.length} shift{data.shifts.length === 1 ? "" : "s"}</div>
            <div className="text-2xl font-semibold tabular-nums">${data.lifetimeTotal.toFixed(2)}</div>
          </div>

          <MyEarningsView shifts={data.shifts} viewerEmployeeId={data.employee.id} />
        </>
      )}
    </main>
  );
}
