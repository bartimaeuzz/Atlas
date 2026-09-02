/**
 * My Pay "inputs" rows (2026-09-01, backlog round 4 item 3): show a person
 * not just their payout but where it came from — the size of each pool
 * they were in and their slice of it.
 *
 * Derived from the LOCKED employee_payouts rows only, never recomputed
 * from today's roster/settings: a pool's total is the sum of every
 * member's share, which is exactly what the finalize step distributed
 * (splitByPointsExact hands out the pool to the cent; verified on all 29
 * finalized prod shifts, Σ pool1_share == net_general_cc_tip). Re-running
 * the calculation at read time could drift from the locked record when a
 * point value or setting changes later — the class of bug rule 6 exists
 * for. The one input this cannot recover is the pool's total POINTS,
 * which finalize does not persist; that row waits for a stored field.
 *
 * Visibility (scrutinize 2026-09-01): a pool total is the sum of exactly
 * the figures the peer-tip settings may hide, so it is decided PER POOL
 * from the pool's MEMBERS — every other contributor's side of the house
 * must have peer tips visible and none may sit in an earnings-hidden
 * position. Keying on the viewer's own category instead would let a Host
 * recover two Packers' hidden tips by subtraction. Managers bypass.
 */

import { round2 } from "@/lib/calc/tipPool";
import { formatShare } from "@/lib/analytics/formatShare";

export interface PoolContributor {
  employeeId: number;
  pool1Share: number;
  pool2Share: number;
  pool3Share: number;
  positionCategory: "FOH" | "BOH";
  earningsHiddenFromStaff: boolean;
}

export interface PoolVisibility {
  /** True when the viewer sees every member's money regardless of settings. */
  seesEverything: boolean;
  showPeerTipFOH: boolean;
  showPeerTipBOH: boolean;
}

/** Per pool: the total when the viewer may see it, else null. */
export interface PoolTotals {
  pool1Total: number | null;
  pool2Total: number | null;
  pool3Total: number | null;
}

const POOLS = ["pool1Share", "pool2Share", "pool3Share"] as const;

export function poolTotalsFor(viewerEmployeeId: number, rows: PoolContributor[], vis: PoolVisibility): PoolTotals {
  const totals = POOLS.map((key) => {
    const members = rows.filter((r) => r[key] > 0);
    if (members.length === 0) return null;
    const othersVisible =
      vis.seesEverything ||
      members
        .filter((m) => m.employeeId !== viewerEmployeeId)
        .every((m) => !m.earningsHiddenFromStaff && (m.positionCategory === "FOH" ? vis.showPeerTipFOH : vis.showPeerTipBOH));
    if (!othersVisible) return null;
    return round2(members.reduce((a, m) => a + m[key], 0));
  });
  return { pool1Total: totals[0], pool2Total: totals[1], pool3Total: totals[2] };
}

/** "10.5%", "<0.1%" for a real-but-tiny slice (never "0.0%" beside real
 * dollars — same rule as the P&L, 5afe702), null when the pool is empty. */
export function formatSlice(share: number, total: number): string | null {
  if (total <= 0) return null;
  return formatShare(share / total);
}
