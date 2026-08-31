"use server";

import { asActionResult, type ActionResult } from "@/lib/actions/actionResult";
import { businessTodayIso } from "@/lib/formatDateTime";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq, and, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import {
  shifts, shiftRosterEntries, shiftSales, onlinePlatformSalesRecords,
  onlinePlatforms, metricValues,
  shiftWageAdjustments, shiftAttendanceMarks,
  hostUpsellTipRecords, deliveryCashTipRecords, tipPoolCalculations, employeePayouts,
  scheduleWeeks, plannedShiftAssignments, employeePositions,
  payrollPeriods, incentivePayoutRecords, restaurantSettings,
} from "@/db/schema";
import { finalizeShiftWrites } from "@/lib/shift/finalizeShiftWrites";
import { describeUndecided, loadUndecidedPointRows } from "@/lib/shift/pointDecision";
import { loadPriorShiftFigures } from "@/lib/shift/loadClosingReportData";
import { subtractDayTotals, TOAST_DAY_TOTAL_FIELDS, PLATFORM_DAY_TOTAL_FIELDS } from "@/lib/shift/priorShiftSales";
import { weekStartFor } from "@/lib/schedule/weekMath";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { logActivity, logActivityStatement } from "@/lib/activityLog/log";

/** 2026-08-21 — server-action auth audit: this file had NO auth check at
 * all before, on any of its six exported actions, including
 * confirmFinalize (the step that permanently locks a shift's payroll
 * numbers). The page-level requireManager() guard on /shifts/* protects
 * page loads, not a Server Action's own POST endpoint called directly —
 * same gap class already found and fixed in employees.ts/tipPools.ts/
 * payroll.ts/permissions.ts, see project_atlas_security_audit_2026_08_17
 * memory. Same established pattern, copied as-is. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
}

/** Auto-seeds a brand-new shift's roster from a PUBLISHED weekly plan
 * (Schedule Planner Phase 2, 2026-08-11) — confirmed with Oliver: this is
 * exactly the point of publishing a plan, so nobody has to re-enter the
 * same names on the day the shift actually happens. Draft (unpublished)
 * weeks are deliberately ignored — only a published plan is trustworthy
 * enough to auto-populate real payroll-affecting rows. Silently does
 * nothing if there's no published plan for this date/period, which is
 * the common case today (most shifts still get built by hand until the
 * planner is in regular use) — this is additive, not a requirement. */
async function seedRosterFromPublishedPlan(shiftId: number, date: string, period: "Lunch" | "Dinner") {
  const weekStartDate = weekStartFor(date);
  const [week] = await db
    .select()
    .from(scheduleWeeks)
    .where(and(eq(scheduleWeeks.weekStartDate, weekStartDate), eq(scheduleWeeks.status, "published")));
  if (!week) return;

  const planned = await db
    .select()
    .from(plannedShiftAssignments)
    .where(
      and(
        eq(plannedShiftAssignments.weekId, week.id),
        eq(plannedShiftAssignments.date, date),
        eq(plannedShiftAssignments.period, period)
      )
    );
  if (planned.length === 0) return;

  await db.insert(shiftRosterEntries).values(
    planned.map((p) => ({ shiftId, employeeId: p.employeeId, positionId: p.positionId }))
  );
}

/** Creates a new draft shift for a date + meal period, then sends the
 * manager straight into building the roster for it. Auto-seeds the
 * roster from a published weekly plan for a NEWLY created shift only —
 * the existing "Add someone" flow on the roster page (untouched) still
 * handles same-day fixes on top of whatever gets seeded here. */
export interface CreateShiftState {
  error: string | null;
  /** Set instead of redirecting when the date+period shift already exists
   * (2026-08-24, Oliver): the old behaviour silently opened the existing
   * shift's roster, which read as "created" when nothing was. The form
   * shows a dialog -- Cancel | Go to that shift -- so the manager knows. */
  existing?: { id: number; status: "draft" | "finalized"; date: string; period: string };
  /** Set instead of creating when the date has already passed and the
   * submit didn't carry confirmPast (2026-08-25, Oliver: "warn create
   * shifts on days that passed") -- the form asks first, same ask-first
   * gate shape as the planner's quick-add. Future dates are refused
   * outright, not confirmed: a shift is a record of a service, and the
   * ledger's "not be editable before day comes" rule applies here too. */
  pastConfirm?: { date: string; period: "Lunch" | "Dinner" };
}

/** The restaurant's business day (NYC wall clock, 4am rollover) -- see
 * businessTodayIso. A Dinner closed out at 1am still belongs to
 * yesterday, so creating "today's" shift then never trips the past-day
 * gate. */
function todayIso(): string {
  return businessTodayIso();
}

