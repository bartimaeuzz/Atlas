"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { EmployeeListRow } from "@/lib/employees/loadEmployeesList";
import { EmployeeToggleActiveButton } from "./EmployeeToggleActiveButton";

type SortKey = "name" | "primaryPosition" | "positions" | "role";
type SortDir = "asc" | "desc";

/** Sortable Employees table (2026-08-10, Oliver: "a tiny touch... can you
 * add sorting to these column?"). Client-side, local React state — the
 * list is small (tens of employees, not thousands) and this is purely a
 * viewing convenience, so a full server round-trip / URL-param sort
 * wasn't worth the extra complexity. Split out of page.tsx (which stays a
 * server component doing the actual data load) since sort state needs to
 * live in the browser. */
export function EmployeesTable({ employeeList }: { employeeList: EmployeeListRow[] }) {
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
    <table className="w-full text-sm border-collapse">
      <thead>
        <tr className="text-left text-neutral-500 border-b">
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
          <th className="py-2"></th>
          <th className="py-2"></th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((e) => (
          <tr key={e.id} className={"border-b" + (e.active ? "" : " opacity-50")}>
            <td className="py-2">
              {e.nickname}
              {!e.active && <span className="ml-2 text-xs text-neutral-400">(retired)</span>}
            </td>
            <td className="py-2 text-neutral-500">{e.primaryPositionName ?? "—"}</td>
            <td className="py-2 text-neutral-500">
              {e.positions.length === 0 ? "—" : e.positions.map((p) => p.positionName).join(", ")}
            </td>
            <td className="py-2 text-neutral-500">{e.systemRole}</td>
            <td className="py-2 text-right">
              <Link href={`/employees/${e.id}/edit`} className="underline text-blue-600">
                Edit
              </Link>
            </td>
            <td className="py-2 text-right">
              <EmployeeToggleActiveButton employeeId={e.id} active={e.active} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
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
    <th className="py-2">
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className="flex items-center gap-1 font-medium text-neutral-500 hover:text-black"
      >
        {label}
        <span className="text-xs w-3 inline-block">{isActive ? (dir === "asc" ? "▲" : "▼") : ""}</span>
      </button>
    </th>
  );
}
