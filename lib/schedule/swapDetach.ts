import { eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { swapRequests, plannedShiftAssignments, employees, positions } from "@/db/schema";
import { formatDayLabelShort } from "@/lib/format/formatDayLabel";

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

const UNRESOLVED = ["open", "pending_manager_approval"] as const;
const RESOLVED = ["completed", "declined", "cancelled"] as const;

interface SwapRow {
  swapId: number;
  status: string;
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
  const blocking = rows.filter((r) => (UNRESOLVED as readonly string[]).includes(r.status));
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
    `go to Schedule → Swaps and approve, decline, or cancel it first, then try again.`
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
  const rows = await loadSwapRowsFor(assignmentIds);
  const blockMessage = describeBlockingSwaps(rows);
  if (blockMessage) return blockMessage;
  const detachable = rows.filter((r) => (RESOLVED as readonly string[]).includes(r.status));
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
