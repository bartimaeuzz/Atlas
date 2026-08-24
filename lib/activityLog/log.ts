import { db } from "@/db/client";
import { activityLog } from "@/db/schema";

/** Activity log write path (2026-08-22).
 *
 * Oliver's ask was an "Activity log center and tag for each type of log",
 * readable by Partner, Admin, and a permission-granted Assistant Manager.
 * This is the write half; the Centre is the read half and comes later. The
 * table is general from the first row on purpose — a bespoke
 * petty-cash-only audit table would have to be migrated once the Centre
 * covers a second subsystem.
 *
 * ATOMICITY, and why it is done this way. The immediate reason this exists
 * is the rule that an admin editing an ALREADY-FINALIZED day is logged. An
 * audit trail that can silently miss an entry is not an audit trail, so the
 * log insert must not be a best-effort afterthought:
 *
 *   - `logActivityStatement` returns the INSERT without running it, so a
 *     caller can hand it to `db.batch([mutation, logStatement])`. libSQL
 *     runs a batch as one transaction, so either the edit and its log row
 *     both land, or neither does. There is no window where a finalized
 *     record changes without a trace.
 *   - `logActivity` runs one on its own, for events that are not paired
 *     with a mutation.
 *
 * Do NOT wrap the log write in a try/catch that swallows failures. On this
 * table a swallowed error is exactly the bug the table exists to prevent.
 */

/** Dotted namespace so a subsystem is greppable and the Centre can group by
 *  prefix. Add to this union rather than passing loose strings — a typo in
 *  a tag is invisible until someone filters the log and finds nothing. */
export type ActivityType =
  | "petty_cash.entry.created"
  | "petty_cash.entry.updated"
  | "petty_cash.entry.deleted"
  | "petty_cash.day.finalized"
  | "petty_cash.day.reconciliation_edited"
  | "ledger_card.import.committed";

export interface ActivityEntry {
  actorEmployeeId: number;
  type: ActivityType;
  entityType: "petty_cash_entry" | "daily_cash_reconciliation" | "card_statement_period";
  /** Text, not a number: some subjects are keyed by date ("2026-08-22"). */
  entityId: string;
  /** Pre-rendered and frozen at write time. The log has to stay readable
   *  years later, after the row it describes has been edited or deleted and
   *  after the category it named was renamed — so the sentence cannot be
   *  reconstructed at read time from records that have moved on. */
  summary: string;
  /** Before/after specifics for anyone who needs them. */
  detail?: unknown;
}

function values(entry: ActivityEntry) {
  return {
    actorEmployeeId: entry.actorEmployeeId,
    type: entry.type,
    entityType: entry.entityType,
    entityId: entry.entityId,
    summary: entry.summary,
    detail: entry.detail === undefined ? null : JSON.stringify(entry.detail),
  };
}

/** The INSERT, unexecuted — pass to `db.batch()` alongside the mutation it
 *  records so the two are atomic. */
export function logActivityStatement(entry: ActivityEntry) {
  return db.insert(activityLog).values(values(entry));
}

/** Standalone write, for an event with no paired mutation to batch with. */
export async function logActivity(entry: ActivityEntry) {
  await db.insert(activityLog).values(values(entry));
}

/** Money formatted for a log sentence. Deliberately not the UI's
 *  formatMoney: a log line is a record, not a rendered view, and should not
 *  change appearance when the UI's money formatting does. */
export function logMoney(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}
