import { EmployeeCapabilityCard } from "./EmployeeCapabilityCard";
import { ACCOUNT_TYPE_LABELS } from "@/lib/permissions/capabilities";
import { computePresetDrift, driftIsEmpty, summarizeDrift } from "@/lib/permissions/presetDrift";
import { formatSystemRole, type SystemRole } from "@/lib/format/formatSystemRole";
import type { CapabilityMatrixEmployeeRow } from "@/lib/permissions/loadCapabilityMatrix";

/** One card per system role (2026-08-23, Oliver: "group people by role,
 * each role in the same table card").
 *
 * Replaces one card per person — 24 identical cards in a flat list, where
 * finding "who is a manager" meant reading every header. Grouping is by
 * systemRole (three values), NOT by Account Type preset (five), because
 * the role is what actually decides which pages an account can reach.
 *
 * Each row expands to that person's existing capability panel. Built on
 * <details>/<summary> rather than client state on purpose: the row has to
 * be openable before JavaScript settles on a slow restaurant terminal,
 * and there is no state here worth hydrating.
 *
 * The STAFF card is collapsed by default — it holds most of the roster,
 * and an Admin visiting this page is almost never coming to look at it.
 */
export function RoleGroupCard({
  role,
  employees,
  defaultOpen,
}: {
  role: SystemRole;
  employees: CapabilityMatrixEmployeeRow[];
  defaultOpen: boolean;
}) {
  return (
    <details open={defaultOpen} className="rounded-[var(--radius-md)] border border-[var(--border)] bg-white overflow-hidden">
      <summary className="cursor-pointer select-none flex items-center justify-between gap-3 px-4 min-h-11 py-2.5 font-medium hover:bg-[var(--hover)]">
        <span>{formatSystemRole(role)}</span>
        <span className="text-xs font-normal text-[var(--ink-500)]">
          {employees.length} {employees.length === 1 ? "person" : "people"}
        </span>
      </summary>

      {employees.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[var(--ink-500)] border-t border-[var(--border)]">Nobody in this role.</p>
      ) : (
        <ul className="border-t border-[var(--border)]">
          {employees.map((e) => (
            <li key={e.employeeId} className="border-b border-[var(--border)] last:border-b-0">
              <PersonRow employee={e} />
            </li>
          ))}
        </ul>
      )}
    </details>
  );
}

function PersonRow({ employee }: { employee: CapabilityMatrixEmployeeRow }) {
  const drift = employee.accountType ? computePresetDrift(employee.capabilities, employee.accountType) : null;

  return (
    <details className="group">
      <summary className="cursor-pointer select-none px-4 min-h-11 py-2.5 hover:bg-[var(--hover)] grid grid-cols-[1fr_auto] sm:grid-cols-[minmax(0,10rem)_minmax(0,9rem)_1fr_auto] items-center gap-x-3 gap-y-0.5 text-sm">
        <span className="font-medium text-[var(--ink-900)] truncate">
          {employee.nickname}
          {!employee.active && <span className="ml-2 text-xs font-normal text-[var(--ink-500)]">inactive</span>}
        </span>

        <span className="text-xs text-[var(--ink-500)] col-start-1 sm:col-start-2 truncate">
          {employee.accountType ? ACCOUNT_TYPE_LABELS[employee.accountType] : "No preset applied yet"}
        </span>

        {/* The drift summary. An account sitting exactly on its preset
            says so in words rather than showing an empty cell — blank
            would read as "not loaded" to the audience this app is for. */}
        <span className="text-xs col-start-1 sm:col-start-3 truncate">
          {drift === null ? (
            <span className="text-[var(--ink-400)]">—</span>
          ) : driftIsEmpty(drift) ? (
            <span className="text-[var(--ink-500)]">Matches preset</span>
          ) : (
            <span className="text-[var(--ink-700)]" title={summarizeDrift(drift, 99)}>
              {summarizeDrift(drift)}
            </span>
          )}
        </span>

        <span className="text-xs text-[var(--ink-500)] row-start-1 col-start-2 sm:col-start-4 justify-self-end">
          <span className="group-open:hidden">Open ▾</span>
          <span className="hidden group-open:inline">Close ▴</span>
        </span>
      </summary>

      <div className="bg-[var(--paper)]">
        <EmployeeCapabilityCard employee={employee} showHeader={false} />
      </div>
    </details>
  );
}
