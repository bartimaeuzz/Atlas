"use client";

import { useMemo, useState, useTransition } from "react";
import {
  syncEmployeePositionTemplate,
  retireEmployeeFromPosition,
  setTemplateVacancy,
  clearTemplateVacancy,
} from "@/lib/actions/schedule";
import type { AssignedEmployeeGroup, PositionTemplateGroup, TemplateCell } from "@/lib/schedule/loadTemplatesByPosition";

// Display order is Monday-first (matches the Weekly Plan grid and how
// Oliver reads a real restaurant schedule) — the underlying dayOfWeek
// values stay 0=Sun..6=Sat, JS Date.getDay() convention used everywhere
// else in this app. Only the DISPLAY order changes here.
const DISPLAY_DAYS = [1, 2, 3, 4, 5, 6, 0] as const;
const DAY_SHORT: Record<number, string> = { 0: "Sun", 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat" };
const PERIODS = ["Lunch", "Dinner"] as const;

const VACANCY_LABELS: Record<string, string> = {
  RESIGNATION: "Resigning",
  PROMOTION: "Promoted/moved",
  OTHER: "Leaving this position",
};

function formatPattern(cells: TemplateCell[]): string {
  if (cells.length === 0) return "no days set";
  return DISPLAY_DAYS.flatMap((d) => PERIODS.map((p) => ({ d, p })))
    .filter(({ d, p }) => cells.some((c) => c.dayOfWeek === d && c.period === p))
    .map(({ d, p }) => `${DAY_SHORT[d]} ${p === "Lunch" ? "L" : "D"}`)
    .join(", ");
}

/** Position -> pick a person -> Monday-Sunday x Lunch/Dinner checkbox
 * grid (2026-08-12 redesign, replacing the old one-row-at-a-time list —
 * see PROGRESS.md's dated entry and project_atlas_schedule_planner
 * memory for the discussion that led here). Oliver's reasoning: a
 * position normally has several people, each with their own weekly
 * pattern, and adding one day+period per form submission was slow —
 * checking boxes for someone's whole week at once is faster, and the old
 * flat list of every row was hard to scan. */
export function PositionTemplateGrid({ groups }: { groups: PositionTemplateGroup[] }) {
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <PositionCard key={g.positionId} group={g} />
      ))}
    </div>
  );
}

function PositionCard({ group }: { group: PositionTemplateGroup }) {
  const [editingEmployeeId, setEditingEmployeeId] = useState<number | null>(null);
  const editingAssigned = group.assignedEmployees.find((e) => e.employeeId === editingEmployeeId);
  const editingEligible = group.eligibleEmployees.find((e) => e.id === editingEmployeeId);

  return (
    <div className="border rounded p-4">
      <h3 className="font-medium mb-3">
        {group.positionName} <span className="text-xs text-neutral-400">({group.positionCategory})</span>
      </h3>

      {group.assignedEmployees.length === 0 ? (
        <p className="text-sm text-neutral-400 mb-3">Nobody assigned yet.</p>
      ) : (
        <ul className="space-y-1.5 mb-3">
          {group.assignedEmployees.map((emp) => (
            <li
              key={emp.employeeId}
              className={
                "flex items-center justify-between text-sm rounded px-2 py-1.5" +
                (emp.vacancyReason ? " bg-red-50" : " bg-neutral-50")
              }
            >
              <button type="button" onClick={() => setEditingEmployeeId(emp.employeeId)} className="text-left hover:underline">
                <span className="font-medium">{emp.employeeName}</span>
                <span className="text-neutral-500"> — {formatPattern(emp.cells)}</span>
                {emp.vacancyReason && (
                  <span className="text-red-700 font-medium">
                    {" "}
                    · {VACANCY_LABELS[emp.vacancyReason] ?? emp.vacancyReason} {emp.vacancyStartsOn}
                  </span>
                )}
              </button>
              <EmployeeKebab group={group} employee={emp} />
            </li>
          ))}
        </ul>
      )}

      {editingEmployeeId != null ? (
        <PersonPatternEditor
          positionId={group.positionId}
          employeeId={editingEmployeeId}
          employeeName={editingAssigned?.employeeName ?? editingEligible?.name ?? ""}
          initialCells={editingAssigned?.cells ?? []}
          onDone={() => setEditingEmployeeId(null)}
        />
      ) : (
        <PersonPicker
          eligibleEmployees={group.eligibleEmployees}
          assignedIds={new Set(group.assignedEmployees.map((e) => e.employeeId))}
          onPick={(id) => setEditingEmployeeId(id)}
        />
      )}
    </div>
  );
}

