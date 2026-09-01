import Link from "next/link";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadPettyCashDay } from "@/lib/ledger/loadPettyCashDay";
import { loadVendorCategoryLinks } from "@/lib/ledger/loadVendorCategoryLinks";
import { serializeVendorCategoryLinks } from "@/lib/ledger/vendorCategoryLinks";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { addDays } from "@/lib/schedule/weekMath";
import { AddEntryForm } from "../AddEntryForm";
import { EntriesList } from "../EntriesList";
import { CashStep } from "./CashStep";
import { FinalizeStep } from "./FinalizeStep";
import { NoExpensesButton } from "./NoExpensesButton";
import { NextButton } from "./NextButton";
import { StepNav, StepHeading } from "./StepNav";
import { Badge, Banner, DayLabel, LinkButton } from "@/components/ui";
import { formatMoney } from "../formatMoney";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";

/** The day-level Petty Cash work, rebuilt 2026-08-22 as a three-step
 * checkout flow after Oliver tested the old single-page version himself.
 *
 * ONE LAYOUT, TWO SHAPES, NO JAVASCRIPT DECIDING WHICH. All three sections
 * render on every request. On phone only the active step is visible; on
 * desktop all three stack down one page with numbered headings and no
 * breadcrumb, because the whole form already fits one screen there and
 * splitting it would only add clicks (Oliver's call). The switch is the
 * `hidden lg:block` on each inactive section — a CSS breakpoint, not a
 * client-side branch, so there is no hydration flash and the desktop page
 * works identically with JavaScript still loading.
 *
 * `lg` and not `sm`: the nav rail eats 216px, so a 640px "desktop" leaves a
 * 360px column — see components/ui/Table.tsx for the measurement.
 *
 * Two rules carried over unchanged from the 2026-08-14 restructure:
 * 1. A future day can't be worked on at all. Enforced here AND in
 *    lib/actions/ledger.ts (the actions are the real guard).
 * 2. A finalized day is locked, except for an ADMIN — who now lands on
 *    step 3 with everything unlocked, since an admin is correcting a known
 *    number rather than walking the day again, and every edit they make is
 *    written to the activity log.
 */