export async function createShift(_prev: CreateShiftState, formData: FormData): Promise<CreateShiftState> {
  let shiftId: number;
  try {
    const session = await requireManagerAction();

    const date = String(formData.get("date") ?? "");
    const period = String(formData.get("period") ?? "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || (period !== "Lunch" && period !== "Dinner")) {
      throw new Error("Date and period (Lunch/Dinner) are required");
    }

    if (date > todayIso()) {
      throw new Error("Can't create a shift for a day that hasn't happened yet.");
    }

    const [existing] = await db
      .select()
      .from(shifts)
      .where(and(eq(shifts.date, date), eq(shifts.period, period as "Lunch" | "Dinner")));

    if (existing) {
      return {
        error: null,
        existing: { id: existing.id, status: existing.status as "draft" | "finalized", date, period },
      };
    }

    if (date < todayIso() && !formData.get("confirmPast")) {
      return { error: null, pastConfirm: { date, period } };
    }

    const [shift] = await db
      .insert(shifts)
      .values({ date, period: period as "Lunch" | "Dinner", status: "draft", createdByEmployeeId: session.id, createdAt: new Date().toISOString() })
      .returning();
    // rosterSource "fresh" starts with an empty roster (2026-08-25,
    // Oliver: the create popup offers "pull data from assignment or
    // start fresh"). Anything else keeps the long-standing default of
    // seeding from the published weekly plan.
    if (String(formData.get("rosterSource") ?? "plan") !== "fresh") {
      await seedRosterFromPublishedPlan(shift.id, date, period as "Lunch" | "Dinner");
    }
    shiftId = shift.id;
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/roster`);
}

export async function addRosterEntry(formData: FormData): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireManagerAction();

    const shiftId = Number(formData.get("shiftId"));
    const employeeId = Number(formData.get("employeeId"));
    const positionId = Number(formData.get("positionId"));

    if (!shiftId || !employeeId || !positionId) {
      throw new Error("Employee and position are required");
    }

    await assertDraft(shiftId);

    // One person, one slot per shift (2026-08-25, Oliver: "block having
    // same person in 2 positions. it is not logical in the end") -- the
    // old second-role flow is retired. Historical multi-role rows stay
    // valid; new ones can't be created.
    const [alreadyOn] = await db
      .select()
      .from(shiftRosterEntries)
      .where(and(eq(shiftRosterEntries.shiftId, shiftId), eq(shiftRosterEntries.employeeId, employeeId)));
    if (alreadyOn) throw new Error("They're already on this shift.");

    // Optional day-of coverage record (2026-08-25) -- "extra" comes from
    // the over-target quick-add gate; anything else is ignored so a
    // malformed value can never invent a coverage state.
    const kindRaw = String(formData.get("coverageKind") ?? "");
    const coverageKind = kindRaw === "extra" ? ("extra" as const) : null;
    const coverageNote = String(formData.get("coverageNote") ?? "").trim() || null;

    // Point value override is NOT set here on purpose — it's a closing-time
    // judgment call ("did great today"), entered on the Closing Report page
    // right before Save, not a staffing decision made when building the
    // roster hours earlier. New entries start with no override (resolves to
    // the employee's standing point value until someone bumps it later).
    await db.insert(shiftRosterEntries).values({
      shiftId,
      employeeId,
      positionId,
      coverageKind,
      coverageNote: coverageKind ? coverageNote : null,
    });

    revalidatePath(`/shifts/${shiftId}/roster`);
});
}

export async function removeRosterEntry(formData: FormData): Promise<ActionResult> {
  // Returns expected failures instead of throwing them -- production
  // redacts thrown server-action errors to "Minified React error #441"
  // (2026-08-24 sweep; see lib/actions/actionResult.ts).
  return asActionResult(async () => {
    await requireManagerAction();

    const rosterEntryId = Number(formData.get("rosterEntryId"));
    const shiftId = Number(formData.get("shiftId"));
    if (!rosterEntryId || !shiftId) throw new Error("Missing roster entry");

    await assertDraft(shiftId);

    // "Added by mistake" means AS IF THEY WERE NEVER THERE -- so any
    // attendance mark they carried goes too, in the same commit (Oliver,
    // 2026-08-25: a mistake-removed person with an old mark was landing
    // in "Out today"). One row per person per shift, so the entry's
    // employee identifies the mark.
    const [entry] = await db.select().from(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId));
    if (entry && entry.shiftId === shiftId) {
      await db.batch([
        db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId)),
        db
          .delete(shiftAttendanceMarks)
          .where(and(eq(shiftAttendanceMarks.shiftId, shiftId), eq(shiftAttendanceMarks.employeeId, entry.employeeId))),
      ]);
    }
    revalidatePath(`/shifts/${shiftId}/roster`);
});
}

/** ADMIN-only reopen of a finalized shift (2026-08-26, Oliver -- the
 * financial-lifecycle discussion: finalized = "posted", editable only
 * through a documented reversal; a PAID payroll week = "closed", a
 * permanent wall). Deletes the finalize snapshot (tip pool calc,
 * payouts, per-shift incentive records), flips the shift back to draft,
 * and writes the who/when/why to the activity log -- all one batch.
 * Blocked while the shift's week is marked paid: the Admin must revert
 * the payroll week first (revertPayrollPeriodToDraft), the app never
 * quietly rewrites a closed book. */
export async function reopenShift(formData: FormData): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await getCurrentStaffSession();
    if (!session || (session.systemRole !== "ADMIN" && session.systemRole !== "MANAGER")) {
      throw new Error("Not authorized.");
    }
    const shiftId = Number(formData.get("shiftId"));
    const reason = String(formData.get("reason") ?? "").trim();
    if (!shiftId) throw new Error("Missing shift id");
    if (!reason) throw new Error("Write why this shift needs reopening -- the reason goes on the permanent record.");

    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
    if (!shift) throw new Error("Shift not found");
    if (shift.status !== "finalized") throw new Error("This shift isn't finalized.");
    // Reopen rule (2026-08-26, Aey via Oliver: a small restaurant's
    // managers "make mistake all the time"): the manager who finalized a
    // shift may reopen their own entry; anyone else needs ADMIN. Shifts
    // finalized before finalizedByEmployeeId existed have no recorded
    // closer, so they stay ADMIN-only.
    const isFinalizer = shift.finalizedByEmployeeId != null && shift.finalizedByEmployeeId === session.id;
    if (session.systemRole !== "ADMIN" && !isFinalizer) {
      throw new Error("Only the manager who finalized this shift (or an Admin) can reopen it.");
    }

    const weekStart = weekStartFor(shift.date);
    const [period] = await db.select().from(payrollPeriods).where(eq(payrollPeriods.weekStartDate, weekStart));
    if (period?.status === "paid") {
      throw new Error(
        "That week's payroll is already marked paid -- a paid week is a closed book. Revert the payroll week to draft first (Payroll page), then reopen this shift."
      );
    }

    await db.batch([
      db.delete(tipPoolCalculations).where(eq(tipPoolCalculations.shiftId, shiftId)),
      db.delete(employeePayouts).where(eq(employeePayouts.shiftId, shiftId)),
      db
        .delete(incentivePayoutRecords)
        .where(and(eq(incentivePayoutRecords.periodType, "SHIFT"), eq(incentivePayoutRecords.periodKey, String(shiftId)))),
      db.update(shifts).set({ status: "draft", finalizedAt: null, finalizedByEmployeeId: null }).where(eq(shifts.id, shiftId)),
      logActivityStatement({
        actorEmployeeId: session.id,
        type: "shift.reopened",
        entityType: "shift",
        entityId: String(shiftId),
        summary: `Reopened finalized shift ${shift.date} (${shift.period}) -- ${reason}`,
        detail: { reason, previousFinalizedAt: shift.finalizedAt },
      }),
    ]);
    revalidatePath(`/shifts/${shiftId}/roster`);
    revalidatePath("/shifts");
  });
}

/* ---------------------------------------------------------------------- */
/* Attendance marks (2026-08-25, Oliver's injury/no-show scenario)         */
/* ---------------------------------------------------------------------- */

const ATTENDANCE_MARKS = ["no_show", "late", "emergency", "other"] as const;
type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

function readMark(formData: FormData): AttendanceMark {
  const mark = String(formData.get("mark") ?? "");
  if (!(ATTENDANCE_MARKS as readonly string[]).includes(mark)) throw new Error("Unknown attendance mark");
  return mark as AttendanceMark;
}

/** One mark per person per shift (unique index) -- marking again replaces,
 * so "late" mis-tapped as "no show" is fixed by marking again, and
 * clearAttendanceMark undoes entirely. Marks are informational: nothing
 * in tip pool or wage math reads them (rule 6 -- the closing report shows
 * them NEXT TO the deduction field, the manager types every number). */
export async function setAttendanceMark(formData: FormData): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireManagerAction();
    const shiftId = Number(formData.get("shiftId"));
    const employeeId = Number(formData.get("employeeId"));
    if (!shiftId || !employeeId) throw new Error("Missing shift or employee");
    const mark = readMark(formData);
    const note = String(formData.get("note") ?? "").trim() || null;

    await assertDraft(shiftId);

    await db
      .insert(shiftAttendanceMarks)
      .values({ shiftId, employeeId, mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() })
      .onConflictDoUpdate({
        target: [shiftAttendanceMarks.shiftId, shiftAttendanceMarks.employeeId],
        set: { mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() },
      });

    revalidatePath(`/shifts/${shiftId}/roster`);
  });
}

export async function clearAttendanceMark(formData: FormData): Promise<ActionResult> {
  return asActionResult(async () => {
    await requireManagerAction();
    const shiftId = Number(formData.get("shiftId"));
    const employeeId = Number(formData.get("employeeId"));
    if (!shiftId || !employeeId) throw new Error("Missing shift or employee");

    await assertDraft(shiftId);

    await db
      .delete(shiftAttendanceMarks)
      .where(and(eq(shiftAttendanceMarks.shiftId, shiftId), eq(shiftAttendanceMarks.employeeId, employeeId)));
    revalidatePath(`/shifts/${shiftId}/roster`);
  });
}

/** Deletes a DRAFT shift and everything hanging off it, in one commit
 * (2026-08-25, Oliver: "add ... delete shift button" on the roster).
 * assertDraft is the load-bearing guard: a finalized shift is a locked
 * payroll record and must never be deletable from anywhere. The
 * finalize-only tables (tip pool calc, payouts) are included defensively
 * -- deleting from an empty set is free, and a half-finalized orphan row
 * would otherwise survive. Redirects to the shift's month afterwards. */
export async function deleteShift(formData: FormData): Promise<ActionResult> {
  let month: string;
  try {
    await requireManagerAction();
    const shiftId = Number(formData.get("shiftId"));
    if (!shiftId) throw new Error("Missing shift id");
    await assertDraft(shiftId);
    const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
    if (!shift) throw new Error("That shift is already gone");
    month = shift.date.slice(0, 7);

    await db.batch([
      db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.shiftId, shiftId)),
      db.delete(shiftAttendanceMarks).where(eq(shiftAttendanceMarks.shiftId, shiftId)),
      db.delete(shiftWageAdjustments).where(eq(shiftWageAdjustments.shiftId, shiftId)),
      db.delete(shiftSales).where(eq(shiftSales.shiftId, shiftId)),
      db.delete(onlinePlatformSalesRecords).where(eq(onlinePlatformSalesRecords.shiftId, shiftId)),
      db.delete(metricValues).where(eq(metricValues.shiftId, shiftId)),
      db.delete(hostUpsellTipRecords).where(eq(hostUpsellTipRecords.shiftId, shiftId)),
      db.delete(deliveryCashTipRecords).where(eq(deliveryCashTipRecords.shiftId, shiftId)),
      db.delete(employeePayouts).where(eq(employeePayouts.shiftId, shiftId)),
      db.delete(tipPoolCalculations).where(eq(tipPoolCalculations.shiftId, shiftId)),
      db.delete(shifts).where(eq(shifts.id, shiftId)),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
  revalidatePath("/shifts");
  redirect(`/shifts?month=${month}`);
}

/** Absent -- remove from the roster AND record why, in one commit
 * (db.batch: the mark and the removal it explains must land together).
 * Reason is one of the two fixed absence reasons; "late" is not valid
 * here because a late person still works and stays on the roster. */
export async function removeRosterEntryAbsent(formData: FormData): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireManagerAction();
    const rosterEntryId = Number(formData.get("rosterEntryId"));
    const shiftId = Number(formData.get("shiftId"));
    if (!rosterEntryId || !shiftId) throw new Error("Missing roster entry");
    const mark = readMark(formData);
    if (mark === "late") throw new Error("A late person stays on the roster");
    const note = String(formData.get("note") ?? "").trim() || null;
    if (mark === "other" && !note) throw new Error("Write a note saying why -- \"Other\" needs a reason.");

    await assertDraft(shiftId);
    const [entry] = await db.select().from(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId));
    if (!entry || entry.shiftId !== shiftId) throw new Error("That roster entry is gone already");

    await db.batch([
      db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId)),
      db
        .insert(shiftAttendanceMarks)
        .values({ shiftId, employeeId: entry.employeeId, mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: [shiftAttendanceMarks.shiftId, shiftAttendanceMarks.employeeId],
          set: { mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() },
        }),
    ]);
    revalidatePath(`/shifts/${shiftId}/roster`);
  });
}

/** Replace with a substitute -- one flow, three effects in one commit:
 * the absent person leaves the roster, their absence reason is recorded,
 * and the substitute takes the same position flagged as covering them. */
export async function replaceWithSubstitute(formData: FormData): Promise<ActionResult> {
  return asActionResult(async () => {
    const session = await requireManagerAction();
    const rosterEntryId = Number(formData.get("rosterEntryId"));
    const shiftId = Number(formData.get("shiftId"));
    const substituteEmployeeId = Number(formData.get("substituteEmployeeId"));
    if (!rosterEntryId || !shiftId || !substituteEmployeeId) throw new Error("Missing roster entry or substitute");
    const mark = readMark(formData);
    if (mark === "late") throw new Error("A late person stays on the roster");
    const note = String(formData.get("note") ?? "").trim() || null;
    if (mark === "other" && !note) throw new Error("Write a note saying why -- \"Other\" needs a reason.");

    await assertDraft(shiftId);
    const [entry] = await db.select().from(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId));
    if (!entry || entry.shiftId !== shiftId) throw new Error("That roster entry is gone already");
    if (substituteEmployeeId === entry.employeeId) throw new Error("Someone can't substitute for themselves");
    const [subOn] = await db
      .select()
      .from(shiftRosterEntries)
      .where(and(eq(shiftRosterEntries.shiftId, shiftId), eq(shiftRosterEntries.employeeId, substituteEmployeeId)));
    if (subOn) throw new Error("The substitute is already on this shift.");

    await db.batch([
      db.delete(shiftRosterEntries).where(eq(shiftRosterEntries.id, rosterEntryId)),
      db
        .insert(shiftAttendanceMarks)
        .values({ shiftId, employeeId: entry.employeeId, mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() })
        .onConflictDoUpdate({
          target: [shiftAttendanceMarks.shiftId, shiftAttendanceMarks.employeeId],
          set: { mark, note, markedByEmployeeId: session.id, markedAt: new Date().toISOString() },
        }),
      db.insert(shiftRosterEntries).values({
        shiftId,
        employeeId: substituteEmployeeId,
        positionId: entry.positionId,
        sectionId: entry.sectionId,
        coverageKind: "substitute",
        coverageNote: note,
        coversEmployeeId: entry.employeeId,
      }),
    ]);
    revalidatePath(`/shifts/${shiftId}/roster`);
  });
}

export interface ClosingReportActionState {
  error: string | null;
  /** Stamp of the last successful draft save -- the form flips its button
   * to "Saved" for a moment when this changes (2026-08-24, Oliver). A
   * nonce, not a display value; each save returns a fresh one. */
  savedAt?: number;
}

/** Upserts the one ShiftSales row + all four OnlinePlatformSalesRecord rows
 * for a shift in one submit — this is the "closing report" sales entry.
 *
 * Signature matches React's useActionState (prevState, formData) so the
 * client form can catch validation errors (e.g. Takeout + Delivery tip
 * exceeding Total CC Tip) and show them inline instead of letting them
 * escape as an uncaught error, which would otherwise render Next.js's
 * generic/technical error page — not something a restaurant manager should
 * ever see mid-shift. Caught directly by Oliver testing this 2026-08-08. */
export async function saveClosingReportSales(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    const session = await requireManagerAction();
    await assertDraft(shiftId);
    await upsertClosingReportSales(shiftId, formData, session.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}/closing-report`);
  return { error: null, savedAt: Date.now() };
}

