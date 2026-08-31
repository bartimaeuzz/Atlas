import Link from "next/link";
import { loadActivityLog, describeType } from "@/lib/activityLog/loadActivityLog";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { PageHeader, Card, EmptyState, Badge, LinkButton, DayLabel } from "@/components/ui";
import { DetailDisclosure } from "./DetailDisclosure";

/** The Activity Log Centre (2026-08-22, Oliver: "we build Activity log
 * center and tag for each type of log. partner and permission-granted
 * assistant manager and admin can see log").
 *
 * The read half of the log whose write half shipped with the Ledger day
 * redesign. Gated on VIEW_ACTIVITY_LOG, which defaults to Admin+Partner —
 * ASSISTANT_MANAGER already exists as an account type, so "permission-
 * granted assistant manager" is the existing per-account override rather
 * than a new role tier.
 *
 * Filtering is by tag, and the tag list is read FROM THE DATA rather than
 * from the ActivityType union in the writer. A tag written by an older
 * deploy and since removed from the code still exists in the table, and a
 * filter that cannot find it would quietly hide real history.
 */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; before?: string }>;
}) {
  if (!(await hasCapability("VIEW_ACTIVITY_LOG"))) return <NoAccess pageLabel="the Activity Log" />;

  const params = await searchParams;
  const type = params.type || undefined;
  const before = params.before ? Number(params.before) : undefined;
  const { rows, nextCursor, availableTypes } = await loadActivityLog({ type, before });

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8">
      <PageHeader
        title="Activity Log"
        description="Who changed what, and when. Every entry is written at the moment the change is saved, and can't be edited afterwards."
      />

      {availableTypes.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-5">
          <FilterChip href="/activity" active={!type} label="Everything" />
          {availableTypes.map((t) => (
            <FilterChip
              key={t.type}
              href={`/activity?type=${encodeURIComponent(t.type)}`}
              active={type === t.type}
              label={`${describeType(t.type).label} · ${t.count}`}
            />
          ))}
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState
          message={
            type
              ? "Nothing logged of that kind yet."
              : "Nothing logged yet. Entries appear here as people finalize days and edit closed records."
          }
          action={type ? <LinkButton href="/activity" variant="secondary" size="sm">Show everything</LinkButton> : undefined}
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((row) => {
            const { group, label } = describeType(row.type);
            const day = row.at.slice(0, 10);
            const time = row.at.slice(11, 16);
            return (
              <li key={row.id}>
                <Card className="!p-4">
                  <div className="flex flex-wrap items-center gap-2 mb-1.5">
                    <Badge tone="primary">{group}</Badge>
                    <span className="text-xs font-medium text-[var(--ink-700)]">{label}</span>
                    <span className="text-xs text-[var(--ink-500)] ml-auto">
                      <DayLabel iso={day} />
                      {time && <span className="tabular-nums"> {time}</span>}
                    </span>
                  </div>
                  <p className="text-sm text-[var(--ink-900)]">{row.summary}</p>
                  <p className="text-xs text-[var(--ink-500)] mt-1">by {row.actorName}</p>
                  {row.detail && <DetailDisclosure detail={row.detail} />}
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {nextCursor && (
        <div className="mt-5">
          <LinkButton
            href={`/activity?${type ? `type=${encodeURIComponent(type)}&` : ""}before=${nextCursor}`}
            variant="secondary"
          >
            Show older
          </LinkButton>
        </div>
      )}

      {before && (
        <p className="text-xs text-[var(--ink-500)] mt-3">
          <Link href={type ? `/activity?type=${encodeURIComponent(type)}` : "/activity"} className="underline">
            Back to the newest entries
          </Link>
        </p>
      )}
    </main>
  );
}

function FilterChip({ href, active, label }: { href: string; active: boolean; label: string }) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={
        "inline-flex items-center min-h-9 px-3 rounded-[var(--radius-full)] text-xs font-medium transition-colors " +
        (active
          ? "bg-[var(--primary)] text-white"
          : "bg-[var(--card)] text-[var(--ink-700)] border border-[var(--border)] hover:bg-[var(--hover)]")
      }
    >
      {label}
    </Link>
  );
}
