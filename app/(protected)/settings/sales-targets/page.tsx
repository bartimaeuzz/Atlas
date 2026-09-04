import Link from "next/link";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { Banner } from "@/components/ui/Banner";
import { loadSalesTargetsForEditing } from "@/lib/analytics/loadSalesTargets";
import { SalesTargetsForm } from "./SalesTargetsForm";

/**
 * Where the sales targets from the partners' meeting get typed
 * (2026-09-04, Oliver: "the target will come from the meeting").
 *
 * Its own page rather than another fieldset on /settings. That form is
 * already ~2,000px of restaurant-wide switches with one save button at the
 * bottom; seven weekday boxes plus a growing list of dated exceptions
 * belongs beside neither, and the exceptions list needs its own add and
 * remove buttons, which a single-submit form cannot host honestly.
 *
 * Same two capabilities as /settings itself, for the same reason:
 * VIEW_SETTINGS opens it, EDIT_SETTINGS is required to change anything,
 * and the read-only state is a disabled <fieldset> around the whole form
 * rather than a prop threaded past every control. The server actions are
 * gated on EDIT_SETTINGS independently — this is the honest UI, not the
 * protection.
 */
export default async function SalesTargetsPage() {
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_SETTINGS")) return <NoAccess pageLabel="Sales targets" />;
  const canEdit = viewer.has("EDIT_SETTINGS");

  const targets = await loadSalesTargetsForEditing();

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/settings" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        &larr; Settings
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Sales targets</h1>
      <p className="text-[var(--ink-500)] text-sm mb-6">
        What you aim to take in a day, before tax and not counting tips — the same figure the
        schedule and the closing report compare each closed day against. Set one for each day of
        the week, and add a separate number for a date that is not a normal day. Leave a day blank
        and it simply has no target.
      </p>

      {!canEdit && (
        <div className="mb-6">
          <Banner
            tone="info"
            title="You can read these targets, but not change them."
            description="Everything below is shown exactly as it is set today. Ask an admin if a number here needs to change."
          />
        </div>
      )}

      {/* min-w-0: a <fieldset> carries min-inline-size: min-content in
          every UA stylesheet and Tailwind's preflight does not reset it,
          so without this the wrapper can be pinned wider than the viewport
          and reintroduce horizontal page scroll (WCAG 1.4.10) — the same
          class of bug already fixed on Analytics and /settings. */}
      <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
        <SalesTargetsForm weekday={targets.weekday} dates={targets.dates} />
      </fieldset>

      {!canEdit && (
        <p className="mt-3 text-sm text-[var(--ink-500)]">
          Saving is turned off for your account — ask an admin if something here needs to change.
        </p>
      )}
    </main>
  );
}
