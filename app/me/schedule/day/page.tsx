import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadScheduleDayPreview, type DayPreviewEntry } from "@/lib/schedule/loadScheduleDayPreview";

const WEEKDAY_LABELS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function formatDateLabel(dateIso: string): string {
  const d = new Date(`${dateIso}T12:00:00Z`);
  const weekday = WEEKDAY_LABELS[d.getUTCDay()];
  const month = d.toLocaleDateString("en-US", { month: "long", timeZone: "UTC" });
  return `${weekday}, ${month} ${d.getUTCDate()}`;
}

/** Staff-facing single-day schedule preview (2026-08-14, Oliver's ask) —
 * reachable by clicking a published day on My Schedule's calendar. Shows
 * who's working that day, Lunch and Dinner separately, filtered through
 * the same restaurant-configurable visibility rules as My Pay's
 * coworker list (see loadScheduleDayPreview.ts's header comment for
 * why this reuses that machinery instead of a new permission system). */
export default async function ScheduleDayPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getCurrentStaffSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const date = params.date;

  if (!date) {
    return (
      <main className="max-w-2xl mx-auto p-8 font-sans">
        <Link href="/me/schedule" className="text-sm text-neutral-500 hover:text-black">
          &larr; My Schedule
        </Link>
        <p className="text-sm text-neutral-500 mt-4">Missing date.</p>
      </main>
    );
  }

  const data = await loadScheduleDayPreview(session.id, date);

  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <Link href="/me/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; My Schedule
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">{formatDateLabel(date)}</h1>

      {!data ? (
        <p className="text-sm text-neutral-500 mt-4">
          This day hasn&apos;t been published yet, so there&apos;s nothing to preview.
        </p>
      ) : (
        <>
          <p className="text-neutral-500 text-sm mb-6">Who&apos;s working this day.</p>
          {!data.viewerCanSeeCoworkers && (
            <p className="text-xs text-neutral-400 mb-4 border rounded p-2 bg-neutral-50">
              Your restaurant&apos;s settings only show you your own schedule here, not coworkers&apos;.
            </p>
          )}
          <DaySection title="Lunch" entries={data.lunch} viewerEmployeeId={session.id} />
          <DaySection title="Dinner" entries={data.dinner} viewerEmployeeId={session.id} />
        </>
      )}
    </main>
  );
}

function DaySection({
  title,
  entries,
  viewerEmployeeId,
}: {
  title: string;
  entries: DayPreviewEntry[];
  viewerEmployeeId: number;
}) {
  return (
    <div className="mb-6">
      <h2 className="text-sm font-medium mb-2">{title}</h2>
      {entries.length === 0 ? (
        <p className="text-sm text-neutral-400 border rounded p-3">Nobody scheduled.</p>
      ) : (
        <ul className="divide-y border rounded text-sm">
          {entries.map((e) => (
            <li key={`${e.employeeId}-${e.positionId}`} className="px-3 py-2 flex items-center justify-between">
              <span className={e.employeeId === viewerEmployeeId ? "font-medium" : ""}>
                {e.employeeName}
                {e.employeeId === viewerEmployeeId ? " (you)" : ""}
              </span>
              <span className="text-neutral-500">{e.positionName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