export default async function LedgerDayPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; step?: string; seen?: string }>;
}) {
  if (!(await hasCapability("VIEW_LEDGER_OVERVIEW"))) return <NoAccess pageLabel="the Ledger" />;

  const params = await searchParams;
  const todayIso = businessTodayIso();
  const date = params.date || todayIso;
  const monthOfDate = date.slice(0, 7);
  const isFuture = date > todayIso;

  if (isFuture) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8">
        <BackLink month={monthOfDate} />
        <h1 className="text-2xl font-bold text-[var(--ink-900)] mt-2 mb-4">
          <DayLabel iso={date} />
        </h1>
        <Banner
          tone="info"
          title="This day hasn't happened yet"
          description={`Come back on ${date} to log petty cash and reconcile the drawer.`}
        />
      </main>
    );
  }

  const session = await getCurrentStaffSession();
  const isAdmin = session?.systemRole === "ADMIN";

  const [data, categoryLinks] = await Promise.all([loadPettyCashDay(date), loadVendorCategoryLinks()]);
  // Which vendors this restaurant actually uses per category, learned
  // from its own history — shrinks the vendor dropdown to the ones that
  // belong with the category being logged (2026-08-31).
  const links = serializeVendorCategoryLinks(categoryLinks);
  const finalized = data.status === "finalized";
  const editable = !finalized || isAdmin;

  // An admin opening a closed day lands on the summary with every step
  // already unlocked — they came to correct a number, not to re-walk the
  // day. Everyone else starts at step 1 on a fresh visit.
  const adminOnFinalized = finalized && isAdmin;
  const rawStep = Number(params.step);
  const step = [1, 2, 3].includes(rawStep) ? rawStep : adminOnFinalized ? 3 : 1;
  const rawSeen = Number(params.seen);
  const seen = Math.max(Number.isFinite(rawSeen) ? rawSeen : 1, step, adminOnFinalized ? 3 : 1);

  const onStep = (n: number) => (n === step ? "" : "hidden lg:block");

  return (
    <main className="max-w-lg lg:max-w-5xl mx-auto p-4 sm:p-8">
      <BackLink month={monthOfDate} />

      <div className="flex items-center justify-between gap-3 mb-1 mt-2">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">
          <DayLabel iso={date} />
        </h1>
        <Badge tone={finalized ? "success" : "neutral"}>{finalized ? "Finalized" : "Draft"}</Badge>
      </div>

      <div className="flex items-center gap-1 text-sm mb-4">
        <Link
          href={`/ledger/day?date=${addDays(date, -1)}`}
          aria-label="Previous day"
          className="inline-flex items-center justify-center min-w-11 min-h-11 text-[var(--ink-500)] hover:text-[var(--ink-900)]"
        >
          ←
        </Link>
        <span className="text-[var(--ink-500)]">Petty cash{date === todayIso ? " · today" : ""}</span>
        <Link
          href={`/ledger/day?date=${addDays(date, 1)}`}
          aria-label="Next day"
          className="inline-flex items-center justify-center min-w-11 min-h-11 text-[var(--ink-500)] hover:text-[var(--ink-900)]"
        >
          →
        </Link>
      </div>

      {adminOnFinalized && (
        <div className="mb-4">
          <Banner
            tone="warning"
            title="Editing a finalized day"
            description="Changes save straight away without reopening the day, and every one is recorded in the activity log."
          />
        </div>
      )}

      <StepNav date={date} step={step} seen={seen} />

      <div className="lg:grid lg:grid-cols-[1fr_320px] lg:gap-8 lg:items-start">
        <div>
          {/* ---- Step 1 · Expenses ---- */}
          <section className={onStep(1)}>
            <StepHeading n={1}>Add an expense</StepHeading>
            {editable ? (
              <AddEntryForm key={data.entries.length} date={date} vendors={data.vendors} categories={data.categories} links={links} />
            ) : (
              <Banner tone="info" title="This day is finalized." description="Its expenses can no longer be changed." />
            )}

            <StepHeading n={1}>
              {data.entries.length === 0
                ? "Logged today"
                : `Logged today · ${data.entries.length}`}
            </StepHeading>
            <EntriesList
              entries={data.entries}
              date={date}
              locked={!editable}
              vendors={data.vendors}
              categories={data.categories}
            />
            {data.entries.length > 0 && (
              <div className="flex justify-between px-3 py-2.5 bg-[var(--paper)] border border-[var(--border-strong)] rounded-[var(--radius-lg)] font-semibold text-[var(--ink-900)] mb-3">
                <span>Paid out today</span>
                <span className="tabular-nums">{formatMoney(data.totalPettyCashOut)}</span>
              </div>
            )}

            <div className="flex flex-col gap-2 lg:hidden">
              <NextButton date={date} seen={seen} label="Next: count the cash" />
              {data.entries.length === 0 && editable && <NoExpensesButton date={date} seen={seen} />}
            </div>
          </section>

          {/* ---- Step 2 · Cash ---- */}
          <section className={onStep(2)}>
            <StepHeading n={2}>Cash in the drawer</StepHeading>
            <CashStep data={data} seen={seen} locked={!editable} />
          </section>
        </div>

        {/* ---- Step 3 · Finalize ----
             On desktop this is the sticky right-hand column, so the summary
             updates beside the form instead of making anyone scroll to it. */}
        <section className={onStep(3) + " lg:sticky lg:top-6"}>
          <StepHeading n={3}>Finalize</StepHeading>
          <FinalizeStep data={data} seen={seen} locked={!editable} />
        </section>
      </div>
    </main>
  );
}

function BackLink({ month }: { month: string }) {
  return (
    <LinkButton href={`/ledger?month=${month}`} variant="ghost" size="sm">
      ← Back to {month}
    </LinkButton>
  );
}
