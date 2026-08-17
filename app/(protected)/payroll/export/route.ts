import { NextRequest, NextResponse } from "next/server";
import { loadPayrollRegister } from "@/lib/payroll/loadPayrollRegister";
import { buildPayrollWorkbook } from "@/lib/payroll/buildPayrollWorkbook";
import { weekStartFor } from "@/lib/schedule/weekMath";

/** Downloads the 3-sheet payroll .xlsx (Check Export / Pay Stub Detail /
 * Wage Acknowledgment) for one Monday-Sunday week (2026-08-17). Works
 * for both a draft week (live numbers) and a paid week (the locked
 * snapshot) -- loadPayrollRegister already returns whichever applies. */
export async function GET(request: NextRequest) {
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
