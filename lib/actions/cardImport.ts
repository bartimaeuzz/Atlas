"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { cardStatementPeriods, cardTransactions, ledgerCards, ledgerCategories } from "@/db/schema";
import { requireCapability } from "@/lib/permissions/requireCapability";
import { logActivityStatement, logMoney } from "@/lib/activityLog/log";
import {
  parseCsvStatement,
  parsePdfStatementText,
  markDuplicates,
  validateCommitRows,
  isParseFailure,
  type ParsedStatementRow,
} from "@/lib/import/cardStatement";

/** Card statement import (2026-08-24) — the wire behind
 * FA_LEDGER_CARD_IMPORT, which was defined ahead of the feature on
 * 2026-08-23. Lives in its own file rather than card.ts: everything here
 * is capability-gated, while card.ts's day-to-day entry deliberately
 * stays on its coarse requireManagerAction() (see that file's header for
 * the registry-gap reasoning).
 *
 * Two actions, matching the shape a manager actually works in:
 * parseStatementUpload turns the file into candidate rows and WRITES
 * NOTHING; the human reviews/categorizes/excludes on the client; then
 * commitStatementImport re-validates every posted row against data this
 * server loaded itself (rule 6: never trust the client's JSON on a money
 * path) and lands one bulk insert atomically with its activity-log row. */

const MAX_FILE_BYTES = 4 * 1024 * 1024; // matches next.config's 4mb action body cap (Vercel hard-caps at 4.5)

export interface ImportParseState {
  error: string | null;
  /** Nonce for the client's adopt-once logic: "Start over" must not
   * re-adopt the previous result, and re-uploading a same-named file
   * must still adopt the new one. The filename can't distinguish those
   * two cases; a per-parse stamp can (scrutinize finding, 2026-08-24). */
  parsedAt?: number;
  fileName?: string;
  rows?: ParsedStatementRow[];
  signsFlipped?: boolean;
  skippedLines?: number;
  postDatesOnly?: boolean;
}

async function loadEditablePeriod(periodId: number, systemRole: string) {
  const [period] = await db
    .select({
      id: cardStatementPeriods.id,
      periodStart: cardStatementPeriods.periodStart,
      periodEnd: cardStatementPeriods.periodEnd,
      status: cardStatementPeriods.status,
      cardName: ledgerCards.name,
    })
    .from(cardStatementPeriods)
    .innerJoin(ledgerCards, eq(cardStatementPeriods.cardId, ledgerCards.id))
    .where(eq(cardStatementPeriods.id, periodId));
  if (!period) throw new Error("Statement period not found");
  if (period.status === "reconciled" && systemRole !== "ADMIN") {
    throw new Error("This period is already reconciled — can't import into it.");
  }
  return period;
}

export async function parseStatementUpload(
  _prev: ImportParseState,
  formData: FormData
): Promise<ImportParseState> {
  try {
    const session = await requireCapability("FA_LEDGER_CARD_IMPORT");
    const periodId = Number(formData.get("periodId"));
    if (!periodId) throw new Error("Missing statement period");
    const period = await loadEditablePeriod(periodId, session.systemRole);

    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF or CSV file first.");
    if (file.size > MAX_FILE_BYTES) {
      throw new Error("That file is over 4 MB. Download the CSV version from the bank's website instead — it's much smaller.");
    }

    const name = file.name.toLowerCase();
    const isCsv = name.endsWith(".csv") || file.type === "text/csv";
    const isPdf = name.endsWith(".pdf") || file.type === "application/pdf";
    if (!isCsv && !isPdf) throw new Error("Only PDF or CSV statement files are supported.");

    let result;
    if (isCsv) {
      result = parseCsvStatement(await file.text());
    } else {
      // unpdf is imported lazily: it pulls in pdfjs, which only the PDF
      // path pays for.
      const { extractText, getDocumentProxy } = await import("unpdf");
      const buf = new Uint8Array(await file.arrayBuffer());
      const pdf = await getDocumentProxy(buf);
      const { text } = await extractText(pdf, { mergePages: false });
      const pages = Array.isArray(text) ? text : [text];
      result = parsePdfStatementText(pages, period.periodStart, period.periodEnd);
    }
    if (isParseFailure(result)) return { error: result.failure };

    // Warn-only duplicate marking against what's already in this period.
    const existing = await db
      .select({ date: cardTransactions.date, amount: cardTransactions.amount })
      .from(cardTransactions)
      .where(eq(cardTransactions.statementPeriodId, periodId));
    const rows = markDuplicates(result.rows, existing);

    return {
      error: null,
      parsedAt: Date.now(),
      fileName: file.name,
      rows,
      signsFlipped: result.signsFlipped,
      skippedLines: result.skippedLines,
      postDatesOnly: result.postDatesOnly,
    };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

export interface ImportCommitState {
  error: string | null;
}

export async function commitStatementImport(
  _prev: ImportCommitState,
  formData: FormData
): Promise<ImportCommitState> {
  const periodId = Number(formData.get("periodId"));
  try {
    const session = await requireCapability("FA_LEDGER_CARD_IMPORT");
    if (!periodId) throw new Error("Missing statement period");
    const period = await loadEditablePeriod(periodId, session.systemRole);

    let raw: unknown;
    try {
      raw = JSON.parse(String(formData.get("rowsJson") ?? ""));
    } catch {
      throw new Error("Rows were malformed — re-upload the file and try again.");
    }

    const activeCats = await db
      .select({ id: ledgerCategories.id })
      .from(ledgerCategories)
      .where(eq(ledgerCategories.active, true));
    const validated = validateCommitRows(raw, new Set(activeCats.map((c) => c.id)));
    if ("failure" in validated) throw new Error(validated.failure);

    const fileName = String(formData.get("fileName") ?? "statement file").slice(0, 200);
    const net = validated.rows.reduce((s, r) => s + r.amount, 0);

    // One bulk insert, atomic with its log row — same db.batch pattern
    // lib/actions/ledger.ts uses so a money record can't land untracked.
    await db.batch([
      db.insert(cardTransactions).values(
        validated.rows.map((r) => ({
          statementPeriodId: periodId,
          date: r.date,
          categoryId: r.categoryId,
          memo: r.memo || null,
          amount: r.amount,
          createdByEmployeeId: session.id,
        }))
      ),
      logActivityStatement({
        actorEmployeeId: session.id,
        type: "ledger_card.import.committed",
        entityType: "card_statement_period",
        entityId: String(periodId),
        summary: `Imported ${validated.rows.length} transaction${validated.rows.length === 1 ? "" : "s"} (${logMoney(net)} net) from "${fileName}" into ${period.cardName} period ${period.periodStart} – ${period.periodEnd}`,
        detail: { fileName, rowCount: validated.rows.length, net },
      }),
    ]);
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }

  revalidatePath("/ledger/card/period");
  revalidatePath("/ledger/card");
  redirect(`/ledger/card/period?id=${periodId}`);
}
