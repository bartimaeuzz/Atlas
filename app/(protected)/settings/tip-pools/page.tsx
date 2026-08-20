import Link from "next/link";
import { loadPositionsList } from "@/lib/positions/loadPositionsList";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { PoolBoard } from "./PoolBoard";
import { PageHeader } from "@/components/ui/Card";

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
  const [positions, settings] = await Promise.all([loadPositionsList(), loadRestaurantSettings()]);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8">
      <Link href="/settings" className="text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)]">
        ← Settings
      </Link>
      <PageHeader
        title="Tip Pool Assignment"
        description="Which positions belong to each tip pool, and how each pool splits. This writes the same data as each position's own edit page — use whichever view is easier for what you're doing."
      />

      <PoolBoard
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
