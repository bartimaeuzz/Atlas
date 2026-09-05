import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";

/** THE WALL A MANAGER HITS WHEN A DELETE FORGETS A FOREIGN KEY.
 *
 * 2026-09-05: `supplier_check_audit_log.invoice_id` pointed at
 * `supplier_invoices.id` with no `onDelete`, so `deleteDraftInvoice`
 * deleted an invoice that an audit row still referenced. SQLite refused
 * the whole batch (`db/client.ts` sets `PRAGMA foreign_keys = ON`, so
 * these fail for real, in production) and the restaurant manager was
 * shown the raw words "SQLITE_CONSTRAINT: FOREIGN KEY constraint
 * failed". It was live for days. It passed tsc, eslint, all 335 tests,
 * the build and a code-level trace; only a live create -> edit -> delete
 * found it. The same class had already cost a day on 2026-08-30, when
 * Aey hit the identical raw error deleting a published week
 * (`lib/schedule/swapDetach.ts` is that fix).
 *
 * Twice is a class, not an accident. This test is the automatic catch.
 *
 * It is a DRIFT GUARD, not a proof of correctness. It reads the schema
 * and the code, works out every place a delete could hit that wall, and
 * compares the result against the decisions recorded in HANDLED below.
 * A new delete, or a new foreign key onto a table something already
 * deletes, changes that set and fails the build with the three choices
 * spelled out. Nobody has to remember this file exists.
 *
 * SWEEP SCOPE, stated out loud (charter rule 9): every `.delete(<table>)`
 * whose argument is a table exported from `db/schema.ts`, found anywhere
 * under `lib/` and `app/`. That is a behaviour-shaped sweep, not a
 * filename-shaped one -- it does not care what a file is called or which
 * folder it sits in. Deliberately NOT covered: raw SQL (`db/seed.ts`
 * empties every table by string, dev-only and denied to agents anyway),
 * migrations, and inserts that point at an already-deleted parent. */

/* ---------------------------------------------------------------------- */
/* The decisions                                                           */
/* ---------------------------------------------------------------------- */

/** What was decided for a child row whose parent is about to be deleted.
 * Three answers, and which one is right is a judgement call about the
 * data -- never "whichever makes the error go away".
 *
 *   reference-nulled ..... the row is a RECORD and must survive. Point
 *     it at nothing, keep it. Right for audit and log rows: throwing a
 *     record away to make a delete succeed is the wrong trade in a
 *     payroll tool.
 *   deleted-with-parent .. the row is meaningless without its parent.
 *     Delete it in the SAME `db.batch()`, so a failure leaves neither.
 *   delete-refused ....... the row is a live promise to a person.
 *     Refuse the delete and say why in plain English, so a human
 *     resolves it deliberately. Error prevention over error messages. */
type Disposition = "reference-nulled" | "deleted-with-parent" | "delete-refused";

interface Decision {
  disposition: Disposition;
  /** A string that must appear in every FUNCTION that deletes the parent
   * -- the code that actually carries out the decision. This is what
   * makes the test more than a snapshot: delete the line that clears the
   * child rows and the guard goes missing and the test fails.
   *
   * Scoped to the enclosing function, NOT the file. File scope looked
   * good enough and was not: `lib/actions/shift.ts` deletes
   * tipPoolCalculations and employeePayouts in BOTH `reopenShift` and
   * `deleteShift`, so gutting deleteShift still left the strings in the
   * file and the test passed a shift delete that could no longer run.
   * Function scope catches it, because reopenShift does not delete
   * `shifts` and is therefore never a guard site.
   *
   * Still not statement scope: this does not prove the guard runs in the
   * SAME `db.batch()`, and it cannot -- the handled cases are variously a
   * batch (supplierCheck), two sequential awaits (deleteWeek) and an
   * early-return gate (swapDetach). Saying otherwise would overclaim. */
  guard: string;
  why: string;
}

