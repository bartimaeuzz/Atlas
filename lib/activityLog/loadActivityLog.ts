import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { activityLog, employees } from "@/db/schema";

/** Read side of the Activity Log Centre (2026-08-22).
 *
 * Paginated by KEYSET, not by OFFSET. A log only ever grows and is read
 * newest-first, which is precisely the case where `LIMIT n OFFSET m` gets
 * slower the further back you look and — worse — silently skips or repeats
 * rows when something is written while someone is paging. Keying off the
 * last row seen has neither problem, and it uses the `at` index directly.
 */

export interface ActivityLogRow {
  id: number;
  at: string;
  actorName: string;
  type: string;
  entityType: string;
  entityId: string | null;
  summary: string;
  detail: string | null;
}

export interface ActivityLogPage {
  rows: ActivityLogRow[];
  /** Cursor for the next page — pass back as `before`. Null at the end. */
  nextCursor: number | null;
  /** Every tag present in the log, for building the filter. Read from the
   *  data rather than from the ActivityType union: a tag that was written
   *  by an older deploy and later removed from the code still exists in the
   *  table, and the filter must be able to find it. */
  availableTypes: { type: string; count: number }[];
}

const PAGE_SIZE = 50;

export async function loadActivityLog(opts: { type?: string; before?: number } = {}): Promise<ActivityLogPage> {
  const conditions = [];
  if (opts.type) conditions.push(eq(activityLog.type, opts.type));
  if (opts.before) conditions.push(lt(activityLog.id, opts.before));
  const where = conditions.length ? and(...conditions) : undefined;

  const rows = await db
    .select({
      id: activityLog.id,
      at: activityLog.at,
      type: activityLog.type,
      entityType: activityLog.entityType,
      entityId: activityLog.entityId,
      summary: activityLog.summary,
      detail: activityLog.detail,
      actorName: employees.nickname,
    })
    .from(activityLog)
    .innerJoin(employees, eq(employees.id, activityLog.actorEmployeeId))
    .where(where)
    // id, not at: `at` has second resolution, so two rows written in the
    // same second would order arbitrarily and the keyset cursor could skip
    // one. id is monotonic and unique, and for an append-only table it
    // orders identically to time.
    .orderBy(desc(activityLog.id))
    .limit(PAGE_SIZE + 1);

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;

  const typeCounts = await db
    .select({ type: activityLog.type, count: sql<number>`count(*)` })
    .from(activityLog)
    .groupBy(activityLog.type)
    .orderBy(desc(sql`count(*)`));

  return {
    rows: page.map((r) => ({ ...r, actorName: r.actorName ?? "Unknown" })),
    nextCursor: hasMore ? page[page.length - 1].id : null,
    availableTypes: typeCounts,
  };
}

/** Turn a dotted tag into something a person reads. Falls back to the raw
 *  tag rather than hiding an unrecognised one — a log entry nobody can
 *  name is still an entry somebody may need to find. */
export function describeType(type: string): { group: string; label: string } {
  const KNOWN: Record<string, { group: string; label: string }> = {
    "petty_cash.entry.created": { group: "Petty Cash", label: "Expense added" },
    "petty_cash.entry.updated": { group: "Petty Cash", label: "Expense changed" },
    "petty_cash.entry.deleted": { group: "Petty Cash", label: "Expense removed" },
    "petty_cash.day.finalized": { group: "Petty Cash", label: "Day finalized" },
    "petty_cash.day.reconciliation_edited": { group: "Petty Cash", label: "Reconciliation edited" },
    "ledger_card.import.committed": { group: "Ledger Card", label: "Statement imported" },
  };
  if (KNOWN[type]) return KNOWN[type];
  const [group, ...rest] = type.split(".");
  return { group: group.replace(/_/g, " "), label: rest.join(" ").replace(/[._]/g, " ") || type };
}
