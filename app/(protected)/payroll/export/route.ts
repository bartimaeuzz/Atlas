import { NextRequest, NextResponse } from "next/server";
import { requireCapabilityRoute } from "@/lib/auth/requireRouteAccess";
import { loadPayrollRegister } from "@/lib/payroll/loadPayrollRegister";
import { buildPayrollWorkbook } from "@/lib/payroll/buildPayrollWorkbook";
import { weekStartFor } from "@/lib/schedule/weekMath";

/** Downloads the 3-sheet payroll .xlsx (Check Export / Pay Stub Detail /
 * Wage Acknowledgment) for one Monday-Sunday week (2026-08-17). Works
 * for both a draft week (live numbers) and a paid week (the locked
 * snapshot) -- loadPayrollRegister already returns whichever applies. */
export async function GET(request: NextRequest) {
  // Auth added 2026-08-21 (Phase C scrutinize): this handler had none,
  // and it returns every employee's wages and pay-stub detail for the
  // week. It then held the same coarse manager bar the page does, with a
  // note to tighten it once a capability existed.
  //
  // Tightened 2026-08-23 to FA_PAYROLL_PRINT_EXPORT -- the registry key
  // that had been describing exactly this and enforcing nothing. Being a
  // MANAGER is no longer enough to download every employee's wages; the
  // capability has to be granted.
  const denied = await requireCapabilityRoute("FA_PAYROLL_PRINT_EXPORT");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const weekParam = searchParams.get("week");
  if (!weekParam || !/^\d{4}-\d{2}-\d{2}$/.test(weekParam)) {
    return NextResponse.json({ error: "Missing or invalid week" }, { status: 400 });
  }
  const weekStart = weekStartFor(weekParam);

  const register = await loadPayrollRegister(weekStart);
  if (register.rows.length === 0) {
    return NextResponse.json({ error: "Nothing to export for this week yet" }, { status: 400 });
  }

  const buffer = await buildPayrollWorkbook(register);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Payroll_${register.weekStartDate}_to_${register.weekEndDate}.xlsx"`,
    },
  });
}
