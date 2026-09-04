/**
 * The one way a schedule screen asks for its labor figures (2026-09-04).
 * Wraps the permission check and the settings read together so three
 * pages cannot each remember the gate slightly differently — the failure
 * shape rule #9 exists for: a per-page check looks thorough and is blind
 * to the page nobody updated.
 *
 * TWO capabilities, mirroring exactly how the Analytics page already
 * splits the same material — a ratio is cost control, a dollar figure is
 * the bottom line:
 *
 *   VIEW_ANALYTICS -> the labor PERCENTAGE. Identical in kind to
 *     loadPnL.ts's laborCostPct KPI card, which this capability already
 *     grants, so showing it on the schedule moves nothing.
 *
 *   VIEW_PNL -> the day's NET SALES in dollars. Analytics deliberately
 *     withholds revenue dollars at the VIEW_ANALYTICS tier
 *     (`showAmounts={canSeePnL}` on the Revenue-by-channel chart, item (3)
 *     of that page's capability block): revenue times the prime-cost ratio
 *     — which stays visible — reconstructs the bottom line. Seven daily
 *     sales figures sum to the same week of revenue, so putting dollars on
 *     the schedule at the lower tier would reopen precisely the hole the
 *     2026-08-30 pass closed. The percentage is unaffected and still shows.
 *
 * Neither is ungated. A person with schedule access and no analytics
 * capability sees the grid exactly as it was before this feature.
 *
 * SALES TARGETS ride the VIEW_PNL half (2026-09-04). A target and the
 * difference from it are dollar figures about revenue, so they belong on
 * exactly the side of that line the day's net sales already sits on —
 * anything else would hand a VIEW_ANALYTICS-only viewer the revenue plan
 * the same reasoning above withholds. `salesTargets` is therefore null
 * whenever `showAmounts` is false, and the grid renders no target line.
 */
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { restaurantSettings } from "@/db/schema";
import { loadDailyLabor } from "@/lib/analytics/loadDailyLabor";
import { loadSalesTargets } from "@/lib/analytics/loadSalesTargets";
import type { DailyLaborByDate } from "@/lib/analytics/laborTarget";
import type { SalesTargets } from "@/lib/analytics/salesTarget";

export interface ScheduleLabor {
  /** undefined when the viewer may not see money — the grid then renders
   * exactly as it did before this feature existed. */
  dailyLabor?: DailyLaborByDate;
  laborTargetPct: number | null;
  /** Whether the dollar figure may be shown alongside the percentage.
   * False for a VIEW_ANALYTICS-only viewer — see the note above. */
  showAmounts: boolean;
  /** Null when the viewer may not see dollar figures, or when nobody has
   * set any target at all. */
  salesTargets: SalesTargets | null;
}

export async function loadScheduleLabor(dateFrom: string, dateTo: string): Promise<ScheduleLabor> {
  // getViewerCapabilities is React-cached per request, so asking twice
  // costs one lookup.
  const [canSeeRatios, canSeeAmounts] = await Promise.all([
    hasCapability("VIEW_ANALYTICS"),
    hasCapability("VIEW_PNL"),
  ]);
  if (!canSeeRatios) return { laborTargetPct: null, showAmounts: false, salesTargets: null };

  const [settingsRow, dailyLabor, salesTargets] = await Promise.all([
    db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1)),
    loadDailyLabor(dateFrom, dateTo),
    canSeeAmounts ? loadSalesTargets() : Promise.resolve(null),
  ]);

  return {
    dailyLabor,
    laborTargetPct: settingsRow[0]?.laborCostTargetPct ?? null,
    showAmounts: canSeeAmounts,
    salesTargets,
  };
}