/** Keyed `parentTable <- childTable.childColumn`. */
const HANDLED: Record<string, Decision> = {
  /* --- Supplier check: the invoice this test exists because of --------- */
  "supplierInvoices <- supplierCheckAuditLog.invoiceId": {
    disposition: "reference-nulled",
    guard: ".update(supplierCheckAuditLog)",
    why: "The audit trail outlives the invoice. `details` still carries the invoice number and every before/after value, and paymentId is the only column anything reads these rows by, so dropping invoiceId costs nothing readable. Fixed in 0cbd535.",
  },

  /* --- Deleting a shift: ten children, all worthless without it -------- */
  ...shiftChildren({
    shiftRosterEntries: "who was on the shift",
    shiftAttendanceMarks: "who was marked absent on it",
    shiftWageAdjustments: "hand adjustments to that shift's wages",
    shiftSales: "the shift's sales figures",
    onlinePlatformSalesRecords: "its per-platform online sales",
    hostUpsellTipRecords: "its host upsell tips",
    deliveryCashTipRecords: "its delivery cash tips",
    tipPoolCalculations: "its tip pool result",
    employeePayouts: "what each person was paid for it",
    metricValues: "metrics recorded against it",
  }),

  /* --- Deleting a schedule week --------------------------------------- */
  "scheduleWeeks <- plannedShiftAssignments.weekId": {
    disposition: "deleted-with-parent",
    guard: ".delete(plannedShiftAssignments)",
    why: "A planned assignment is a cell in the week's grid. Deleting the week means the grid never existed; the schedule_change_log row keeps the record, and it deliberately has no FK (see its schema comment).",
  },

  /* --- Deleting a planned assignment: the 2026-08-30 precedent -------- */
  "plannedShiftAssignments <- swapRequests.assignmentId": {
    disposition: "delete-refused",
    guard: "prepareAssignmentsForDelete",
    why: "Two answers by status, both in lib/schedule/swapDetach.ts: an UNRESOLVED swap is a standing promise to a staff member, so it blocks the delete by name; a RESOLVED one is history, so its shift is snapshotted onto it and the FK nulled. This is the fix Aey's raw SQLITE_CONSTRAINT bought.",
  },

  /* --- Deleting a card and its statements ----------------------------- */
  "ledgerCards <- cardStatementPeriods.cardId": {
    disposition: "deleted-with-parent",
    guard: ".delete(cardStatementPeriods)",
    why: "A statement period belongs to one card and means nothing after it. Admin-only, and the activity log row written in the same batch keeps the count of what went with it.",
  },
  "cardStatementPeriods <- cardTransactions.statementPeriodId": {
    disposition: "deleted-with-parent",
    guard: ".delete(cardTransactions)",
    why: "A card transaction belongs to one statement period. Same batch, deleted before the period, so a failure leaves the card whole.",
  },
};

function shiftChildren(children: Record<string, string>): Record<string, Decision> {
  const out: Record<string, Decision> = {};
  for (const [child, what] of Object.entries(children)) {
    out[`shifts <- ${child}.shiftId`] = {
      disposition: "deleted-with-parent",
      guard: `.delete(${child})`,
      why: `${what} -- nothing to read once the shift is gone. deleteShift is draft-only and removes all ten children in one batch.`,
    };
  }
  return out;
}

/* ---------------------------------------------------------------------- */
/* Reading the schema and the code                                         */
/* ---------------------------------------------------------------------- */

/** Walk up from the working directory rather than trusting `__dirname`
 * or the cwd -- the test must find the repo whichever of them the runner
 * hands it. */
function repoRoot(): string {
  let dir = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(path.join(dir, "db", "schema.ts"))) return dir;
    const up = path.dirname(dir);
    if (up === dir) break;
    dir = up;
  }
  throw new Error("Could not find db/schema.ts by walking up from " + process.cwd());
}

const ROOT = repoRoot();

/** Source with continuation lines folded onto the line they continue, so
 * a foreign key written across several lines parses the same as one on a
 * single line. `supplierInvoicePhotos.invoiceId` is written that way and
 * is the ONLY `onDelete` in the whole schema -- miss the fold and the
 * test reports a risky pair that is actually safe. */
function foldContinuations(source: string): { text: string; line: number }[] {
  const out: { text: string; line: number }[] = [];
  source.split("\n").forEach((raw, i) => {
    const trimmed = raw.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return; // a comment mentioning references() is not one
    if (/^\./.test(trimmed) && out.length > 0) out[out.length - 1].text += " " + trimmed;
    else out.push({ text: raw, line: i + 1 });
  });
  return out;
}

