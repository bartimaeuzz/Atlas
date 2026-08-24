import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseCsvStatement,
  parsePdfStatementText,
  markDuplicates,
  validateCommitRows,
  isParseFailure,
  type ParseResult,
} from "../cardStatement";

function ok(r: ReturnType<typeof parseCsvStatement>): ParseResult {
  assert.ok(!isParseFailure(r), `expected rows, got failure: ${isParseFailure(r) ? r.failure : ""}`);
  return r as ParseResult;
}

/* ------------------------------- CSV ---------------------------------- */

test("csv: AMEX shape — charges positive, no flip", () => {
  const r = ok(
    parseCsvStatement(
      "Date,Description,Amount\n07/02/2026,RESTAURANT DEPOT,842.17\n07/24/2026,PRODUCE RETURN,-45.50\n"
    )
  );
  assert.equal(r.signsFlipped, false);
  assert.deepEqual(r.rows, [
    { date: "2026-07-02", memo: "RESTAURANT DEPOT", amount: 842.17 },
    { date: "2026-07-24", memo: "PRODUCE RETURN", amount: -45.5 },
  ]);
});

test("csv: Chase shape — charges negative, flipped to Atlas convention", () => {
  const r = ok(
    parseCsvStatement(
      "Transaction Date,Description,Amount\n08/01/2026,RESTAURANT DEPOT,-915.63\n08/04/2026,COFFEE SUPPLIER,-162.45\n08/10/2026,REFUND,45.00\n"
    )
  );
  assert.equal(r.signsFlipped, true);
  assert.equal(r.rows[0].amount, 915.63);
  assert.equal(r.rows[2].amount, -45.0); // the refund flips negative
});

test("csv: Debit/Credit two-column shape — explicit signs, heuristic never runs", () => {
  const r = ok(
    parseCsvStatement("Date,Description,Debit,Credit\n07/02/2026,SUPPLIES,74.99,\n07/03/2026,RETURN,,20.00\n")
  );
  assert.equal(r.signsFlipped, false);
  assert.deepEqual(
    r.rows.map((x) => x.amount),
    [74.99, -20.0]
  );
});

test("csv: quoted memo with commas survives", () => {
  const r = ok(parseCsvStatement('Date,Description,Amount\n07/02/2026,"DEPOT, RESTAURANT, NYC",12.00\n'));
  assert.equal(r.rows[0].memo, "DEPOT, RESTAURANT, NYC");
});

test("csv: BOM and junk preamble lines before the real header", () => {
  const r = ok(
    parseCsvStatement(
      "﻿Account: ...1234\nStatement period 07/01-07/31\n\nDate,Description,Amount\n07/05/2026,COFFEE,156.90\n"
    )
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.rows[0].date, "2026-07-05");
});

test("csv: two-digit years and ISO dates both normalize", () => {
  const r = ok(parseCsvStatement("Date,Description,Amount\n07/05/26,A,1.00\n2026-07-06,B,2.00\n"));
  assert.deepEqual(
    r.rows.map((x) => x.date),
    ["2026-07-05", "2026-07-06"]
  );
});

test("csv: unreadable and zero-amount rows are counted as skipped, not dropped silently", () => {
  const r = ok(parseCsvStatement("Date,Description,Amount\n07/05/2026,GOOD,1.00\nnot-a-date,BAD,2.00\n07/06/2026,ZERO,0.00\n"));
  assert.equal(r.rows.length, 1);
  assert.equal(r.skippedLines, 2);
});

test("csv: empty file and headerless garbage both fail with a sentence", () => {
  for (const text of ["", "just,some,garbage\n1,2,3\n"]) {
    const r = parseCsvStatement(text);
    assert.ok(isParseFailure(r));
    assert.match(r.failure, /CSV/);
  }
});

/* ------------------------------- PDF ---------------------------------- */

