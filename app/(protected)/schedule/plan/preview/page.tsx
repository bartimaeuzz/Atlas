import Link from "next/link";
import { loadWeeklyPlan } from "@/lib/schedule/loadWeeklyPlan";
import { WeeklyPlanGrid } from "@/app/schedule/WeeklyPlanGrid";
import { PublishWeekButton } from "../PublishWeekButton";
import { PageHeader, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Tabs, Tab } from "@/components/ui/Tabs";

/** Safety-check step between the editable draft grid and actually
 * publishing (2026-08-11, Oliver). Two views, toggled by ?view=:
 *   - "manager" (default): read-only version of the same grid, keeps
 *     all the diagnostics (red under-target, orange double-booking,
 *     red vacancy) so problems are still visible right before locking
 *     the week in.
 *   - "staff": what employees will actually see once this is
 *     published — no manager-only warnings, just who's working when.
 * REVERTED (2026-08-11, same day): briefly made Manager view editable
 * on the theory that reviewing shouldn't force a trip back to the main
 * grid — Oliver corrected this explicitly: Preview must never allow
 * editing, full stop, in either view. "Edit" has to stay a clearly
 * separate, deliberate action (the visible button below), not
 * something that happens by accident while just looking. Both views
 * reuse WeeklyPlanGrid's readOnly/hideDiagnostics modes rather than a
 * second component, so this view can never drift from the real grid's
 * data or layout — but readOnly is now unconditionally true here. */
export default async function WeeklyPlanPreviewPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string; view?: string }>;
}) {
  const params = await searchParams;
  const weekStartDate = params.week;
  const view = params.view === "staff" ? "staff" : "manager";

  if (!weekStartDate) {
    return (
      <main className="max-w-5xl mx-auto p-8 font-sans">
        <p className="text-sm text-[var(--ink-500)] mb-4">Missing week.</p>
        <Link href="/schedule/plan" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] underline">
          &larr; Back to Weekly Plan
        </Link>
      </main>
    );
  }

  const data = await loadWeeklyPlan(weekStartDate);

  if (!data.week) {
    return (
      <main className="max-w-5xl mx-auto p-8 font-sans">
        <p className="text-sm text-[var(--ink-500)] mb-4">This week hasn&apos;t been generated yet.</p>
        <Link
          href={`/schedule/plan?week=${weekStartDate}`}
          className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] underline"
        >
          &larr; Back to Weekly Plan
        </Link>
      </main>
    );
  }

  const week = data.week;

  return (
    <main className="max-w-5xl mx-auto p-8 font-sans">
      <Link href={`/schedule/plan?week=${weekStartDate}`} className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Schedule Planner
      </Link>

      <PageHeader
        title="Preview"
        description="This is a read-only look — nothing here can be changed. To make changes, use the Edit button below."
        actions={week.status === "published" ? <Badge tone="success">Published</Badge> : <Badge tone="warning">Draft</Badge>}
      />
      <p className="text-sm text-[var(--ink-500)] -mt-4 mb-4">
        Week of {data.dates[0]} to {data.dates[6]}.
      </p>

      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <Tabs>
          <Tab href={`/schedule/plan/preview?week=${weekStartDate}&view=manager`} active={view === "manager"}>
            Manager view
          </Tab>
          <Tab href={`/schedule/plan/preview?week=${weekStartDate}&view=staff`} active={view === "staff"}>
            Staff view
          </Tab>
        </Tabs>
        <LinkButton href={`/schedule/plan?week=${weekStartDate}`} variant="secondary" size="sm" className="shrink-0">
          Edit this week &rarr;
        </LinkButton>
      </div>
      <p className="text-xs text-[var(--ink-500)] mb-6">
        {view === "manager"
          ? "Same warnings you see while editing — understaffed slots, double-bookings, vacating-soon — so you can catch problems before publishing."
          : "What employees will see once this is published — no manager-only warnings."}
      </p>

      <WeeklyPlanGrid data={data} readOnly hideDiagnostics={view === "staff"} />

      {week.status === "draft" && (
        <Card className="mt-8 flex flex-wrap items-center justify-between gap-3 !bg-[var(--paper)]">
          <p className="text-sm text-[var(--ink-500)]">
            Looks right? Publishing makes this visible to staff and starts auto-filling new shifts.
          </p>
          <PublishWeekButton weekId={week.id} />
        </Card>
      )}
    </main>
  );
}