interface ForeignKey {
  child: string;
  column: string;
  parent: string;
  onDelete: string | null;
  line: number;
}

function readSchema(): { tables: Set<string>; foreignKeys: ForeignKey[] } {
  const source = readFileSync(path.join(ROOT, "db", "schema.ts"), "utf8");
  const tables = new Set<string>();
  const foreignKeys: ForeignKey[] = [];
  let current: string | null = null;

  for (const { text, line } of foldContinuations(source)) {
    const table = /^export const (\w+)\s*=\s*sqliteTable\(/.exec(text);
    if (table) {
      current = table[1];
      tables.add(current);
    }
    const fk = /(\w+):\s*(?:integer|text)\("[^"]+"\).*?references\(\(\)\s*=>\s*(\w+)\.\w+/.exec(text);
    if (fk && current) {
      const onDelete = /onDelete:\s*"(\w+)"/.exec(text);
      foreignKeys.push({ child: current, column: fk[1], parent: fk[2], onDelete: onDelete ? onDelete[1] : null, line });
    }
  }
  return { tables, foreignKeys };
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name.startsWith(".")) continue;
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(dir);
  return out;
}

/** One place in the code where rows are deleted from a table. */
interface DeleteSite {
  /** repo-relative path */
  file: string;
  /** enclosing function name, for the failure message */
  fn: string;
  /** that function's source -- the window the guard must appear in */
  body: string;
}

/** The lines of each top-level function in a file, keyed by the line
 * index it starts at. Declarations only (`export async function foo`),
 * which is how every action in `lib/actions/` is written; anything that
 * somehow falls outside one is scoped to the whole file instead, which
 * is weaker but never a false failure -- and the function name in the
 * failure message says which happened. */
function functionStarts(lines: { text: string }[]): { at: number; name: string }[] {
  const out: { at: number; name: string }[] = [];
  lines.forEach((l, i) => {
    const m = /^\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/.exec(l.text);
    if (m) out.push({ at: i, name: m[1] });
  });
  return out;
}

/** table -> every place that deletes rows from it.
 *
 * Matched by the ARGUMENT being a known schema table, which is what
 * separates a database delete from `next.delete(id)`,
 * `cookieStore.delete(...)` and `cosignerIds.delete(session.id)` --
 * all real code in this repo that a plain `.delete(` regex trips over.
 * Continuations are folded first, so a `.delete(` on its own line
 * (lib/actions/salesTargets.ts, lib/actions/tipPools.ts) is not missed
 * the way a one-line grep misses it. */
function deletesByTable(tables: Set<string>): Map<string, DeleteSite[]> {
  const found = new Map<string, DeleteSite[]>();
  for (const dir of ["lib", "app"]) {
    const base = path.join(ROOT, dir);
    if (!existsSync(base)) continue;
    for (const file of sourceFiles(base)) {
      const rel = path.relative(ROOT, file);
      const lines = foldContinuations(readFileSync(file, "utf8"));
      const starts = functionStarts(lines);

      lines.forEach((line, i) => {
        for (const match of line.text.matchAll(/\.delete\(\s*(\w+)\s*\)/g)) {
          const table = match[1];
          if (!tables.has(table)) continue;

          let fn = "(file scope)";
          let from = 0;
          let to = lines.length;
          for (let k = starts.length - 1; k >= 0; k--) {
            if (starts[k].at <= i) {
              fn = starts[k].name;
              from = starts[k].at;
              to = k + 1 < starts.length ? starts[k + 1].at : lines.length;
              break;
            }
          }

          const list = found.get(table) ?? [];
          if (!list.some((sx) => sx.file === rel && sx.fn === fn)) {
            list.push({ file: rel, fn, body: lines.slice(from, to).map((l) => l.text).join("\n") });
          }
          found.set(table, list);
        }
      });
    }
  }
  return found;
}

function describeSites(sites: DeleteSite[] | undefined): string {
  return (sites ?? []).map((sx) => `${sx.file} -> ${sx.fn}()`).join(", ");
}

/* ---------------------------------------------------------------------- */
/* The tests                                                               */
/* ---------------------------------------------------------------------- */