/** "Save & Preview" from the closing report form — persists whatever's in
 * the form fields right now, then sends the manager to the Preview page
 * (computed live, nothing locked yet) instead of finalizing immediately.
 * Split into an explicit Save-then-Preview-then-Confirm flow on 2026-08-08
 * after Oliver pointed out that finalizing right away, with no review step,
 * meant a typo could get permanently baked into a locked payroll record —
 * see confirmFinalize below for the step that actually locks it. Same
 * error-handling reasoning as saveClosingReportSales above — redirect() is
 * deliberately called AFTER the try/catch, not inside it. */
export async function saveClosingReportAndPreview(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    const session = await requireManagerAction();
    await assertDraft(shiftId);
    await upsertClosingReportSales(shiftId, formData, session.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}/preview`);
  redirect(`/shifts/${shiftId}/preview`);
}

/** The actual lock step — only reachable from the Preview page, after the
 * manager has already seen the computed numbers. Recomputes fresh from
 * current DB state (not from whatever the client had in memory) so it's
 * always accurate even if something changed since the preview was shown,
 * then writes the locked snapshot. */
export async function confirmFinalize(
  _prevState: ClosingReportActionState,
  formData: FormData
): Promise<ClosingReportActionState> {
  const shiftId = Number(formData.get("shiftId"));
  if (!shiftId) return { error: "Missing shift id" };

  try {
    const session = await requireManagerAction();
    await assertDraft(shiftId);
    await runFinalize(shiftId, session.id);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath(`/shifts/${shiftId}`);
  revalidatePath("/shifts");
  redirect(`/shifts/${shiftId}/summary`);
}

async function upsertClosingReportSales(shiftId: number, formData: FormData, decidedByEmployeeId: number) {
  // VALIDATE EVERYTHING BEFORE WRITING ANYTHING. The day-total gate below
  // can refuse the save, and the form's error banner promises "nothing
  // was recorded" — that sentence must stay true, so no table is touched
  // until every refusal path has had its chance to throw (2026-08-31; the
  // first cut ran the point/metric/wage upserts first and made a refused
  // sales save silently half-apply).
  const num = (key: string) => Number(formData.get(key) ?? 0) || 0;

  const salesValues = {
    totalSales: num("totalSales"),
    ccTipTotal: num("ccTipTotal"),
    takeoutCcTip: num("takeoutCcTip"),
    deliveryToastTip: num("deliveryToastTip"),
    cashSales: num("cashSales"),
    cashTip: num("cashTip"),
    grossFoodSales: num("grossFoodSales"),
    grossBeverageSales: num("grossBeverageSales"),
    // Sales tax (2026-08-10) — the form field is pre-filled with an
    // auto-computed suggestion (totalSales × defaultSalesTaxRate) by the
    // loader, but whatever's actually in the field on submit is what gets
    // saved, same as every other sales field here — once a manager saves
    // the report (even unchanged), that number becomes the real, explicit
    // figure for this shift, no longer just a suggestion.
    salesTax: num("salesTax"),
  };

  /* Day-total question (2026-08-31, Aey's run-through). Toast — and the
   * online-platform dashboards — may show DAY-TO-DATE numbers at Dinner
   * close, and a cumulative figure saved as Dinner's own inflates
   * Dinner's tip pools and pays the wrong crew. When an earlier shift
   * exists today, the manager MUST answer what the entered numbers
   * cover; "whole day" subtracts the earlier shift's saved figures via
   * the same pure helper the form previews with. The server re-derives
   * everything here — the client's idea of "is there a prior shift" is
   * never trusted. Recomputed prior figures come from ONE shared loader
   * (loadPriorShiftFigures) so preview and stored money cannot drift. */
  const [shiftRow] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  const [settings] = await db.select().from(restaurantSettings).where(eq(restaurantSettings.restaurantId, 1));
  const prior = shiftRow
    ? await loadPriorShiftFigures(shiftRow.date, shiftRow.period, settings?.defaultSalesTaxRate ?? 0)
    : null;

  let toastSubtraction: { entered: Record<string, number>; subtracted: Record<string, number> } | null = null;
  if (prior) {
    const toastMode = String(formData.get("toastEntryMode") ?? "");
    if (toastMode !== "shift" && toastMode !== "day") {
      throw new Error(
        `${prior.period} was already closed today, so Atlas needs to know what the Toast numbers cover — ` +
          `choose "This shift only" or "Whole day" at the top of the Sales card. Nothing was saved.`
      );
    }
    if (toastMode === "day") {
      if (!prior.toast) {
        throw new Error(
          `You chose "Whole day", but ${prior.period}'s closing report was never saved, so there is nothing ` +
            `to subtract. Save ${prior.period}'s report first — or enter this shift's own numbers and choose ` +
            `"This shift only". Nothing was saved.`
        );
      }
      const r = subtractDayTotals(salesValues, prior.toast, TOAST_DAY_TOTAL_FIELDS, "Toast", prior.period);
      if (!r.ok) throw new Error(r.error);
      toastSubtraction = { entered: { ...salesValues }, subtracted: prior.toast };
      Object.assign(salesValues, r.values);
    }
  }

  const priorPlatformFigures = new Map((prior?.platforms ?? []).map((p) => [p.platformId, p]));
  let platformDayMode = false;
  if (prior && priorPlatformFigures.size > 0) {
    const platformMode = String(formData.get("platformEntryMode") ?? "");
    if (platformMode !== "shift" && platformMode !== "day") {
      throw new Error(
        `${prior.period} already recorded online-platform sales today, so Atlas needs to know what the ` +
          `platform numbers cover — choose "This shift only" or "Whole day" in the Online platform sales card. ` +
          `Nothing was saved.`
      );
    }
    platformDayMode = platformMode === "day";
  }

  // Per-platform final values, computed and validated BEFORE any write —
  // a mid-loop refusal must not leave the shift half-saved.
  const platformSubtractions: { platformName: string; entered: Record<string, number>; subtracted: Record<string, number> }[] = [];
  const platforms = await db.select().from(onlinePlatforms);
  const platformFinalValues: { platformId: number; values: Record<string, number> }[] = [];
  for (const platform of platforms) {
    const enteredValues: Record<string, number> = {
      salesAmount: num(`platform_${platform.id}_salesAmount`),
      commissionFee: num(`platform_${platform.id}_commissionFee`),
      tipAmountPlatformCourier: num(`platform_${platform.id}_tipCourier`),
      tipAmountRestaurantDelivery: num(`platform_${platform.id}_tipRestaurantDelivery`),
      taxAmount: num(`platform_${platform.id}_taxAmount`), // 2026-08-10, same pre-filled-suggestion pattern as shiftSales.salesTax
    };

    let finalValues = enteredValues;
    const priorFigures = priorPlatformFigures.get(platform.id);
    if (platformDayMode && priorFigures && prior) {
      const r = subtractDayTotals(enteredValues, priorFigures.figures, PLATFORM_DAY_TOTAL_FIELDS, platform.name, prior.period);
      if (!r.ok) throw new Error(r.error);
      finalValues = r.values;
      platformSubtractions.push({ platformName: platform.name, entered: enteredValues, subtracted: priorFigures.figures });
    }
    platformFinalValues.push({ platformId: platform.id, values: finalValues });
  }

  /* -------- everything below is writes; nothing above touched a table -------- */

  await upsertPointOverrides(shiftId, formData, decidedByEmployeeId);
  await upsertMetricValues(shiftId, formData);
  await upsertWageAdjustments(shiftId, formData);

  // Incident report (2026-08-25, Oliver) -- free text on the shift
  // itself, saved with every closing-report save so it can't be lost by
  // choosing the "wrong" of the two save buttons.
  await db
    .update(shifts)
    .set({ incidentReport: String(formData.get("incidentReport") ?? "").trim() || null })
    .where(eq(shifts.id, shiftId));

  const [existing] = await db.select().from(shiftSales).where(eq(shiftSales.shiftId, shiftId));
  if (existing) {
    await db.update(shiftSales).set(salesValues).where(eq(shiftSales.shiftId, shiftId));
  } else {
    await db.insert(shiftSales).values({ shiftId, ...salesValues });
  }

  for (const { platformId, values: finalValues } of platformFinalValues) {
    // Net is derived from the FINAL per-shift figures, after any
    // subtraction — subtraction is linear so either order agrees, but
    // deriving from what gets stored keeps the row self-consistent.
    const netAmount = Math.round((finalValues.salesAmount - finalValues.commissionFee) * 100) / 100;

    const [existingRecord] = await db
      .select()
      .from(onlinePlatformSalesRecords)
      .where(
        and(
          eq(onlinePlatformSalesRecords.shiftId, shiftId),
          eq(onlinePlatformSalesRecords.onlinePlatformId, platformId)
        )
      );

    const values = {
      salesAmount: finalValues.salesAmount,
      commissionFee: finalValues.commissionFee,
      netAmount,
      tipAmountPlatformCourier: finalValues.tipAmountPlatformCourier,
      tipAmountRestaurantDelivery: finalValues.tipAmountRestaurantDelivery,
      taxAmount: finalValues.taxAmount,
    };
    if (existingRecord) {
      await db
        .update(onlinePlatformSalesRecords)
        .set(values)
        .where(eq(onlinePlatformSalesRecords.id, existingRecord.id));
    } else {
      await db.insert(onlinePlatformSalesRecords).values({ shiftId, onlinePlatformId: platformId, ...values });
    }
  }

  // The raw entered numbers survive ONLY here — the sales rows store the
  // per-shift result. A later "why is Dinner's total $3,000 when Toast
  // said $5,000?" must be answerable from the log alone.
  if ((toastSubtraction || platformSubtractions.length > 0) && shiftRow && prior) {
    await logActivity({
      actorEmployeeId: decidedByEmployeeId,
      type: "shift.closing_sales.day_totals_split",
      entityType: "shift",
      entityId: String(shiftId),
      summary:
        `${shiftRow.period} close on ${shiftRow.date}: manager entered whole-day totals; ` +
        `${prior.period}'s saved figures were subtracted before saving` +
        `${toastSubtraction ? " (Toast" : " ("}` +
        `${toastSubtraction && platformSubtractions.length > 0 ? " + " : ""}` +
        `${platformSubtractions.map((p) => p.platformName).join(", ")})`,
      detail: { toast: toastSubtraction, platforms: platformSubtractions },
    });
  }
}

