import { and, eq, inArray, lt, isNotNull } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments } from "@/db/schema";

/** Closes swap requests whose shift has already happened (2026-09-03,
 * Oliver: "the swap request that has been overdue should be expired
 * stage").
 *
 * A request whose shift date has passed is not a request any more, it is
 * history. Leaving it live was not merely untidy: lib/schedule/swapDetach.ts
 * treats open/pending swaps as UNRESOLVED and blocks deleting the planned
 * week they point at, so dead requests jammed an unrelated admin action.
 * Production had four of them, the oldest fifteen days old.
 *
 * Two terminal states, because the two cases are not the same fact:
 *
 *   open -> unclaimed
 *     Nobody ever took it. Nothing happened, nobody is owed anything.
 *
 *   pending_manager_approval -> unresolved
 *     Somebody DID take it and no manager ever decided, so the swap never
 *     completed and the assignment never moved. Who actually worked that
 *     shift is a question this function must not answer: the finalized
 *     roster and closing report are the truth for a past shift, not a
 *     planning row. It is closed as "unresolved" and says to read the
 *     roster. No new row can ever land in this state -- the approval gate
 *     was deleted the same day -- so this branch exists for the legacy
 *     rows only.
 *
 * There is no cron in Atlas, so this is called from the places that care:
 * the manager's swaps page and the staff swap panel. It is idempotent and
 * writes nothing when there is nothing stale, which is the normal case. */
export async function expireStaleSwaps(todayIso: string): Promise<void> {
  const stale = await db
    .select({ id: swapRequests.id, status: swapRequests.status })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .where(
      and(
        inArray(swapRequests.status, ["open", "pending_manager_approval"]),
        lt(plannedShiftAssignments.date, todayIso)
      )
    );

  // A DETACHED request (assignmentId nulled when its schedule was
  // deleted) cannot be reached by the join above, and its date lives in
  // the snapshot column instead. Only resolved swaps are ever detached,
  // so in practice this finds nothing -- it is here so the sweep cannot
  // silently miss a row if that invariant ever changes.
  const staleDetached = await db
    .select({ id: swapRequests.id, status: swapRequests.status })
    .from(swapRequests)
    .where(
      and(
        inArray(swapRequests.status, ["open", "pending_manager_approval"]),
        isNotNull(swapRequests.detachedShiftDate),
        lt(swapRequests.detachedShiftDate, todayIso)
      )
    );

  const seen = new Set<number>();
  const unclaimed: number[] = [];
  const unresolved: number[] = [];
  for (const row of [...stale, ...staleDetached]) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    if (row.status === "open") unclaimed.push(row.id);
    else unresolved.push(row.id);
  }

  if (unclaimed.length === 0 && unresolved.length === 0) return;

  const writes = [];
  if (unclaimed.length > 0) {
    writes.push(db.update(swapRequests).set({ status: "unclaimed" }).where(inArray(swapRequests.id, unclaimed)));
  }
  if (unresolved.length > 0) {
    writes.push(db.update(swapRequests).set({ status: "unresolved" }).where(inArray(swapRequests.id, unresolved)));
  }
  // Deliberately NOT revalidatePath()-ing: this runs inside page loaders,
  // and revalidating during a render is not allowed.
  if (writes.length === 2) await db.batch([writes[0], writes[1]]);
  else await writes[0];
}
