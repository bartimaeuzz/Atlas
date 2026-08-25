"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EmployeeListRow } from "@/lib/employees/loadEmployeesList";
import { EmployeeToggleActiveButton } from "./EmployeeToggleActiveButton";
import { GenerateLoginIdControl } from "./GenerateLoginIdControl";
import { Select } from "@/components/ui/Field";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { TableCard } from "@/components/ui/Table";
import { ChevronDownIcon } from "@/components/ui/icons";
import { MonthRow } from "@/app/(protected)/ledger/MonthRow";

type SortKey = "name" | "primaryPosition" | "positions" | "role";
type SortDir = "asc" | "desc";

const SORT_LABEL: Record<SortKey, string> = {
  name: "Name",
  primaryPosition: "Primary position",
  positions: "Positions",
  role: "Role",
};

/** Sortable People table (2026-08-10, Oliver: "a tiny touch... can you
 * add sorting to these column?"; renamed from EmployeesTable 2026-08-17
 * along with the page itself, Oliver: "change employees page to
 * People"). Client-side, local React state — the list is small (tens of
 * employees, not thousands) and this is purely a viewing convenience, so
 * a full server round-trip / URL-param sort wasn't worth the extra
 * complexity. Split out of page.tsx (which stays a server component
 * doing the actual data load) since sort state needs to live in the
 * browser.
 *
 * Restyled onto the design system 2026-08-19 -- this is a genuine HTML
 * `<table>` (unlike most list screens elsewhere in the app), so it gets
 * the standard stacked-cards-on-phone / table-on-desktop split, same
 * pattern as `ledger/MonthList.tsx`. The column-header sort buttons only
 * make sense in the table layout, so the phone cards get an equivalent
 * "Sort by" control instead of silently dropping the feature below the
 * `sm` breakpoint. */
export function PeopleTable({
  employeeList,
  viewerIsAdmin,
}: {
  employeeList: EmployeeListRow[];
  viewerIsAdmin: boolean;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const sorted = useMemo(() => {
    const value = (e: EmployeeListRow): string => {
      switch (sortKey) {
        case "name":
          return e.nickname;
        case "primaryPosition":
          return e.primaryPositionName ?? "";
        case "positions":
          return e.positions.map((p) => p.positionName).join(", ");
        case "role":
          return e.systemRole;
      }
    };
    const copy = [...employeeList];
    copy.sort((a, b) => {
      const cmp = value(a).localeCompare(value(b));
      return sortDir === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [employeeList, sortKey, sortDir]);

  return (
    <div>
      {/* Phone: sort control + stacked cards */}
      <div className="lg:hidden mb-3 flex items-center gap-2">
        <div className="flex-1">
          <Select
            aria-label="Sort by"
            value={sortKey}
            onChange={(e) => {
              setSortKey(e.target.value as SortKey);
              setSortDir("asc");
            }}
          >
            {(Object.keys(SORT_LABEL) as SortKey[]).map((k) => (
              <option key={k} value={k}>
                Sort: {SORT_LABEL[k]}
              </option>
            ))}
          </Select>
        </div>
        <button
          type="button"
          onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
          aria-label={sortDir === "asc" ? "Sort ascending" : "Sort descending"}
          className="min-h-11 min-w-11 flex items-center justify-center text-[var(--ink-700)] border border-[var(--border-strong)] rounded-[var(--radius-md)] bg-[var(--card)]"
        >
          {sortDir === "asc" ? "▲" : "▼"}
        </button>
      </div>

      <div className="lg:hidden space-y-3">
        {sorted.map((e) => {
          // Card opens the person's PROFILE page (2026-08-24, Oliver's
          // second pass: "i think we need a staff profile page" -- view
          // first, Edit behind a button there). Replaced the same-day
          // tap-to-expand accordion; the detail now has a real page.
          return (
            <Link
              key={e.id}
              href={`/people/${e.id}`}
              className={
                "flex items-center justify-between gap-2 bg-[var(--card)] border border-[var(--border)] rounded-[var(--radius-lg)] p-4 min-h-11" +
                (e.active ? "" : " opacity-50")
              }
            >
              <div>
                <div className="font-semibold text-[var(--ink-900)]">
                  {e.nickname}
                  {!e.active && <span className="ml-2 text-xs text-[var(--ink-500)] font-normal">(retired)</span>}
                </div>
                <div className="text-xs text-[var(--ink-500)] mt-0.5">
                  {e.systemRole}
                  {e.primaryPositionName ? ` · ${e.primaryPositionName}` : ""}
                </div>
              </div>
              <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90" />
            </Link>
          );
        })}
      </div>

      {/* Desktop: table, in the shared TableCard border (2026-08-24
          standard). TableCard owns the hidden lg:block split. */}
      <TableCard>
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="text-left text-[var(--ink-500)] border-b border-[var(--border)]">
            <SortableHeader label="Name" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortableHeader
              label="Primary position"
              sortKey="primaryPosition"
              activeKey={sortKey}
              dir={sortDir}
              onSort={handleSort}
            />
            <SortableHeader label="Positions" sortKey="positions" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <SortableHeader label="Role" sortKey="role" activeKey={sortKey} dir={sortDir} onSort={handleSort} />
            <th className="py-2 px-3 font-medium">Login ID</th>
            <th className="py-2 px-3"></th>
            <th className="py-2 px-3"></th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((e) => {
            const primaryPositionCategory =
              e.positions.find((p) => p.positionId === e.primaryPositionId)?.positionCategory ?? null;
            return (
              // Whole row clickable with a pointer (Oliver, 2026-08-24),
              // same shared MonthRow as the Ledger/Shifts pickers; the name
              // link stays the keyboard tab stop, and the row's own
              // buttons/selects keep their behaviour.
              <MonthRow key={e.id} href={`/people/${e.id}`} isToday={false} className={e.active ? "" : "opacity-50"}>
                <td className="py-2 px-3 text-[var(--ink-900)]">
                  <Link href={`/people/${e.id}`} className="font-medium hover:underline">
                    {e.nickname}
                  </Link>
                  {!e.active && <span className="ml-2 text-xs text-[var(--ink-500)]">(retired)</span>}
                </td>
                <td className="py-2 px-3 text-[var(--ink-700)]">{e.primaryPositionName ?? "—"}</td>
                <td className="py-2 px-3 text-[var(--ink-700)]">
                  {e.positions.length === 0 ? "—" : e.positions.map((p) => p.positionName).join(", ")}
                </td>
                <td className="py-2 px-3 text-[var(--ink-700)]">{e.systemRole}</td>
                <td className="py-2 px-3">
                  <GenerateLoginIdControl
                    employeeId={e.id}
                    loginId={e.loginId}
                    isPartner={e.isPartner}
                    primaryPositionCategory={primaryPositionCategory}
                    viewerIsAdmin={viewerIsAdmin}
                  />
                </td>
                <td className="py-2 px-3 text-right">
                  <Link href={`/people/${e.id}/edit`} className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] underline ${TAP_TARGET_PAD}`}>
                    Edit
                  </Link>
                </td>
                <td className="py-2 px-3 text-right">
                  <EmployeeToggleActiveButton employeeId={e.id} active={e.active} />
                </td>
              </MonthRow>
            );
          })}
        </tbody>
      </table>
      </TableCard>
    </div>
  );
}

function SortableHeader({
  label,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  activeKey: SortKey;
  dir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  const isActive = sortKey === activeKey;
  return (
    <th className="py-2 px-3 font-medium">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 font-medium text-[var(--ink-500)] hover:text-[var(--ink-900)]"
      >
        {label}
        <span className="text-xs w-3 inline-block">{isActive ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}
