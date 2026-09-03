import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, employees, positions } from "@/db/schema";
import { formatDayLabelShort } from "@/lib/format/formatDayLabel";
import type { SwapStatus } from "@/lib/schedule/loadSwapRequests";
import { expireStaleSwaps } from "@/lib/schedule/expireStaleSwaps";
import { businessTodayIso } from "@/lib/formatDateTime";

/** What deleting a set of planned assignments means for the swap requests
 * that reference them (2026-08-30, after Aey hit a raw SQLITE_CONSTRAINT
 * trying to delete a published week).
 *
 * Two kinds of swap, two different answers:
 *
 * RESOLVED (completed / declined / cancelled) — history. Who gave up
 * which shift is a record about people, and it must survive the schedule
 * row it points at being erased. These get DETACHED: the assignment's
 * date/period/position is copied into the swap's snapshot columns and
 * the FK is nulled. Every live list screen inner-joins swap ->
 * assignment, so a detached swap drops out of views about the current
 * schedule (correct — that schedule no longer exists) while the row
 * itself stays queryable.
 *
 * UNRESOLVED (open / pending_manager_approval) — a standing promise to
 * staff: someone has asked to give up a shift, someone may already have
 * accepted and be waiting on a manager. Erasing that silently as a side
 * effect of a bulk delete would break a commitment nobody was told
 * about. These BLOCK the delete with a plain-language message naming
 * each one, so the manager resolves them deliberately on the Swaps page
 * first. Error prevention over error messages — the same reason the
 * danger zone requires a typed word instead of just a red button. */

/** Every status, classified -- a Record over the enum rather than two
 * hand-kept arrays, so adding a status FAILS THE BUILD until it is
 * classified here (2026-09-03). It was two arrays, and the three statuses
 * added that day landed in neither: such a row would have been neither
 * blocked nor detached, so its FK would still point at the assignment
 * being deleted and the manager would get the raw SQLITE_CONSTRAINT this
 * whole file exists to prevent.
 *
 *   blocks -- a live promise to a staff member. Refuse the delete and
 *     name it, so the manager resolves it deliberately.
 *   detach -- history. Keep the record, snapshot the shift onto it, null
 *     the FK, let the delete proceed. */
type SwapDisposition = "blocks" | "detach";

const DISPOSITION: Record<SwapStatus, SwapDisposition> = {
  open: "blocks",
  // Legacy: the approval gate was deleted 2026-09-03 and no new row can
  // reach this state, but one still pending on a FUTURE shift is still a
  // promise. Past-dated ones are swept to "unresolved" by the
  // expireStaleSwaps call at the top of prepareAssignmentsForDelete.
  pending_manager_approval: "blocks",
  completed: "detach",
  declined: "detach",
  cancelled: "detach",
  put_back: "detach",
  // Swept because its shift already happened -- history by definition,
  // and never a reason to block anything. This is the whole point of the
  // sweep: these used to sit as "open" forever and jam week deletion.
  unclaimed: "detach",
  unresolved: "detach",
};

interface SwapRow {
  swapId: number;
  status: SwapStatus;
  requesterName: string;
  assignmentId: number;
  date: string;
  period: string;
  positionId: number;
  positionName: string;
}

async function loadSwapRowsFor(assignmentIds: number[]): Promise<SwapRow[]> {
  if (assignmentIds.length === 0) return [];
  return db
    .select({
      swapId: swapRequests.id,
      status: swapRequests.status,
      requesterName: employees.nickname,
      assignmentId: plannedShiftAssignments.id,
      date: plannedShiftAssignments.date,
      period: plannedShiftAssignments.period,
      positionId: plannedShiftAssignments.positionId,
      positionName: positions.name,
    })
    .from(swapRequests)
    .innerJoin(plannedShiftAssignments, eq(swapRequests.assignmentId, plannedShiftAssignments.id))
    .innerJoin(employees, eq(swapRequests.requestingEmployeeId, employees.id))
    .innerJoin(positions, eq(plannedShiftAssignments.positionId, positions.id))
    .where(inArray(swapRequests.assignmentId, assignmentIds));
}

/** Plain-language reason a delete is blocked, naming every unresolved
 * swap — never a constraint error. Returns null when nothing blocks. */
export function describeBlockingSwaps(rows: SwapRow[]): string | null {
  const blocking = rows.filter((r) => DISPOSITION[r.status] === "blocks");
  if (blocking.length === 0) return null;
  const items = blocking
    .map((r) => {
      const state = r.status === "open" ? "still open" : "waiting on a manager decision";
      return `${r.requesterName}'s ${r.positionName} shift on ${formatDayLabelShort(r.date)} (${r.period}) — swap request ${state}`;
    })
    .join("; ");
  return (
    `Can't remove this yet: ${items}. ` +
    `Someone is counting on that swap, so it won't be deleted as a side effect — ` +
    `go to Schedule → Swaps and cancel it first, then try again.`
  );
}

/** One call for the deleters: returns a blocking message (delete must be
 * refused, show this to the manager) or null after detaching whatever
 * needed detaching (delete may proceed).
 *
 * The detach is not wrapped in db.batch with the caller's delete on
 * purpose: a detach that commits without its delete leaves a
 * detached-but-still-referenced swap, which is harmless (the snapshot
 * matches the still-live assignment, the FK is just null a moment
 * early) — whereas composing would force every caller's existing delete
 * shape to change. */
export async function prepareAssignmentsForDelete(assignmentIds: number[]): Promise<string | null> {
  // Sweep FIRST (2026-09-03). Jamming a week delete with a dead request is
  // the concrete harm the sweep exists to remove, and this is the code
  // that does the jamming -- so it cannot depend on a manager having
  // happened to open the Swaps page beforehand. Idempotent, and a no-op in
  // the normal case where nothing is stale.
  await expireStaleSwaps(businessTodayIso());
  const rows = await loadSwapRowsFor(assignmentIds);
  const blockMessage = describeBlockingSwaps(rows);
  if (blockMessage) return blockMessage;
  const detachable = rows.filter((r) => DISPOSITION[r.status] === "detach");
  for (const r of detachable) {
    await db
      .update(swapRequests)
      .set({
        assignmentId: null,
        detachedShiftDate: r.date,
        detachedShiftPeriod: r.period,
        detachedPositionId: r.positionId,
      })
      .where(eq(swapRequests.id, r.swapId));
  }
  return null;
}