test("pdf: AMEX-like MM/DD rows, year inferred from a single-year period", () => {
  const r = ok(
    parsePdfStatementText(
      ["07/02  RESTAURANT DEPOT NEW YORK  $842.17\n07/24  PRODUCE RETURN  $45.50 CR"],
      "2026-07-01",
      "2026-07-31"
    )
  );
  assert.deepEqual(r.rows, [
    { date: "2026-07-02", memo: "RESTAURANT DEPOT NEW YORK", amount: 842.17 },
    { date: "2026-07-24", memo: "PRODUCE RETURN", amount: -45.5 },
  ]);
});

test("pdf: Chase-like negative amounts flip to charge-positive", () => {
  const r = ok(
    parsePdfStatementText(["08/01/26  RESTAURANT DEPOT  -915.63\n08/04/26  COFFEE SUPPLIER  -162.45"], "2026-08-01", "2026-08-31")
  );
  assert.equal(r.signsFlipped, true);
  assert.equal(r.rows[0].amount, 915.63);
});

test("pdf: Dec–Jan straddle infers the right year per month", () => {
  const r = ok(
    parsePdfStatementText(["12/28  LATE DECEMBER  $10.00\n01/03  EARLY JANUARY  $20.00"], "2026-12-15", "2027-01-14")
  );
  assert.deepEqual(
    r.rows.map((x) => x.date),
    ["2026-12-28", "2027-01-03"]
  );
});

test("pdf: page with no transaction lines fails with the scanned-image hint", () => {
  const r = parsePdfStatementText(["ACCOUNT SUMMARY\nPrevious balance $100.00"], "2026-07-01", "2026-07-31");
  assert.ok(isParseFailure(r));
  assert.match(r.failure, /scanned/);
});

test("pdf: garbage lines that look date-led count as skipped alongside valid rows", () => {
  const r = ok(
    parsePdfStatementText(["07/02  GOOD ROW  $10.00\n07/03 broken line without amount\nPage 2 of 4"], "2026-07-01", "2026-07-31")
  );
  assert.equal(r.rows.length, 1);
  assert.equal(r.skippedLines, 1); // the page footer is not counted
});

/* ---------------------------- duplicates ------------------------------- */

test("markDuplicates: exact (date, amount) match flags; near-misses do not", () => {
  const rows = markDuplicates(
    [
      { date: "2026-07-02", memo: "A", amount: 10.0 },
      { date: "2026-07-02", memo: "B", amount: 10.01 },
      { date: "2026-07-03", memo: "C", amount: 10.0 },
    ],
    [{ date: "2026-07-02", amount: 10.0 }]
  );
  assert.deepEqual(
    rows.map((r) => !!r.duplicate),
    [true, false, false]
  );
});

test("markDuplicates: two identical incoming rows vs one existing — both flagged, human decides", () => {
  const rows = markDuplicates(
    [
      { date: "2026-07-02", memo: "COFFEE", amount: 5.0 },
      { date: "2026-07-02", memo: "COFFEE", amount: 5.0 },
    ],
    [{ date: "2026-07-02", amount: 5.0 }]
  );
  assert.deepEqual(
    rows.map((r) => !!r.duplicate),
    [true, true]
  );
});

/* -------------------------- commit validation -------------------------- */

const CATS = new Set([1, 2]);

test("validateCommitRows: happy path rounds amounts and caps memo", () => {
  const r = validateCommitRows(
    [{ date: "2026-07-02", memo: "x".repeat(600), amount: 10.005, categoryId: 1 }],
    CATS
  );
  assert.ok(!("failure" in r));
  assert.equal(r.rows[0].amount, 10.01);
  assert.equal(r.rows[0].memo.length, 500);
});

test("validateCommitRows: rejects empty, bad date, zero amount, unknown category", () => {
  for (const raw of [
    [],
    [{ date: "07/02/2026", memo: "", amount: 1, categoryId: 1 }],
    [{ date: "2026-07-02", memo: "", amount: 0, categoryId: 1 }],
    [{ date: "2026-07-02", memo: "", amount: 1, categoryId: 99 }],
  ]) {
    const r = validateCommitRows(raw, CATS);
    assert.ok("failure" in r, JSON.stringify(raw));
  }
});
