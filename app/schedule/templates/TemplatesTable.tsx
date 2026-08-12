"use client";

import { useState, useTransition } from "react";
import { retireTemplateAssignment, setTemplateVacancy, clearTemplateVacancy } from "@/lib/actions/schedule";
import type { ScheduleTemplateRow } from "@/lib/schedule/loadScheduleTemplates";

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const VACANCY_LABELS: Record<string, string> = {
  RESIGNATION: "Resigning",
  PROMOTION: "Promoted/moved",
  OTHER: "Dropping this shift",
};

/** List + controls for every active template assignment. Confirmed with
 * Oliver: the RED highlight on a real restaurant schedule means a slot
 * is KNOWN to be vacating (resignation notice or a promotion/transfer),
 * not an open swap request — that's what "Mark vacating" sets here.
 *
 * Scope note (2026-08-11): "Mark vacating" on ONE row can flag more
 * than that one row, depending on the reason — see setTemplateVacancy's
 * comment in lib/actions/schedule.ts for the full rule. Resigning flags
 * every shift that employee has; Promoted flags every shift they have
 * in that specific position; "Dropping this shift" (OTHER) only
 * affects the one row clicked — that's the case for an employee who
 * just wants off one recurring day, not leaving or changing roles. */
export function TemplatesTable({ templates }: { templates: ScheduleTemplateRow[] }) {
  return (
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-neutral-500 border-b">
          <th className="py-2">Day</th>
          <th className="py-2">Period</th>
          <th className="py-2">Position</th>
          <th className="py-2">Employee</th>
          <th className="py-2">Effective from</th>
          <th className="py-2">Vacancy</th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {templates.map((t) => (
          <TemplateRow key={t.id} template={t} />
        ))}
      </tbody>
    </table>
  );
}

function TemplateRow({ template }: { template: ScheduleTemplateRow }) {
  const [isPending, startTransition] = useTransition();
  const [showVacancyForm, setShowVacancyForm] = useState(false);
  const isVacant = template.vacancyReason !== null;

  return (
    <>
      <tr className={"border-b" + (isVacant ? " bg-red-50" : "")}>
        <td className="py-2">{DAY_LABELS[template.dayOfWeek]}</td>
        <td className="py-2">{template.period}</td>
        <td className="py-2">
          {template.positionName} <span className="text-xs text-neutral-400">({template.positionCategory})</span>
        </td>
        <td className="py-2">{template.employeeName}</td>
        <td className="py-2 text-neutral-500">{template.effectiveFrom ?? "—"}</td>
        <td className="py-2">
          {isVacant ? (
            <span className="text-red-700 font-medium">
              {VACANCY_LABELS[template.vacancyReason as string] ?? template.vacancyReason} — {template.vacancyStartsOn}
            </span>
          ) : (
            <span className="text-neutral-400">—</span>
          )}
        </td>
        <td className="py-2 text-right whitespace-nowrap">
          {isVacant ? (
            <button
              type="button"
              disabled={isPending}
              onClick={() => startTransition(() => clearTemplateVacancy(template.id))}
              className="underline text-neutral-500 hover:text-neutral-800 disabled:opacity-50 mr-3"
            >
              Clear vacancy
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setShowVacancyForm((s) => !s)}
              className="underline text-neutral-500 hover:text-neutral-800 mr-3"
            >
              Mark vacating
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Retire this template assignment (${template.employeeName}, ${template.positionName}, ${DAY_LABELS[template.dayOfWeek]} ${template.period})?`)) {
                startTransition(() => retireTemplateAssignment(template.id));
              }
            }}
            className="underline text-neutral-500 hover:text-neutral-800 disabled:opacity-50"
          >
            Retire
          </button>
        </td>
      </tr>
      {showVacancyForm && !isVacant && (
        <tr className="border-b bg-neutral-50">
          <td colSpan={7} className="py-2">
            <VacancyForm
              templateId={template.id}
              onDone={() => setShowVacancyForm(false)}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function VacancyForm({ templateId, onDone }: { templateId: number; onDone: () => void }) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<"RESIGNATION" | "PROMOTION" | "OTHER">("RESIGNATION");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));

  const scopeHint: Record<typeof reason, string> = {
    RESIGNATION: "Flags every shift this person has, on any day or position.",
    PROMOTION: "Flags every shift they have in this specific position (other roles stay as-is).",
    OTHER: "Flags only this one shift — use this if they're just asking to drop this recurring day.",
  };

  return (
    <div className="px-2">
      <div className="flex items-end gap-3">
        <label className="text-xs">
          <span className="block text-neutral-500 mb-1">Reason</span>
          <select
            value={reason}
            onChange={(e) => setReason(e.target.value as typeof reason)}
            className="border rounded px-2 py-1"
          >
            <option value="RESIGNATION">Resigning</option>
            <option value="PROMOTION">Promoted/moved to another position</option>
            <option value="OTHER">Dropping this shift only</option>
          </select>
        </label>
        <label className="text-xs">
          <span className="block text-neutral-500 mb-1">Starts on</span>
          <input
            type="date"
            value={startsOn}
            onChange={(e) => setStartsOn(e.target.value)}
            className="border rounded px-2 py-1"
          />
        </label>
        <button
          type="button"
          disabled={isPending}
          onClick={() =>
            startTransition(async () => {
              await setTemplateVacancy(templateId, reason, startsOn);
              onDone();
            })
          }
          className="bg-red-700 text-white px-3 py-1 rounded text-xs hover:bg-red-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Set"}
        </button>
        <button type="button" onClick={onDone} className="text-xs text-neutral-500 underline">
          Cancel
        </button>
      </div>
      <p className="text-[11px] text-neutral-400 mt-1.5">{scopeHint[reason]}</p>
    </div>
  );
}
