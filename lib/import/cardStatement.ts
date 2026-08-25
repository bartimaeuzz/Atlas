import Papa from "papaparse";

/** Card statement file parsing (2026-08-24) — pure text-in, rows-out, so
 * every shape is unit-testable without touching files or the DB. The
 * server action (lib/actions/cardImport.ts) owns file handling, auth,
 * and PDF text extraction; this module owns turning text into candidate
 * transaction rows in Atlas's sign convention: charge POSITIVE, refund/
 * credit NEGATIVE (matching cardTransactions.amount, db/schema.ts).
 *
 * Nothing here writes anything. Rows go to a human review screen first —
 * rule 6 (money conservative): a bank file never inserts directly. */

export interface ParsedStatementRow {
  date: string; // ISO YYYY-MM-DD
  memo: string;
  amount: number; // charge positive, refund negative
  duplicate?: boolean;
}

export interface ParseResult {
  rows: ParsedStatementRow[];
  /** True when the file's charges were negative (Chase-style export) and
   * every sign was flipped to Atlas's charge-positive convention. The
   * review screen surfaces this so a human sanity-checks a few rows. */
  signsFlipped: boolean;
  /** Non-empty lines that looked like data but couldn't be read. Shown in
   * review ("N lines couldn't be read and were skipped") so a truncated
   * parse never silently passes as a complete one. */
  skippedLines: number;
  /** True when the CSV's only date column was a post-date one ("Posted
   * Date" etc.) -- the bank's processing date, not the purchase date.
   * P&L buckets card expenses by cardTransactions.date (charge date), so
   * the review screen warns that these dates may sit a day or two late.
   * Column CHOICE is unchanged from before this flag existed; this only
   * records which flavor won. Always false for PDF statements. */
  postDatesOnly: boolean;
}

export interface ParseFailure {
  /** One human sentence for the Banner. */
  failure: string;
}

export function isParseFailure(r: ParseResult | ParseFailure): r is ParseFailure {
  return "failure" in r;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** MM/DD/YYYY, MM/DD/YY or YYYY-MM-DD -> ISO, or null. */
function toIsoDate(raw: string): string | null {
  const s = raw.trim();
  if (ISO_DATE.test(s)) return s;
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}(?:\d{2})?)$/);
  if (!m) return null;
  const [, mo, d, y] = m;
  const year = y.length === 2 ? `20${y}` : y;
  const month = mo.padStart(2, "0");
  const day = d.padStart(2, "0");
  if (Number(month) < 1 || Number(month) > 12 || Number(day) < 1 || Number(day) > 31) return null;
  return `${year}-${month}-${day}`;
}

/** "$1,234.56", "(12.34)", "-12.34", "12.34 CR" -> signed number, or null.
 * Parentheses and a trailing CR both mean credit (negative). */
function parseAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) return null;
  let negative = false;
  if (/\bCR\b\s*$/i.test(s)) {
    negative = true;
    s = s.replace(/\bCR\b\s*$/i, "").trim();
  }
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (s.startsWith("-")) {
    negative = !negative;
    s = s.slice(1);
  }
  s = s.replace(/[$,\s]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** If a strict majority of nonzero amounts are negative, the bank exports
 * charges as negative (Chase does); flip every sign so charges are
 * positive per Atlas convention. Debit/Credit-column files never take
 * this path — their signs are explicit. */
function normalizeSigns(rows: ParsedStatementRow[]): { rows: ParsedStatementRow[]; signsFlipped: boolean } {
  const nonzero = rows.filter((r) => r.amount !== 0);
  const negatives = nonzero.filter((r) => r.amount < 0).length;
  if (nonzero.length === 0 || negatives * 2 <= nonzero.length) return { rows, signsFlipped: false };
  return { rows: rows.map((r) => ({ ...r, amount: -r.amount })), signsFlipped: true };
}

function headerIndex(fields: string[], candidates: string[]): number {
  const lower = fields.map((f) => f.trim().toLowerCase());
  for (const c of candidates) {
    const i = lower.findIndex((f) => f === c || f.startsWith(c));
    if (i !== -1) return i;
  }
  return -1;
}

const NO_ROWS_CSV = "Couldn't find any transactions in this CSV. Check that it's the transactions export from the bank's website, not a summary.";

export function parseCsvStatement(text: string): ParseResult | ParseFailure {
  // Strip BOM; banks sometimes prepend junk lines before the real header —
  // scan for the first line that mentions a date column and an amount-ish
  // column, and parse from there.
  const clean = text.replace(/^﻿/, "");
  const lines = clean.split(/\r?\n/);
  const headerLineIdx = lines.findIndex((l) => {
    const low = l.toLowerCase();
    return low.includes("date") && (low.includes("amount") || low.includes("debit") || low.includes("credit"));
  });
  if (headerLineIdx === -1) return { failure: NO_ROWS_CSV };

  const parsed = Papa.parse<string[]>(lines.slice(headerLineIdx).join("\n"), { skipEmptyLines: true });
  const data = parsed.data;
  if (data.length < 2) return { failure: NO_ROWS_CSV };

  const header = data[0];
  // Same matching semantics as the original single lookup (candidate
  // order already preferred "transaction date"/"date" over post-date
  // columns) -- split only to record which flavor won, for the
  // postDatesOnly warning. Note "posted date".startsWith("date") is
  // false, so the generic "date" candidate can't grab a post column.
  const txDateIdx = headerIndex(header, ["transaction date", "trans date", "date"]);
  const postDateIdx = headerIndex(header, ["posted date", "post date", "posting date"]);
  const dateIdx = txDateIdx !== -1 ? txDateIdx : postDateIdx;
  const postDatesOnly = txDateIdx === -1 && postDateIdx !== -1;
  const memoIdx = headerIndex(header, ["description", "memo", "details", "payee", "name"]);
  const amountIdx = headerIndex(header, ["amount"]);
  const debitIdx = headerIndex(header, ["debit"]);
  const creditIdx = headerIndex(header, ["credit"]);
  if (dateIdx === -1 || (amountIdx === -1 && debitIdx === -1 && creditIdx === -1)) {
    return { failure: NO_ROWS_CSV };
  }

  const rows: ParsedStatementRow[] = [];
  let skippedLines = 0;
  for (const cells of data.slice(1)) {
    if (cells.every((c) => !c || !c.trim())) continue;
    const date = toIsoDate(cells[dateIdx] ?? "");
    const memo = (memoIdx !== -1 ? (cells[memoIdx] ?? "") : "").trim();
    let amount: number | null = null;
    if (debitIdx !== -1 || creditIdx !== -1) {
      // Two-column shape: debit = charge (+), credit = refund (−). Exactly
      // one side is filled on a well-formed row.
      const debit = debitIdx !== -1 ? parseAmount(cells[debitIdx] ?? "") : null;
      const credit = creditIdx !== -1 ? parseAmount(cells[creditIdx] ?? "") : null;
      if (debit != null && debit !== 0) amount = Math.abs(debit);
      else if (credit != null && credit !== 0) amount = -Math.abs(credit);
    } else {
      amount = parseAmount(cells[amountIdx] ?? "");
    }
    if (!date || amount == null || amount === 0) {
      skippedLines++;
      continue;
    }
    rows.push({ date, memo, amount });
  }

  if (rows.length === 0) return { failure: NO_ROWS_CSV };
  // Debit/Credit files carry explicit signs — never run the majority
  // heuristic on them.
  if (debitIdx !== -1 || creditIdx !== -1) return { rows, signsFlipped: false, skippedLines, postDatesOnly };
  return { ...normalizeSigns(rows), skippedLines, postDatesOnly };
}

const NO_ROWS_PDF =
  "Couldn't read any transactions from this PDF. If it's a scanned image, download the CSV from the bank's website instead — scanned statements aren't supported.";

/** Statement PDFs list rows as "MM/DD  MEMO ...  $1,234.56" (AMEX-like) or
 * with MM/DD/YY dates (Chase-like). The year for MM/DD dates is inferred
 * from the statement period, which handles a Dec–Jan straddle. */
export function parsePdfStatementText(
  pageTexts: string[],
  periodStart: string,
  periodEnd: string
): ParseResult | ParseFailure {
  const startYear = Number(periodStart.slice(0, 4));
  const endYear = Number(periodEnd.slice(0, 4));
  const startMonth = Number(periodStart.slice(5, 7));

  const inferYear = (month: number): number => {
    if (startYear === endYear) return startYear;
    // Dec–Jan straddle: months >= the period's starting month belong to the
    // start year, earlier months to the end year.
    return month >= startMonth ? startYear : endYear;
  };

  const lineRe = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}(?:\d{2})?))?\s+(.+?)\s+(-?\(?\$?[\d,]+\.\d{2}\)?(?:\s*CR)?)\s*$/;

  const rows: ParsedStatementRow[] = [];
  let skippedLines = 0;
  for (const page of pageTexts) {
    for (const rawLine of page.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) continue;
      const m = line.match(lineRe);
      if (!m) {
        // Only count lines that LOOK like they start with a date — page
        // headers/footers aren't "skipped rows", they're not rows at all.
        if (/^\d{1,2}\/\d{1,2}/.test(line)) skippedLines++;
        continue;
      }
      const [, mo, d, y, memo, amountRaw] = m;
      const month = Number(mo);
      const year = y ? (y.length === 2 ? 2000 + Number(y) : Number(y)) : inferYear(month);
      const date = toIsoDate(`${mo}/${d}/${year}`);
      const amount = parseAmount(amountRaw);
      if (!date || amount == null || amount === 0) {
        skippedLines++;
        continue;
      }
      rows.push({ date, memo: memo.trim(), amount });
    }
  }

  if (rows.length === 0) return { failure: NO_ROWS_PDF };
  // A printed statement's line date is the transaction date.
  return { ...normalizeSigns(rows), skippedLines, postDatesOnly: false };
}

