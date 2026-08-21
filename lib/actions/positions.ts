"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { positions, positionTipPools, positionShiftRates } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { requireCapability } from "@/lib/permissions/requireCapability";

export interface PositionActionState {
  error: string | null;
}

/** 2026-08-21 — server-action auth audit: this file had NO auth check at
 * all — same gap class as employees.ts/tipPools.ts/payroll.ts/
 * permissions.ts, see project_atlas_security_audit_2026_08_17 memory.
 * Same established pattern, copied as-is. */
async function requireManagerAction() {
  const session = await getCurrentStaffSession();
  if (!session || (session.systemRole !== "MANAGER" && session.systemRole !== "ADMIN")) {
    throw new Error("Not authorized.");
  }
  return session;
}

/** Same "gather + validate, redirect() outside the try/catch" pattern as
 * lib/actions/shift.ts — see saveClosingReportAndPreview for the original
 * reasoning: an uncaught error would otherwise render Next.js's generic
 * error page, not something a restaurant manager should ever see. */
function readPositionForm(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const category = String(formData.get("category") ?? "");
  if (!name) throw new Error("Position name is required");
  if (category !== "FOH" && category !== "BOH") throw new Error("Category must be FOH or BOH");

  const defaultTipPointValueRaw = formData.get("defaultTipPointValue");
  const defaultTipPointValue =
    defaultTipPointValueRaw && String(defaultTipPointValueRaw).trim() !== ""
      ? Number(defaultTipPointValueRaw)
      : null;

  const tipPoolGroups = formData
    .getAll("tipPoolGroups")
    .map((v) => String(v))
    .filter((v): v is "POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY" =>
      ["POOL_1_DINE_IN", "POOL_2_TAKEOUT_ONLINE", "POOL_3_DELIVERY"].includes(v)
    );

  const alwaysVisibleInRoster = formData.get("alwaysVisibleInRoster") === "on";
  const earningsHiddenFromStaff = formData.get("earningsHiddenFromStaff") === "on";

  // FOH-only flat rates. BOH wage is per-employee (EmployeeWageRate) —
  // there's no UI for that yet, see PROGRESS.md's open items; a BOH
  // position simply has no shiftRates rows and its wage stays whatever was
  // seeded/entered directly until Employee admin ships.
  const shiftRates: { period: "Lunch" | "Dinner"; flatRate: number }[] = [];
  if (category === "FOH") {
    for (const period of ["Lunch", "Dinner"] as const) {
      const raw = formData.get(`shiftRate_${period}`);
      if (raw !== null && String(raw).trim() !== "") {
        const flatRate = Number(raw);
        if (Number.isNaN(flatRate) || flatRate < 0) {
          throw new Error(`${period} rate must be a non-negative number`);
        }
        shiftRates.push({ period, flatRate });
      }
    }
  }

  return {
    name,
    category: category as "FOH" | "BOH",
    defaultTipPointValue,
    tipPoolGroups,
    alwaysVisibleInRoster,
    earningsHiddenFromStaff,
    shiftRates,
  };
}

/** Replaces a position's positionTipPools + positionShiftRates rows to
 * match the form submission exactly (delete-then-reinsert is simplest and
 * safe here — these are small, position-scoped join tables, not anything
 * with foreign keys pointing INTO them from historical data). */
async function syncPositionChildRows(
  positionId: number,
  tipPoolGroups: ("POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY")[],
  shiftRates: { period: "Lunch" | "Dinner"; flatRate: number }[]
) {
  await db.delete(positionTipPools).where(eq(positionTipPools.positionId, positionId));
  if (tipPoolGroups.length > 0) {
    await db.insert(positionTipPools).values(tipPoolGroups.map((tipPoolGroup) => ({ positionId, tipPoolGroup })));
  }

  await db.delete(positionShiftRates).where(eq(positionShiftRates.positionId, positionId));
  if (shiftRates.length > 0) {
    await db.insert(positionShiftRates).values(shiftRates.map((r) => ({ positionId, period: r.period, flatRate: r.flatRate })));
  }
}

