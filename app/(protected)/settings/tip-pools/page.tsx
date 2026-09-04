import Link from "next/link";
import { loadPositionsList } from "@/lib/positions/loadPositionsList";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { PoolBoard } from "./PoolBoard";
import { PageHeader } from "@/components/ui/Card";
import { Banner } from "@/components/ui/Banner";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Tip Pool Assignment (2026-08-17) — its own Settings section, split off
 * the main /settings page. A second way to edit the SAME positionTipPools
 * data the Positions page's per-position checkboxes write (not a fork —
 * both read/write the one table), plus the pool split-method setting,
 * which used to live on the main Settings page and now lives ONLY here.
 * See project_atlas_pool_assignment_ui memory for the design conversation
 * (a position can be in 0-3 pools at once, e.g. Host is in both Pool 1
 * and Pool 2, so this is a toggle board, not a "move between slots" UI).
 *
 * Restyled onto design-system-v2 2026-08-19 -- pure visual retrofit, see
 * PoolBoard.tsx for the bulk of the change (this file only swaps the raw
 * h1/p heading for PageHeader, matching the Ledger/Vendors back-link +
 * PageHeader pattern). */
export default async function TipPoolsSettingsPage() {
  // Permission System Phase C (2026-08-21) -- same VIEW_SETTINGS /
  // EDIT_SETTINGS pair as the main Settings page, since this IS a
  // Settings section (it was split off that page, not built separately).
  // PoolBoard takes readOnly itself rather than being wrapped in a
  // disabled <fieldset> -- see its own doc comment: a fieldset can't
  // reach the drag-and-drop handlers (plain divs), and would wrongly
  // disable the view-only filter buttons. Server-side, both tip-pool
  // actions are already gated on TIP_POOL_STRUCTURE_EDIT (Phase B);
  // this is about not offering controls that would fail.
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("VIEW_SETTINGS")) return <NoAccess pageLabel="Settings" />;
  const canEdit = viewer.has("EDIT_SETTINGS");

  const [positions, settings] = await Promise.all([loadPositionsList(), loadRestaurantSettings()]);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8">
      <Link href="/settings" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        ← Settings
      </Link>
      <PageHeader
        title="Tip Pool Assignment"
        description="Which positions belong to each tip pool, and how each pool splits. This writes the same data as each position's own edit page — use whichever view is easier for what you're doing."
      />

      {!canEdit && (
        <div className="mb-6">
          <Banner
            tone="info"
            title="You can read this, but not change it."
            description="This shows which positions are in each pool today. Ask an admin if it needs to change."
          />
        </div>
      )}

      <PoolBoard
        readOnly={!canEdit}
        positions={positions}
        splitMethods={{
          POOL_1_DINE_IN: settings.pool1SplitMethod,
          POOL_2_TAKEOUT_ONLINE: settings.pool2SplitMethod,
          POOL_3_DELIVERY: settings.pool3SplitMethod,
        }}
      />
    </main>
  );
}
