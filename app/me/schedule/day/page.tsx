import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadScheduleDayPreview, type DayPreviewEntry } from "@/lib/schedule/loadScheduleDayPreview";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";

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
      <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
        <Link href="/me/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          &larr; My Schedule
        </Link>
        <p className="text-sm text-[var(--ink-500)] mt-4">Missing date.</p>
      </main>
    );
  }

  const data = await loadScheduleDayPreview(session.id, date);

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/me/schedule" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; My Schedule
      </Link>
      <PageHeader title={formatDateLabel(date)} />

      {!data ? (
        <p className="text-sm text-[var(--ink-500)] mt-4">
          This day hasn&apos;t been published yet, so there&apos;s nothing to preview.
        </p>
      ) : (
        <>
          <p className="text-[var(--ink-500)] text-sm mb-6">Who&apos;s working this day.</p>
          {!data.viewerCanSeeCoworkers && (
            <div className="mb-4">
              <Banner tone="info" title="Coworker view is off" description="Your restaurant's settings only show you your own schedule here, not coworkers'." />
            </div>
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
      <h2 className="text-sm font-medium mb-2 text-[var(--ink-900)]">{title}</h2>
      {entries.length === 0 ? (
        <EmptyState message="Nobody scheduled." />
      ) : (
        <ul className="divide-y divide-[var(--border)] border border-[var(--border)] rounded-[var(--radius-md)] text-sm">
          {entries.map((e) => (
            <li key={`${e.employeeId}-${e.positionId}`} className="px-3 py-2 flex items-center justify-between">
              <span className={e.employeeId === viewerEmployeeId ? "font-medium text-[var(--ink-900)]" : "text-[var(--ink-700)]"}>
                {e.employeeName}
                {e.employeeId === viewerEmployeeId ? " (you)" : ""}
              </span>
              <span className="text-[var(--ink-500)]">{e.positionName}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
