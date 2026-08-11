import { NextRequest, NextResponse } from "next/server";
import { loadSalesTaxReport } from "@/lib/reports/loadSalesTaxReport";
import { buildSalesTaxWorkbook } from "@/lib/reports/buildSalesTaxWorkbook";

/** Downloads the sales/tax report as .xlsx (2026-08-10) — a Route Handler
 * rather than a server action, since a server action can't set the
 * Content-Disposition header needed to trigger a file download in the
 * browser. Reuses the exact same loader the on-page preview uses, so the
 * downloaded file and what you see on /reports always match. .xlsx opens
 * directly in Google Sheets via upload/import — Oliver's stated normal
 * workflow — without needing any Google API integration. */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  if (!from || !to) {
    return NextResponse.json({ error: "Missing from/to date" }, { status: 400 });
  }

  const data = await loadSalesTaxReport(from, to);
  const buffer = await buildSalesTaxWorkbook(data);

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="Sales-Tax-Report_${from}_to_${to}.xlsx"`,
    },
  });
}
