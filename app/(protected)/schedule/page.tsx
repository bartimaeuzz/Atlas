import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { requireManager } from "@/lib/auth/guard";
import { loadUnseenLeaveRequestCount } from "@/lib/schedule/loadLeaveRequests";
import { loadUnseenSwapCount } from "@/lib/schedule/loadSwapRequests";
import { PageHeader, Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";

const iconProps = {
  width: 22,
  height: 22,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.75,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function CalendarIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 2v4M16 2v4" />
    </svg>
  );
}
function ClockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}
function SwapIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <path d="M17 3l4 4-4 4" />
      <path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <path d="M7 21l-4-4 4-4" />
      <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </svg>
  );
}
function GridIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}
function UserIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
    </svg>
  );
}
function TargetIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}
function TemplateIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg {...iconProps} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M7 9h10M7 13h6M7 17h3" />
    </svg>
  );
}

/** Landing page for the Schedule Planner. Restyled onto the design system
 * 2026-08-18 (Schedule Planner retrofit pass) -- also fixes a real gap
 * flagged in the 2026-08-15 accessibility audit (flag 3): the six links
 * used to be identical-sized cards with no hierarchy, a real hesitation
 * risk for a low-computer-literacy manager. Now tiered by how the whole
 * feature is actually used:
 *   1. Weekly plan -- the thing done every single week -- gets its own
 *      full-width, visually primary card up top.
 *   2. "This week" -- Leave requests / Shift swaps -- need-attention
 *      inboxes, shown as a pair with their unseen-count badges.
 *   3. "Zoom views" -- Month/Person/Weeks -- read-only lookups.
 *   4. "Set up once" -- Staffing targets / Template assignments --
 *      configured rarely, visually demoted (smaller, muted) so a manager
 *      doesn't mistake these for something to touch weekly. */
export default async function SchedulePage() {
  const session = await requireManager();
  const today = businessTodayIso();
  const [unseenLeaveCount, unseenSwapCount] = await Promise.all([
    loadUnseenLeaveRequestCount(session.id, today),
    loadUnseenSwapCount(session.id, today),
  ]);

  return (
    <main className="max-w-3xl mx-auto p-6 sm:p-8">
      <PageHeader
        title="Schedule Planner"
        description="Plan a week's schedule from your recurring templates, adjust it, and publish it."
      />

      <Link
        href="/schedule/plan"
        className="flex items-center gap-4 rounded-[var(--radius-lg)] border border-[var(--primary-border)] bg-[var(--primary-tint)] p-5 mb-6 transition-colors hover:border-[var(--primary)]"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--primary)] text-white">
          <CalendarIcon />
        </span>
        <span>
          <span className="block text-[17px] font-bold text-[var(--ink-900)]">Weekly plan</span>
          <span className="block text-sm text-[var(--ink-700)]">
            Build, publish, and adjust this week&apos;s schedule -- start here.
          </span>
        </span>
      </Link>

      <p className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-2">This week</p>
      <div className="grid sm:grid-cols-2 gap-3 mb-6">
        <HubTile
          href="/schedule/leave"
          icon={<ClockIcon />}
          label="Leave requests"
          description="Upcoming leave staff have logged themselves."
          count={unseenLeaveCount}
        />
        <HubTile
          href="/schedule/swaps"
          icon={<SwapIcon />}
          label="Shift swaps"
          description="Swap requests between staff for upcoming shifts."
          count={unseenSwapCount}
        />
      </div>

      <p className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-2">Zoom views</p>
      <div className="grid sm:grid-cols-3 gap-3 mb-6">
        <HubTile href="/schedule/plan/month" icon={<GridIcon />} label="Month overview" description="See the whole month at a glance." />
        <HubTile href="/schedule/plan/person" icon={<UserIcon />} label="Person schedule" description="One person's shifts across a month." />
        <HubTile href="/schedule/weeks" icon={<CalendarIcon />} label="Weeks" description="Every week's status, for quick navigation." />
      </div>

      <p className="text-xs font-semibold text-[var(--ink-500)] uppercase tracking-wide mb-2">Set up once</p>
      <div className="grid sm:grid-cols-2 gap-3">
        <HubTile
          href="/schedule/targets"
          icon={<TargetIcon />}
          label="Staffing targets"
          description="How many of each position you need, by day and period."
          muted
        />
        <HubTile
          href="/schedule/templates"
          icon={<TemplateIcon />}
          label="Template assignments"
          description="The recurring baseline a week's plan is built from."
          muted
        />
      </div>
    </main>
  );
}

function HubTile({
  href,
  icon,
  label,
  description,
  count,
  muted,
}: {
  href: string;
  icon: React.ReactNode;
  label: string;
  description: string;
  count?: number;
  muted?: boolean;
}) {
  return (
    <Link href={href}>
      <Card className={"h-full transition-colors hover:border-[var(--border-strong)]" + (muted ? " bg-[var(--paper)]" : "")}>
        <div className="flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--radius-md)] bg-[var(--paper)] text-[var(--ink-700)]">
            {icon}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-[var(--ink-900)]">{label}</span>
              {!!count && count > 0 && <Badge tone="danger">{count > 9 ? "9+" : count}</Badge>}
            </div>
            <p className="text-xs text-[var(--ink-500)] mt-0.5">{description}</p>
          </div>
        </div>
      </Card>
    </Link>
  );
}