function PersonPicker({
  eligibleEmployees,
  assignedIds,
  onPick,
}: {
  eligibleEmployees: { id: number; name: string }[];
  assignedIds: Set<number>;
  onPick: (id: number) => void;
}) {
  const [value, setValue] = useState<number | "">("");

  if (eligibleEmployees.length === 0) {
    return <p className="text-xs text-neutral-400">Nobody is assigned to this position in Employee admin yet.</p>;
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={value}
        onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
        className="border rounded px-2 py-1 text-sm"
      >
        <option value="">+ Add or edit a person…</option>
        {eligibleEmployees.map((e) => (
          <option key={e.id} value={e.id}>
            {e.name}
            {assignedIds.has(e.id) ? " (assigned)" : ""}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={value === ""}
        onClick={() => {
          if (value !== "") onPick(value);
        }}
        className="text-sm underline text-neutral-500 hover:text-black disabled:opacity-40 disabled:no-underline"
      >
        Edit pattern
      </button>
    </div>
  );
}

function PersonPatternEditor({
  positionId,
  employeeId,
  employeeName,
  initialCells,
  onDone,
}: {
  positionId: number;
  employeeId: number;
  employeeName: string;
  initialCells: TemplateCell[];
  onDone: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const initialKeys = useMemo(() => new Set(initialCells.map((c) => `${c.dayOfWeek}-${c.period}`)), [initialCells]);
  // Pre-checked from the person's current pattern (confirmed with Oliver
  // 2026-08-12) — editing an existing assignment starts from what they
  // already work, not a blank grid.
  const [checked, setChecked] = useState<Set<string>>(() => new Set(initialKeys));

  function toggle(dayOfWeek: number, period: string) {
    const key = `${dayOfWeek}-${period}`;
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function save() {
    const cells = Array.from(checked).map((key) => {
      const [d, p] = key.split("-");
      return { dayOfWeek: Number(d), period: p as "Lunch" | "Dinner" };
    });
    startTransition(async () => {
      await syncEmployeePositionTemplate(employeeId, positionId, cells);
      onDone();
    });
  }

  return (
    <div className="border rounded p-3 bg-neutral-50 mt-1">
      <p className="text-sm font-medium mb-2">{employeeName} — which days/shifts?</p>
      <table className="text-sm border-collapse mb-3">
        <thead>
          <tr>
            <th className="w-16"></th>
            {DISPLAY_DAYS.map((d) => (
              <th key={d} className="px-2 py-1 text-neutral-500 font-normal">
                {DAY_SHORT[d]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {PERIODS.map((period) => (
            <tr key={period}>
              <td className="text-neutral-500 pr-2">{period}</td>
              {DISPLAY_DAYS.map((d) => {
                const key = `${d}-${period}`;
                return (
                  <td key={d} className="text-center px-2 py-1">
                    <input type="checkbox" checked={checked.has(key)} onChange={() => toggle(d, period)} className="w-4 h-4" />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending}
          onClick={save}
          className="bg-black text-white px-4 py-1.5 rounded text-sm hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        <button type="button" onClick={onDone} className="text-sm text-neutral-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}

function EmployeeKebab({ group, employee }: { group: PositionTemplateGroup; employee: AssignedEmployeeGroup }) {
  const [open, setOpen] = useState(false);
  const [showVacancyForm, setShowVacancyForm] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isVacant = employee.vacancyReason !== null;
  const anyTemplateId = employee.cells[0]?.templateId;

  return (
    <div className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="text-neutral-400 hover:text-black px-1.5" aria-label="Actions">
        &#8942;
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-1 w-56 bg-white border rounded shadow-lg p-1 text-sm">
          {isVacant ? (
            <button
              type="button"
              disabled={isPending || !anyTemplateId}
              onClick={() =>
                startTransition(async () => {
                  if (anyTemplateId) await clearTemplateVacancy(anyTemplateId);
                  setOpen(false);
                })
              }
              className="block w-full text-left px-2 py-1.5 hover:bg-neutral-50 rounded disabled:opacity-50"
            >
              Clear vacancy
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                setShowVacancyForm(true);
                setOpen(false);
              }}
              className="block w-full text-left px-2 py-1.5 hover:bg-neutral-50 rounded"
            >
              Mark vacating…
            </button>
          )}
          <button
            type="button"
            disabled={isPending}
            onClick={() => {
              if (window.confirm(`Retire ${employee.employeeName} from ${group.positionName} entirely?`)) {
                startTransition(async () => {
                  await retireEmployeeFromPosition(employee.employeeId, group.positionId);
                  setOpen(false);
                });
              }
            }}
            className="block w-full text-left px-2 py-1.5 hover:bg-neutral-50 rounded text-red-700 disabled:opacity-50"
          >
            Retire from this position
          </button>
        </div>
      )}
      {showVacancyForm && (
        <VacancyPopoverForm
          templateId={anyTemplateId}
          onDone={() => setShowVacancyForm(false)}
          onCancel={() => setShowVacancyForm(false)}
        />
      )}
    </div>
  );
}

function VacancyPopoverForm({
  templateId,
  onDone,
  onCancel,
}: {
  templateId: number | undefined;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [reason, setReason] = useState<"RESIGNATION" | "PROMOTION" | "OTHER">("RESIGNATION");
  const [startsOn, setStartsOn] = useState(() => new Date().toISOString().slice(0, 10));

  const scopeHint: Record<typeof reason, string> = {
    RESIGNATION: "Flags every shift this person has, in any position.",
    PROMOTION: "Flags every shift they have in THIS position (other positions stay as-is).",
    OTHER: "Same scope as Promoted — use this when the reason is something else, e.g. dropping this position by choice.",
  };

  return (
    <div className="absolute right-0 z-20 mt-1 w-72 bg-white border rounded shadow-lg p-3 text-sm">
      <label className="block mb-2">
        <span className="block text-neutral-500 mb-1 text-xs">Reason</span>
        <select value={reason} onChange={(e) => setReason(e.target.value as typeof reason)} className="border rounded px-2 py-1 w-full">
          <option value="RESIGNATION">Resigning</option>
          <option value="PROMOTION">Promoted/moved to another position</option>
          <option value="OTHER">Other</option>
        </select>
      </label>
      <label className="block mb-2">
        <span className="block text-neutral-500 mb-1 text-xs">Starts on</span>
        <input type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} className="border rounded px-2 py-1 w-full" />
      </label>
      <p className="text-[11px] text-neutral-400 mb-2">{scopeHint[reason]}</p>
      <div className="flex items-center gap-3">
        <button
          type="button"
          disabled={isPending || !templateId}
          onClick={() =>
            startTransition(async () => {
              if (templateId) await setTemplateVacancy(templateId, reason, startsOn);
              onDone();
            })
          }
          className="bg-red-700 text-white px-3 py-1 rounded text-xs hover:bg-red-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Set"}
        </button>
        <button type="button" onClick={onCancel} className="text-xs text-neutral-500 underline">
          Cancel
        </button>
      </div>
    </div>
  );
}
