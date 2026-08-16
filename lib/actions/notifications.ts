"use server";

/** Notification read-tracking actions (2026-08-16) -- see
 * db/schema.ts's notificationSeen comment for the design. Currently
 * only one section exists ("leave_requests"); the shift-swap inbox will
 * add a second call site here with its own section string once that
 * feature is designed. */

import { db } from "@/db/client";
import { notificationSeen } from "@/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { getCurrentStaffSession } from "@/lib/auth/session";

/** Marks a notification section as seen "now" for the signed-in manager.
 * Called from a client component on mount when they land on the
 * corresponding inbox page (see MarkSeenOnMount.tsx) -- deliberately not
 * done during the page's own server render, since a GET shouldn't have
 * side effects and the page component may be reused/cached. Upserts
 * rather than insert-only, since a manager will revisit the same
 * section's inbox repeatedly. */
export async function markNotificationSeen(section: string): Promise<void> {
  const session = await getCurrentStaffSession();
  if (!session) return;
  if (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN") return;

  // Deliberately uses SQLite's own current_timestamp (via `sql`), the
  // same source leaveRequests.loggedAt's column default uses, rather
  // than a JS-side `new Date().toISOString()`. Those two produce
  // different string shapes ("2026-08-16 12:00:00" vs
  // "2026-08-16T12:00:00.000Z") that don't compare correctly against
  // each other lexicographically -- loadUnseenLeaveRequestCount does a
  // plain string `>` comparison between lastSeenAt and loggedAt, so both
  // sides must come from the same clock/format for that to be correct.
  const [existing] = await db
    .select({ id: notificationSeen.id })
    .from(notificationSeen)
    .where(and(eq(notificationSeen.employeeId, session.id), eq(notificationSeen.section, section)));

  if (existing) {
    await db
      .update(notificationSeen)
      .set({ lastSeenAt: sql`(current_timestamp)` })
      .where(eq(notificationSeen.id, existing.id));
  } else {
    await db.insert(notificationSeen).values({ employeeId: session.id, section, lastSeenAt: sql`(current_timestamp)` });
  }
}
