import { NextRequest, NextResponse } from "next/server";
import { loadSupplierCheckReport } from "@/lib/reports/loadSupplierCheckReport";
import { buildSupplierCheckWorkbook } from "@/lib/reports/buildSupplierCheckWorkbook";

/** Downloads the Supplier Check report as .xlsx (2026-08-14) -- same
 * Route Handler pattern as /reports/export (a server action can't set
 * Content-Disposition to trigger a download). Reuses the exact loader
 * the on-page preview uses. Columns match the DNA "Export" sheet's own
 * layout (Pay/Amount/Memo/PayeeName/PayeeAddress), plus Check #/Status
 * for bookkeeping -- this is the "audit" workbook variant (2026-08-15),
 * distinct from the trimmed "print" variant used by
 * /ledger/supplier-check/export, which feeds check-printing software
 * directly and doesn't need PayeeAddress/Status/Check # cluttering that
 * import. See buildSupplierCheckWorkbook's own comment for the full
 * reasoning. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to date" }, { status: 400 });
  }

  const data = await loadSupplierCheckReport(from, to);
  const buffer = await buildSupplierCheckWorkbook(data, from, to, "audit");

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Supplier-Check-Report_${from}_to_${to}.xlsx"`,
    },
  });
}
