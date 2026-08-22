import Link from "next/link";
import { loadShiftsList } from "@/lib/shift/loadShiftsList";
import { PageHeader, EmptyState } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { StatusBadge } from "@/components/ui/Badge";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

export default async function ShiftsListPage() {
  // Phase C (2026-08-21): Settings is behind VIEW_SETTINGS, which
  // defaults to Admin+Partner -- so this shortcut would dead-end for
  // every Floor/Assistant Manager, on the page they use most. Hidden
  // rather than left to fail.
  const [shifts, canSeeSettings] = await Promise.all([loadShiftsList(), hasCapability("VIEW_SETTINGS")]);

  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
      <PageHeader
        title="Shifts"
        actions={
          <>
            {canSeeSettings && (
              <LinkButton href="/settings" variant="secondary" size="sm">
                Settings
              </LinkButton>
            )}
            <LinkButton href="/positions" variant="secondary" size="sm">
              Positions
            </LinkButton>
            <LinkButton href="/shifts/new" size="sm">
              + New shift
            </LinkButton>
          </>
        }
      />

      {shifts.length === 0 ? (
        <EmptyState message="No shifts yet." action={<LinkButton href="/shifts/new" size="sm">+ New shift</LinkButton>} />
      ) : (
        <>
          {/* Phone: stacked cards — the standard for all dense data on small
           * screens (2026-08-16 design-system decision), not a scrolling
           * table. */}
          <div className="lg:hidden space-y-2">
            {shifts.map((s) => (
              <Link
                key={s.id}
                href={s.status === "finalized" ? `/shifts/${s.id}/summary` : `/shifts/${s.id}/roster`}
                className="block bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4"
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-[var(--ink-900)]">{s.date}</span>
                  <StatusBadge status={s.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--ink-500)]">{s.period}</span>
                  <span className="text-sm text-[var(--primary)] font-medium">
                    {s.status === "finalized" ? "View summary →" : "Continue →"}
                  </span>
                </div>
              </Link>
            ))}
          </div>

          {/* Desktop: table */}
          <table className="hidden lg:table w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
                <th className="py-2.5 font-medium">Date</th>
                <th className="py-2.5 font-medium">Period</th>
                <th className="py-2.5 font-medium">Status</th>
                <th className="py-2.5"></th>
              </tr>
            </thead>
            <tbody>
              {shifts.map((s) => (
                <tr key={s.id} className="border-b border-[var(--border)]">
                  <td className="py-3 text-[var(--ink-900)]">{s.date}</td>
                  <td className="py-3 text-[var(--ink-700)]">{s.period}</td>
                  <td className="py-3">
                    <StatusBadge status={s.status} />
                  </td>
                  <td className="py-3 text-right">
                    {s.status === "finalized" ? (
                      <Link href={`/shifts/${s.id}/summary`} className="text-[var(--primary)] font-medium hover:underline">
                        View summary →
                      </Link>
                    ) : (
                      <Link href={`/shifts/${s.id}/roster`} className="text-[var(--primary)] font-medium hover:underline">
                        Continue →
                      </Link>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </main>
  );
}
