"use client";

import { startTransition, useActionState, useMemo, useState } from "react";
import {
  parseStatementUpload,
  commitStatementImport,
  type ImportParseState,
  type ImportCommitState,
} from "@/lib/actions/cardImport";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { Badge } from "@/components/ui/Badge";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useKeepValuesOnError } from "@/components/forms/useKeepValuesOnError";

const parseInitial: ImportParseState = { error: null };
const commitInitial: ImportCommitState = { error: null };

interface ReviewRow {
  date: string;
  memo: string;
  amount: number;
  duplicate: boolean;
  included: boolean;
  categoryId: number | ""; // "" = not chosen yet — Commit stays disabled
}

function money(n: number): string {
  const sign = n < 0 ? "-" : "";
  return `${sign}$${Math.abs(n).toFixed(2)}`;
}

/** Upload phase then review phase (2026-08-24). The parsed rows live in
 * client state during review — edits (category, include, memo, amount)
 * happen here, and Commit posts the included rows as JSON. The server
 * re-validates everything; this component only decides what a human sees
 * and can fix before anything is written. */
export function ImportClient({
  periodId,
  categories,
}: {
  periodId: number;
  categories: { id: number; name: string }[];
}) {
  const [parseState, parseAction, isParsing] = useActionState(parseStatementUpload, parseInitial);
  const [commitState, commitAction, isCommitting] = useActionState(commitStatementImport, commitInitial);
  const formRef = useKeepValuesOnError(isParsing, !!parseState.error);

  const [rows, setRows] = useState<ReviewRow[] | null>(null);
  const [loadedFrom, setLoadedFrom] = useState<string | null>(null);
  // The parsedAt nonce this client has already adopted OR dismissed.
  // Comparing filenames instead broke both directions (scrutinize,
  // 2026-08-24): after Start over the old result re-adopted itself, and
  // keeping the filename would block re-uploading a same-named file.
  const [seenParse, setSeenParse] = useState<number | null>(null);
  const [confirming, setConfirming] = useState(false);

  // Adopt fresh parse results exactly once per upload (derived-during-
  // render, not an effect — the set-state-in-effect lint rule bit this
  // codebase before).
  if (parseState.rows && parseState.parsedAt && parseState.parsedAt !== seenParse) {
    setRows(
      parseState.rows.map((r) => ({
        date: r.date,
        memo: r.memo,
        amount: r.amount,
        duplicate: !!r.duplicate,
        included: true,
        categoryId: "",
      }))
    );
    setLoadedFrom(parseState.fileName ?? null);
    setSeenParse(parseState.parsedAt);
  }

  const included = useMemo(() => (rows ?? []).filter((r) => r.included), [rows]);
  const uncategorized = included.filter((r) => r.categoryId === "").length;
  const total = included.reduce((s, r) => s + r.amount, 0);

  const update = (i: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev!.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  /* ------------------------------ upload ------------------------------ */
  if (!rows) {
    return (
      <form ref={formRef} action={parseAction} className="space-y-4">
        <input type="hidden" name="periodId" value={periodId} />
        {parseState.error && <Banner tone="danger" title="Couldn't read that file" description={parseState.error} />}
        <label className="block text-sm">
          <span className="block text-[var(--ink-700)] font-medium mb-1">Statement file</span>
          <input
            type="file"
            name="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            required
            className="block w-full text-sm text-[var(--ink-700)] border border-[var(--border)] rounded-[var(--radius-md)] bg-[var(--card)] p-2 min-h-11 file:mr-3 file:border-0 file:rounded-[var(--radius-sm)] file:bg-[var(--paper)] file:px-3 file:py-2 file:text-sm"
          />
          <span className="block text-xs text-[var(--ink-500)] mt-1">
            PDF (text-based) or CSV from the bank&apos;s website, up to 4 MB. Scanned/photographed statements
            aren&apos;t supported — download the CSV instead.
          </span>
        </label>
        <Button type="submit" loading={isParsing}>
          {isParsing ? "Reading…" : "Read file"}
        </Button>
      </form>
    );
  }

  /* ------------------------------ review ------------------------------ */
  return (
    <div className="space-y-4 pb-24">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--ink-500)]">
          Read from <span className="text-[var(--ink-900)]">{loadedFrom}</span>
        </p>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => {
            // seenParse stays — that is the dismissal; the stale result in
            // parseState must not re-adopt itself.
            setRows(null);
            setLoadedFrom(null);
          }}
        >
          Start over
        </Button>
      </div>

      {parseState.signsFlipped && (
        <Banner
          tone="info"
          title="Charges in this file were negative — signs were flipped so charges show as positive."
          description="Spot-check a few rows. If they look backwards, use Flip all signs."
        />
      )}
      {(parseState.skippedLines ?? 0) > 0 && (
        <Banner
          tone="warning"
          title={`${parseState.skippedLines} line${parseState.skippedLines === 1 ? "" : "s"} couldn't be read and ${parseState.skippedLines === 1 ? "was" : "were"} skipped.`}
          description="Compare the row count below against the statement before importing."
        />
      )}
      {parseState.postDatesOnly && (
        <Banner
          tone="warning"
          title="This file only lists post dates, not transaction dates."
          description="The bank recorded when it processed each charge, which can be a day or two after the purchase. Dates below may sit slightly late — fix any that matter before importing."
        />
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => setRows((prev) => prev!.map((r) => ({ ...r, amount: -r.amount })))}
        >
          Flip all signs
        </Button>
        <label className="flex items-center gap-2 text-sm text-[var(--ink-700)]">
          Apply to all uncategorized:
          <select
            className="border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm bg-[var(--card)]"
            value=""
            onChange={(e) => {
              const id = Number(e.target.value);
              if (!id) return;
              setRows((prev) => prev!.map((r) => (r.categoryId === "" ? { ...r, categoryId: id } : r)));
            }}
          >
            <option value="">— pick —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-2">
        {rows.map((r, i) => (
          <div
            key={i}
            className={
              "rounded-[var(--radius-md)] border p-3 " +
              (r.included ? "border-[var(--border)] bg-[var(--card)]" : "border-[var(--border)] bg-[var(--paper)] opacity-60")
            }
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-sm text-[var(--ink-900)]">{r.date}</span>
              <span className="flex items-center gap-2">
                {r.duplicate && <Badge tone="warning">Possible duplicate</Badge>}
                <Badge tone={r.amount < 0 ? "success" : "neutral"}>{r.amount < 0 ? "Refund" : "Charge"}</Badge>
                <label className="flex items-center gap-1.5 text-xs text-[var(--ink-500)] min-h-11 px-1">
                  <input
                    type="checkbox"
                    checked={r.included}
                    onChange={(e) => update(i, { included: e.target.checked })}
                  />
                  include
                </label>
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <label className="block col-span-2">
                <span className="text-xs text-[var(--ink-500)] block mb-0.5">Memo</span>
                <input
                  type="text"
                  value={r.memo}
                  onChange={(e) => update(i, { memo: e.target.value })}
                  disabled={!r.included}
                  className="w-full border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm bg-[var(--card)] disabled:bg-[var(--paper)]"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--ink-500)] block mb-0.5">Amount</span>
                <input
                  type="number"
                  step={0.01}
                  value={r.amount}
                  onChange={(e) => update(i, { amount: Number(e.target.value) || 0 })}
                  disabled={!r.included}
                  className="w-full border border-[var(--border)] rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm bg-[var(--card)] disabled:bg-[var(--paper)]"
                />
              </label>
              <label className="block">
                <span className="text-xs text-[var(--ink-500)] block mb-0.5">Category *</span>
                <select
                  value={r.categoryId}
                  onChange={(e) => update(i, { categoryId: e.target.value ? Number(e.target.value) : "" })}
                  disabled={!r.included}
                  className={
                    "w-full border rounded-[var(--radius-sm)] px-2 py-1 min-h-9 text-sm bg-[var(--card)] disabled:bg-[var(--paper)] " +
                    (r.included && r.categoryId === "" ? "border-[var(--warning-border)]" : "border-[var(--border)]")
                  }
                >
                  <option value="">— pick —</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          </div>
        ))}
      </div>

      {commitState.error && <Banner tone="danger" title="Couldn't import" description={commitState.error} />}

      {/* Sticky footer: the running answer to "what will Import actually
          do", plus the one correct next action — disabled with its reason
          stated, never a mystery-grey button. */}
      <div className="fixed bottom-0 left-12 right-0 lg:left-[216px] bg-[var(--card)] border-t border-[var(--border)] p-3 z-[3]">
        <div className="max-w-2xl mx-auto flex items-center justify-between gap-3">
          <span className="text-sm text-[var(--ink-700)]">
            {included.length} of {rows.length} rows · {money(total)}
            {uncategorized > 0 && (
              <span className="block text-xs text-[var(--warning-700)]">
                {uncategorized} row{uncategorized === 1 ? "" : "s"} still need{uncategorized === 1 ? "s" : ""} a category
              </span>
            )}
          </span>
          <Button
            type="button"
            disabled={included.length === 0 || uncategorized > 0 || isCommitting}
            onClick={() => setConfirming(true)}
          >
            Import {included.length} row{included.length === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onClose={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false);
          const fd = new FormData();
          fd.set("periodId", String(periodId));
          fd.set("fileName", loadedFrom ?? "statement file");
          fd.set(
            "rowsJson",
            JSON.stringify(included.map((r) => ({ date: r.date, memo: r.memo, amount: r.amount, categoryId: r.categoryId })))
          );
          // useActionState's dispatch must run inside a transition or
          // isCommitting never updates (React 19 logs an error otherwise --
          // caught live on the scratch run, 2026-08-24). The dispatch itself
          // is synchronous, so this is not the stranded-spinner
          // startTransition(async ...) footgun from CLAUDE.md.
          startTransition(() => commitAction(fd));
        }}
        title={`Add ${included.length} transaction${included.length === 1 ? "" : "s"} to this period?`}
        description={`Totaling ${money(total)}. They appear on the period page right away, same as rows entered by hand.`}
        confirmLabel="Import"
        loading={isCommitting}
      />
    </div>
  );
}