/** Point value overrides live on the closing report, not the roster page —
 * see the comment in addRosterEntry above for why. Only touches rows whose
 * input was actually present on the submitted form (tip-pool-eligible rows
 * render an input; NONE-pool rows like Manager don't, so they're skipped
 * here automatically). Blank input clears the override back to the
 * employee's standing point value. */
/** Per-pool since 2026-08-25 (Oliver: one point moving a Host's weight
 * in Pool 1 AND Pool 2 at once was wrong). The form posts
 * `point_<entryId>_p1|p2|p3` for point-weighted pools only. A pool
 * column is stored only when the submitted value differs from the
 * standing value (an override that overrides nothing is noise); the
 * legacy single `pointValueOverride` is cleared whenever any per-pool
 * field arrived for the entry, because the form displayed values that
 * already resolved it -- leaving it set would resurrect it under a
 * pool column that went back to null. */
async function upsertPointOverrides(shiftId: number, formData: FormData, decidedByEmployeeId: number) {
  const rosterRows = await db
    .select({
      id: shiftRosterEntries.id,
      standingPoint: employeePositions.tipPointValue,
    })
    .from(shiftRosterEntries)
    .leftJoin(
      employeePositions,
      and(
        eq(employeePositions.employeeId, shiftRosterEntries.employeeId),
        eq(employeePositions.positionId, shiftRosterEntries.positionId)
      )
    )
    .where(eq(shiftRosterEntries.shiftId, shiftId));

  const POOL_FIELDS = [
    ["p1", "pointOverridePool1"],
    ["p2", "pointOverridePool2"],
    ["p3", "pointOverridePool3"],
  ] as const;

  for (const entry of rosterRows) {
    const standing = entry.standingPoint ?? 1.0;
    const set: Partial<
      Record<(typeof POOL_FIELDS)[number][1] | "pointValueOverride", number | null>
    > & { pointDecidedAt?: string | null; pointDecidedByEmployeeId?: number | null } = {};
    let touched = false;
    // A row with no standing point is one the gate cares about: its point
    // would otherwise resolve to the bare 1.0 fallback. Track whether EVERY
    // point field the form rendered for it actually arrived filled --
    // partial is not decided, and a Host off-role has one field per pool.
    const isUndecidable = entry.standingPoint == null;
    let fieldsPresent = 0;
    let fieldsFilled = 0;
    for (const [suffix, column] of POOL_FIELDS) {
      const raw = formData.get(`point_${entry.id}_${suffix}`);
      if (raw == null) continue;
      const trimmed = String(raw).trim();
      const value = trimmed === "" ? null : Number(trimmed);
      if (value != null && Number.isNaN(value)) continue;
      touched = true;
      fieldsPresent += 1;
      if (value != null) fieldsFilled += 1;
      set[column] = value != null && value !== standing ? value : null;
    }
    if (!touched) continue;
    set.pointValueOverride = null;
    // Stamp the decision separately from the value (2026-08-29). It cannot
    // be read back off the columns above: an entered value equal to the
    // resolved standing value is stored as null by the noise rule, so a
    // manager deliberately confirming 1.0 would be indistinguishable from
    // an untouched row. Clearing every field un-decides the row again, so
    // the gate re-arms rather than passing on a stale stamp.
    if (isUndecidable) {
      const decided = fieldsPresent > 0 && fieldsFilled === fieldsPresent;
      set.pointDecidedAt = decided ? new Date().toISOString() : null;
      set.pointDecidedByEmployeeId = decided ? decidedByEmployeeId : null;
    }
    await db.update(shiftRosterEntries).set(set).where(eq(shiftRosterEntries.id, entry.id));
  }
}

