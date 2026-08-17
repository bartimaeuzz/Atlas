import Link from "next/link";
import { loadPositionsList } from "@/lib/positions/loadPositionsList";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { PoolBoard } from "./PoolBoard";

/** Tip Pool Assignment (2026-08-17) — its own Settings section, split off
 * the main /settings page. A second way to edit the SAME positionTipPools
 * data the Positions page's per-position checkboxes write (not a fork —
 * both read/write the one table), plus the pool split-method setting,
 * which used to live on the main Settings page and now lives ONLY here.
 * See project_atlas_pool_assignment_ui memory for the design conversation
 * (a position can be in 0-3 pools at once, e.g. Host is in both Pool 1
 * and Pool 2, so this is a toggle board, not a "move between slots" UI). */
export default async function TipPoolsSettingsPage() {
  const [positions, settings] = await Promise.all([loadPositionsList(), loadRestaurantSettings()]);

  return (
    <main className="max-w-5xl mx-auto p-4 sm:p-8 font-sans">
      <Link href="/settings" className="text-xs text-neutral-500 hover:text-black">
        ← Settings
      </Link>
      <h1 className="text-2xl font-semibold mb-1 mt-1">Tip Pool Assignment</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Which positions belong to each tip pool, and how each pool splits. This writes the same data as each
        position&apos;s own edit page — use whichever view is easier for what you&apos;re doing.
      </p>

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