const { tables, foreignKeys } = readSchema();
const deletes = deletesByTable(tables);

/** Every (parent being deleted, cascade-less child pointing at it) pair.
 * A cascade-less FK onto a table nothing ever deletes is not a risk, and
 * a cascade-carrying one is SQLite's problem, not ours -- so neither is
 * here. */
const risky = foreignKeys
  .filter((fk) => fk.onDelete === null && deletes.has(fk.parent))
  .map((fk) => ({ key: `${fk.parent} <- ${fk.child}.${fk.column}`, fk }));

test("the schema still parses -- an empty read would make every test below pass for the wrong reason", () => {
  assert.ok(tables.size > 40, `only found ${tables.size} tables in db/schema.ts`);
  assert.ok(foreignKeys.length > 80, `only found ${foreignKeys.length} foreign keys`);
  assert.equal(
    foreignKeys.filter((fk) => fk.onDelete !== null).length,
    1,
    "exactly one cascade exists in this schema (supplierInvoicePhotos.invoiceId). If that changed, good -- update this number. If it dropped to 0, the multi-line fold broke."
  );
  assert.ok(deletes.size > 20, `only found deletes for ${deletes.size} tables`);
});

test("every delete that could hit a foreign key has a recorded decision", () => {
  const undecided = risky.filter((r) => !(r.key in HANDLED));
  assert.deepEqual(
    undecided.map((r) => r.key),
    [],
    undecided
      .map(
        (r) => `
NOT DECIDED: ${r.key}
  ${r.fk.child}.${r.fk.column} points at ${r.fk.parent} with no onDelete (db/schema.ts:${r.fk.line}),
  and ${r.fk.parent} rows are deleted in: ${describeSites(deletes.get(r.fk.parent))}.

  PRAGMA foreign_keys is ON, so if a ${r.fk.child} row still points at the
  ${r.fk.parent} being deleted, SQLite refuses the whole batch and the person
  clicking is shown "SQLITE_CONSTRAINT: FOREIGN KEY constraint failed".

  Decide which of these ${r.fk.child} is, then add it to HANDLED in this file:
    reference-nulled ..... it is a RECORD and must survive -- null the FK in
                           the same batch, keep the row. (Audit and log rows.)
    deleted-with-parent .. it is meaningless without its parent -- delete it
                           in the same batch, before the parent.
    delete-refused ....... it is a live promise to a person -- refuse the
                           delete with a plain-English message naming it.

  Do not pick whichever one makes the error stop.`
      )
      .join("\n")
  );
});

test("no decision has gone stale -- a recorded pair that no longer exists is a lie", () => {
  const live = new Set(risky.map((r) => r.key));
  const stale = Object.keys(HANDLED).filter((key) => !live.has(key));
  assert.deepEqual(
    stale,
    [],
    `These pairs are recorded in HANDLED but are no longer risky -- the FK gained an onDelete, the delete was removed, or something was renamed. Delete the entry:\n  ${stale.join("\n  ")}`
  );
});

test("the code that carries out each decision is still there", () => {
  const missing: string[] = [];
  for (const { key, fk } of risky) {
    const decision = HANDLED[key];
    if (!decision) continue; // already reported by the test above
    for (const site of deletes.get(fk.parent) ?? []) {
      if (!site.body.includes(decision.guard)) {
        missing.push(
          `${key}\n  ${site.file} -> ${site.fn}() deletes ${fk.parent} but does not contain "${decision.guard}".\n  That function is where the "${decision.disposition}" decision is meant to happen:\n  ${decision.why}`
        );
      }
    }
  }
  assert.deepEqual(missing, [], missing.join("\n\n"));
});

/** Every delete site sits inside a named function. Not a style rule --
 * the guard above is only as narrow as this. One site falling back to
 * file scope would silently widen the window it searches, which is
 * exactly the weakness function scope was introduced to remove. */
test("every delete sits inside a named function, so the guard window stays narrow", () => {
  const loose: string[] = [];
  for (const [table, sites] of deletes) {
    for (const site of sites) {
      if (site.fn === "(file scope)") loose.push(`${site.file} deletes ${table} outside any named function`);
    }
  }
  assert.deepEqual(loose, [], loose.join("\n"));
});