/** "Bonus metrics" live in the generic metricValues table. Two distinct
 * field naming patterns, deliberately disambiguated so the regex can't
 * mix them up:
 *   - `metric_shift_<metricDefinitionId>` — ONE value for the whole shift
 *     (e.g. the host team's shared drink count — corrected 2026-08-10,
 *     was per-employee before). Stored with employeeId = null.
 *   - `metric_emp_<metricDefinitionId>_<employeeId>` — one value per
 *     eligible person (for a future metric that genuinely is per-employee).
 * Rendered only for eligible (position, metric) pairs by loadClosingReportData,
 * so this just scans for whatever showed up rather than re-deriving
 * eligibility server-side — same trust-the-rendered-form pattern as
 * upsertPointOverrides above. Blank/0 clears it back to 0 (no bonus). */
async function upsertMetricValues(shiftId: number, formData: FormData) {
  for (const [key, raw] of formData.entries()) {
    const trimmed = String(raw).trim();
    const value = trimmed === "" ? 0 : Number(trimmed);
    if (Number.isNaN(value)) continue;

    const shiftMatch = /^metric_shift_(\d+)$/.exec(key);
    if (shiftMatch) {
      const metricDefinitionId = Number(shiftMatch[1]);
      const [existing] = await db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.shiftId, shiftId),
            eq(metricValues.metricDefinitionId, metricDefinitionId),
            isNull(metricValues.employeeId)
          )
        );
      if (existing) {
        await db.update(metricValues).set({ value }).where(eq(metricValues.id, existing.id));
      } else {
        await db.insert(metricValues).values({ shiftId, metricDefinitionId, employeeId: null, value });
      }
      continue;
    }

    const empMatch = /^metric_emp_(\d+)_(\d+)$/.exec(key);
    if (empMatch) {
      const metricDefinitionId = Number(empMatch[1]);
      const employeeId = Number(empMatch[2]);
      const [existing] = await db
        .select()
        .from(metricValues)
        .where(
          and(
            eq(metricValues.shiftId, shiftId),
            eq(metricValues.metricDefinitionId, metricDefinitionId),
            eq(metricValues.employeeId, employeeId)
          )
        );
      if (existing) {
        await db.update(metricValues).set({ value }).where(eq(metricValues.id, existing.id));
      } else {
        await db.insert(metricValues).values({ shiftId, metricDefinitionId, employeeId, value });
      }
    }
  }
}

