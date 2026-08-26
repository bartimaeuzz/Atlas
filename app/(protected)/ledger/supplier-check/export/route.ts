import { NextRequest, NextResponse } from "next/server";
import { businessTodayIso } from "@/lib/formatDateTime";
import { requireCapabilityRoute } from "@/lib/auth/requireRouteAccess";
import { loadSupplierCheckReportByIds } from "@/lib/reports/loadSupplierCheckReport";
import { buildSupplierCheckWorkbook } from "@/lib/reports/buildSupplierCheckWorkbook";

/** Downloads a .xlsx for a specific set of just-printed checks
 * (2026-08-14) -- triggered right after printSupplierCheck (the instant
 * per-vendor path) or printAllPendingChecks (the weekly batch), so the
 * manager can immediately print the physical checks. Distinct from
 * /reports/export-supplier-check, which is a date-range accounting
 * export; this one is scoped to exact payment ids since "today" could
 * have other, unrelated checks on it too.
 *
 * Uses the "print" workbook variant (2026-08-15, Oliver: this file
 * "will be export to check printing software" so it shouldn't carry
 * PayeeAddress/Status/Check # -- see buildSupplierCheckWorkbook's own
 * comment for the full reasoning and the "audit" variant used by the
 * /reports export instead). */
export async function GET(request: NextRequest) {
  // Auth added 2026-08-21 (Phase C scrutinize): this handler had none.
  // Same capability as the Supplier Check page it is triggered from.
  const denied = await requireCapabilityRoute("VIEW_LEDGER_OVERVIEW");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const idsParam = searchParams.get("paymentIds");
  if (!idsParam) {
    return NextResponse.json({ error: "Missing paymentIds" }, { status: 400 });
  }
  const paymentIds = idsParam
    .split(",")
    .map((s) => Number(s))
    .filter((n) => Number.isFinite(n) && n > 0);
  if (paymentIds.length === 0) {
    return NextResponse.json({ error: "No valid paymentIds" }, { status: 400 });
  }

  const data = await loadSupplierCheckReportByIds(paymentIds);
  const today = businessTodayIso();
  const buffer = await buildSupplierCheckWorkbook(data, today, today, "print");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Supplier-Checks_${today}.xlsx"`,
    },
  });
}