export async function createPosition(_prevState: PositionActionState, formData: FormData): Promise<PositionActionState> {
  let positionId: number;
  try {
    await requireManagerAction();
    const parsed = readPositionForm(formData);

    const [existing] = await db.select().from(positions).where(eq(positions.name, parsed.name));
    if (existing) throw new Error(`A position named "${parsed.name}" already exists`);

    // Same reduction as updatePosition below -- creating a position
    // already IN a pool is a pool-structure change too. Creating one
    // with no pool membership stays plain manager work.
    if (parsed.tipPoolGroups.length > 0) {
      await requireCapability("TIP_POOL_STRUCTURE_EDIT");
    }

    const [created] = await db
      .insert(positions)
      .values({
        name: parsed.name,
        category: parsed.category,
        defaultTipPointValue: parsed.defaultTipPointValue,
        alwaysVisibleInRoster: parsed.alwaysVisibleInRoster,
        earningsHiddenFromStaff: parsed.earningsHiddenFromStaff,
        active: true,
      })
      .returning();
    positionId = created.id;

    await syncPositionChildRows(positionId, parsed.tipPoolGroups, parsed.shiftRates);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/positions");
  redirect("/positions");
}

export async function updatePosition(_prevState: PositionActionState, formData: FormData): Promise<PositionActionState> {
  const positionId = Number(formData.get("positionId"));
  if (!positionId) return { error: "Missing position id" };

  try {
    await requireManagerAction();
    const parsed = readPositionForm(formData);

    const [existing] = await db.select().from(positions).where(eq(positions.name, parsed.name));
    if (existing && existing.id !== positionId) {
      throw new Error(`A position named "${parsed.name}" already exists`);
    }

    const currentPools = (
      await db
        .select({ tipPoolGroup: positionTipPools.tipPoolGroup })
        .from(positionTipPools)
        .where(eq(positionTipPools.positionId, positionId))
    ).map((r) => r.tipPoolGroup);

    await db
      .update(positions)
      .set({
        name: parsed.name,
        category: parsed.category,
        defaultTipPointValue: parsed.defaultTipPointValue,
        alwaysVisibleInRoster: parsed.alwaysVisibleInRoster,
        earningsHiddenFromStaff: parsed.earningsHiddenFromStaff,
      })
      .where(eq(positions.id, positionId));

    // Tip pool membership is ALSO editable here, as checkboxes on the
    // position form -- a second door into the same positionTipPools data
    // the /settings/tip-pools board writes (see that page's own comment:
    // "not a fork -- both read/write the one table"). Phase B put the
    // board's own actions behind TIP_POOL_STRUCTURE_EDIT (Admin+Partner,
    // Oliver's confirmed intentional reduction: pool structure is
    // foundational config decided collectively by owners, not day-to-day
    // manager work) but left this door open, so the reduction wasn't
    // actually in force -- a Floor Manager refused on the board could
    // still tick a box here and save. Found by the Phase C re-review.
    //
    // Scoped to an ACTUAL membership change, not to editing a position
    // at all: renaming a position or changing its wage rate stays plain
    // manager work. Comparing sets rather than gating the whole action
    // keeps the reduction exactly as narrow as it was confirmed to be.
    if (poolMembershipChanged(currentPools, parsed.tipPoolGroups)) {
      await requireCapability("TIP_POOL_STRUCTURE_EDIT");
    }

    await syncPositionChildRows(positionId, parsed.tipPoolGroups, parsed.shiftRates);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/positions");
  redirect("/positions");
}

/** Order-insensitive set comparison -- the form submits checkbox values
 * in DOM order and the stored rows come back in insertion order, so a
 * plain join/compare would report a false change. */
function poolMembershipChanged(current: string[], next: string[]): boolean {
  if (current.length !== next.length) return true;
  const currentSet = new Set(current);
  return next.some((pool) => !currentSet.has(pool));
}

/** Retire/reactivate — never a hard delete. A retired position stops being
 * offered when staffing NEW shifts (see loadRosterPageData's active
 * filter) but stays valid for every historical shift that already
 * reference it — roster entries, wage rates, tip pool calcs all keep
 * working exactly as before. Plain (non-form-state) action since there's
 * no form to show inline errors on — just a button. */
export async function togglePositionActive(positionId: number, nextActive: boolean) {
  await requireManagerAction();
  await db.update(positions).set({ active: nextActive }).where(eq(positions.id, positionId));
  revalidatePath("/positions");
}