/** Wage adjustments (2026-08-10) — optional per-employee override + extra
 * pay for shift-coverage situations, PLUS disciplinary/correction
 * deductions (added later same day, same row/timing/trust level — see
 * shiftWageAdjustments' schema comment). Trust-the-rendered-form pattern
 * again: scan for whichever employeeIds actually have inputs
 * (loadClosingReportData renders one row per roster employee), no need to
 * re-derive who's on the roster here. Fields:
 *   - wageOverride_<employeeId>: blank = null (use auto wage), else replaces it.
 *   - extraPay_<employeeId>: blank/0 = 0 (no extra pay), always additive.
 *   - wageReason_<employeeId>: optional free-text note, blank = null.
 *   - deduction_<employeeId>: blank/0 = 0 (no deduction), always subtractive.
 *   - deductionReason_<employeeId>: optional free-text note, blank = null.
 * Skips writing a row at all if every amount is blank/0 and there's no
 * existing row, so a shift with no adjustments doesn't accumulate empty
 * rows. A negative deduction amount is treated as invalid input (skipped,
 * same as NaN) — the field is meant to hold a positive dollar amount to
 * subtract, not a signed delta. */
async function upsertWageAdjustments(shiftId: number, formData: FormData) {
  const employeeIds = new Set<number>();
  for (const key of formData.keys()) {
    const match = /^(?:wageOverride|extraPay|wageReason|deduction|deductionReason)_(\d+)$/.exec(key);
    if (match) employeeIds.add(Number(match[1]));
  }

  for (const employeeId of employeeIds) {
    const overrideRaw = String(formData.get(`wageOverride_${employeeId}`) ?? "").trim();
    const extraRaw = String(formData.get(`extraPay_${employeeId}`) ?? "").trim();
    const reasonRaw = String(formData.get(`wageReason_${employeeId}`) ?? "").trim();
    const deductionRaw = String(formData.get(`deduction_${employeeId}`) ?? "").trim();
    const deductionReasonRaw = String(formData.get(`deductionReason_${employeeId}`) ?? "").trim();

    const wageOverrideAmount = overrideRaw === "" ? null : Number(overrideRaw);
    if (wageOverrideAmount != null && Number.isNaN(wageOverrideAmount)) continue;
    const extraPayAmount = extraRaw === "" ? 0 : Number(extraRaw);
    if (Number.isNaN(extraPayAmount)) continue;
    const reason = reasonRaw === "" ? null : reasonRaw;
    const deductionAmount = deductionRaw === "" ? 0 : Number(deductionRaw);
    if (Number.isNaN(deductionAmount) || deductionAmount < 0) continue;
    const deductionReason = deductionReasonRaw === "" ? null : deductionReasonRaw;

    const [existing] = await db
      .select()
      .from(shiftWageAdjustments)
      .where(and(eq(shiftWageAdjustments.shiftId, shiftId), eq(shiftWageAdjustments.employeeId, employeeId)));

    if (
      !existing &&
      wageOverrideAmount === null &&
      extraPayAmount === 0 &&
      reason === null &&
      deductionAmount === 0 &&
      deductionReason === null
    )
      continue;

    if (existing) {
      await db
        .update(shiftWageAdjustments)
        .set({ wageOverrideAmount, extraPayAmount, reason, deductionAmount, deductionReason })
        .where(eq(shiftWageAdjustments.id, existing.id));
    } else {
      await db
        .insert(shiftWageAdjustments)
        .values({ shiftId, employeeId, wageOverrideAmount, extraPayAmount, reason, deductionAmount, deductionReason });
    }
  }
}

