import { loadRestaurantSettings, loadRecoveryCodeStatus } from "@/lib/settings/loadRestaurantSettings";
import { loadPackerBonusConfig } from "@/lib/settings/packerBonus";
import { db } from "@/db/client";
import { positions } from "@/db/schema";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { Banner } from "@/components/ui/Banner";
import { SettingsForm } from "./SettingsForm";
import { RecoveryCodeSection } from "./RecoveryCodeSection";

/**
 * Permission System Phase C (2026-08-21) — two capabilities, one page,
 * matching what the capability registry already promised in
 * VIEW_SETTINGS's own description: "Partner sees them read-only
 * (visible-but-disabled) unless also granted Edit Settings."
 *
 * VIEW_SETTINGS opens the page. Without EDIT_SETTINGS the whole form is
 * wrapped in a disabled <fieldset>, which per the HTML spec disables
 * every form control descended from it — including the submit button —
 * without touching SettingsForm itself. Deliberately done here rather
 * than by threading a `readOnly` prop through that client component: the
 * form has ~15 controls across 6 fieldsets, and one wrapper cannot miss
 * one the way a hand-edited prop pass can.
 *
 * This is defense in depth, not the actual protection: updateRestaurantSettings
 * has been gated on EDIT_SETTINGS server-side since Phase B, so a
 * hand-crafted POST was already refused. What this adds is honesty in the
 * UI — a Partner accountable for these settings can read exactly how the
 * restaurant is configured without being shown controls that would fail
 * on submit.
 */
export default async function SettingsPage() {
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_SETTINGS")) return <NoAccess pageLabel="Settings" />;
  const canEdit = viewer.has("EDIT_SETTINGS");

  const [settings, recoveryStatus, packerBonus, allPositions] = await Promise.all([
    loadRestaurantSettings(),
    loadRecoveryCodeStatus(),
    loadPackerBonusConfig(),
    db.select().from(positions),
  ]);
  const activePositions = allPositions
    .filter((p) => p.active)
    .map((p) => ({ id: p.id, name: p.name, category: p.category as "FOH" | "BOH" }))
    .sort((a, b) => (a.category === b.category ? a.name.localeCompare(b.name) : a.category === "FOH" ? -1 : 1));
  const viewerIsAdmin = viewer.isAdmin;

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Settings</h1>
      <p className="text-[var(--ink-500)] text-sm mb-6">Restaurant-wide configuration for tips, pools, and roster visibility.</p>
      {!canEdit && (
        <div className="mb-6">
          <Banner
            tone="info"
            title="You can read these settings, but not change them."
            description="Everything below is shown exactly as it's set today. Ask an admin if something here needs to change."
          />
        </div>
      )}
      {viewerIsAdmin && (
        <div className="mb-8">
          <RecoveryCodeSection status={recoveryStatus} viewerIsAdmin={viewerIsAdmin} />
        </div>
      )}
      {/* min-w-0 matters: a <fieldset> carries min-inline-size:
          min-content in every UA stylesheet and Tailwind's preflight
          doesn't reset it, so without this the wrapper can be pinned
          wider than the viewport and reintroduce horizontal page scroll
          (WCAG 1.4.10) -- the same class of bug fixed on Analytics
          earlier the same day. */}
      <fieldset disabled={!canEdit} className="border-0 p-0 m-0 min-w-0">
        <SettingsForm settings={settings} packerBonus={packerBonus} positions={activePositions} isAdmin={viewerIsAdmin} />
      </fieldset>
      {/* Repeated at the bottom on purpose (2026-08-22 visual-audit
          finding). The banner above sits at the top of a ~2,000px form;
          on a phone that is roughly 2.3 screens above the disabled "Save
          settings" button, so by the time someone reaches the one control
          that looks like it should work, the explanation is long out of
          view. Rendered here rather than inside SettingsForm so the
          read-only state stays owned by this page alone — no prop to
          thread, nothing that can disagree with the fieldset. */}
      {!canEdit && (
        <p className="mt-3 text-sm text-[var(--ink-500)]">
          Saving is turned off for your account — ask an admin if something here needs to change.
        </p>
      )}
    </main>
  );
}