/** Warn-only duplicate flag on exact (date, amount) match against rows
 * already in the period. Two identical coffee charges in one day are
 * legitimate, so review shows a badge instead of dropping anything. */
export function markDuplicates(
  rows: ParsedStatementRow[],
  existing: { date: string; amount: number }[]
): ParsedStatementRow[] {
  const seen = new Set(existing.map((e) => `${e.date}:${e.amount.toFixed(2)}`));
  return rows.map((r) => (seen.has(`${r.date}:${r.amount.toFixed(2)}`) ? { ...r, duplicate: true } : r));
}

export interface CommitRow {
  date: string;
  memo: string;
  amount: number;
  categoryId: number;
}

/** Server-side re-validation of what the review screen posts back. The
 * client's JSON is never trusted: the commit action calls this against
 * the ACTIVE category ids it loaded itself. Returns the typed rows or a
 * human sentence. */
export function validateCommitRows(
  raw: unknown,
  activeCategoryIds: Set<number>
): { rows: CommitRow[] } | ParseFailure {
  if (!Array.isArray(raw) || raw.length === 0) return { failure: "Nothing to import — no rows were included." };
  const rows: CommitRow[] = [];
  for (const r of raw) {
    if (typeof r !== "object" || r === null) return { failure: "Rows were malformed — re-upload the file and try again." };
    const { date, memo, amount, categoryId } = r as Record<string, unknown>;
    if (typeof date !== "string" || !ISO_DATE.test(date)) return { failure: "A row has a bad date — re-check the review list." };
    if (typeof amount !== "number" || !Number.isFinite(amount) || amount === 0)
      return { failure: "A row has a bad amount — re-check the review list." };
    if (typeof categoryId !== "number" || !activeCategoryIds.has(categoryId))
      return { failure: "A row is missing a category — every imported row needs one." };
    rows.push({ date, memo: typeof memo === "string" ? memo.slice(0, 500) : "", amount: Math.round(amount * 100) / 100, categoryId });
  }
  return { rows };
}