/** The actual write step — computes via the shared helper (same one the
 * Preview page uses) and writes the locked snapshot. Chosen deliberately
 * over recompute-on-view for the Summary Report: a closing report is a
 * historical record and shouldn't silently change if settings (deduction
 * rate, split method, point values) change later. */
async function runFinalize(shiftId: number, finalizedByEmployeeId: number) {
  await assertEveryPointDecided(shiftId);
  // Compute + write both now live in finalizeShiftWrites.ts (2026-08-10) —
  // shared with db/seed.ts, which needs to finalize a whole week of test
  // shifts at once. See that file's header comment.
  await finalizeShiftWrites(shiftId, finalizedByEmployeeId);
}

/** The real tip-point gate (2026-08-29). The closing report disables its
 * own button, but a disabled button is a hint, not a gate — this is the
 * check that actually stands between an undecided point and a locked
 * payroll record.
 *
 * Deliberately here in runFinalize rather than inside finalizeShiftWrites:
 * the only two callers of that function are this one and db/seed.ts, and
 * the seed legitimately finalizes a week of fixture shifts in bulk with no
 * manager present to decide anything. Gating the action path covers every
 * way a real user reaches finalization (verified: confirmFinalize is the
 * sole caller of runFinalize) without breaking the fixture path. */
async function assertEveryPointDecided(shiftId: number) {
  const undecided = await loadUndecidedPointRows(shiftId);
  if (undecided.length === 0) return;
  throw new Error(
    `Set a tip point for ${describeUndecided(undecided)} before finalizing — they aren't set up ` +
      `for that position, so nobody has decided their share yet. Enter it in the Tip points ` +
      `section of the closing report.`
  );
}

async function assertDraft(shiftId: number) {
  const [shift] = await db.select().from(shifts).where(eq(shifts.id, shiftId));
  if (!shift) throw new Error("Shift not found");
  if (shift.status === "finalized") {
    throw new Error("This shift is already finalized and locked — view the Summary Report instead.");
  }
}
