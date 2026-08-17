"use client";

/** Tip Pool Assignment board (2026-08-17) — a second way to edit the same
 * positionTipPools data the Positions page's per-position checkboxes
 * already write, confirmed with Oliver as a whole-restaurant-at-a-glance
 * view: a master list of every position on the left, one window per pool
 * on the right, arrow buttons (primary, works on phone) or drag-and-drop
 * (bonus, desktop) to toggle membership. A position can be in 0-3 pools
 * at once (e.g. Host is in both Pool 1 and Pool 2 — see db/schema.ts's
 * positionTipPools comment) so this is a TOGGLE interaction, not a
 * "move" interaction: nothing ever disappears from the master list.
 *
 * Every click saves immediately (no separate "Save" button) — optimistic
 * local update for a snappy feel, with the real server action firing in
 * the background; a failure reverts the optimistic change and shows an
 * error rather than leaving the UI silently out of sync with the DB. */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTipPoolMembership, updatePoolSplitMethod, type TipPoolGroup, type PoolSplitMethod } from "@/lib/actions/tipPools";
import type { PositionListRow } from "@/lib/positions/loadPositionsList";

const POOLS: { key: TipPoolGroup; label: string; title: string; hint: string; colorClass: string }[] = [
  { key: "POOL_1_DINE_IN", label: "Pool 1", title: "Pool 1 — Dine-in", hint: "Server, Runner, Bartender, Host, Busser", colorClass: "pool1" },
  {
    key: "POOL_2_TAKEOUT_ONLINE",
    label: "Pool 2",
    title: "Pool 2 — Takeout / Online",
    hint: "Host, Operator, Packer, Bag Handler",
    colorClass: "pool2",
  },
  { key: "POOL_3_DELIVERY", label: "Pool 3", title: "Pool 3 — Delivery", hint: "Delivery Guy (equal split, not point-weighted)", colorClass: "pool3" },
];

const COLOR = {
  pool1: { dot: "bg-blue-600", chip: "bg-blue-600", border: "border-blue-600", text: "text-blue-600", ring: "ring-blue-400 bg-blue-50" },
  pool2: { dot: "bg-emerald-600", chip: "bg-emerald-600", border: "border-emerald-600", text: "text-emerald-600", ring: "ring-emerald-400 bg-emerald-50" },
  pool3: { dot: "bg-amber-600", chip: "bg-amber-600", border: "border-amber-600", text: "text-amber-600", ring: "ring-amber-400 bg-amber-50" },
} as const;

type PoolColorKey = keyof typeof COLOR;

interface SplitMethods {
  POOL_1_DINE_IN: PoolSplitMethod;
  POOL_2_TAKEOUT_ONLINE: PoolSplitMethod;
  POOL_3_DELIVERY: PoolSplitMethod;
}

export function PoolBoard({ positions, splitMethods }: { positions: PositionListRow[]; splitMethods: SplitMethods }) {
  const [rows, setRows] = useState(positions);
  const [methods, setMethods] = useState(splitMethods);
  const [filter, setFilter] = useState<"all" | "unassigned" | "FOH" | "BOH">("all");
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggle(positionId: number, pool: TipPoolGroup, add: boolean) {
    setError(null);
    // Optimistic update first, for the snappy "game UI" feel.
    setRows((prev) =>
      prev.map((p) =>
        p.id !== positionId
          ? p
          : { ...p, tipPoolGroups: add ? [...p.tipPoolGroups, pool] : p.tipPoolGroups.filter((g) => g !== pool) }
      )
    );
    startTransition(async () => {
      try {
        await toggleTipPoolMembership(positionId, pool, add);
        router.refresh();
      } catch (e) {
        // Revert on failure so the board never silently drifts from the DB.
        setRows((prev) =>
          prev.map((p) =>
            p.id !== positionId
              ? p
              : { ...p, tipPoolGroups: add ? p.tipPoolGroups.filter((g) => g !== pool) : [...p.tipPoolGroups, pool] }
          )
        );
        setError(e instanceof Error ? e.message : "Couldn't save that change — try again.");
      }
    });
  }

  function changeSplitMethod(pool: TipPoolGroup, method: PoolSplitMethod) {
    setError(null);
    const prevMethod = methods[pool];
    setMethods((m) => ({ ...m, [pool]: method }));
    startTransition(async () => {
      try {
        await updatePoolSplitMethod(pool, method);
        router.refresh();
      } catch (e) {
        setMethods((m) => ({ ...m, [pool]: prevMethod }));
        setError(e instanceof Error ? e.message : "Couldn't save the split method — try again.");
      }
    });
  }

  const filtered = rows.filter((p) => {
    if (filter === "unassigned") return p.tipPoolGroups.length === 0;
    if (filter === "FOH" || filter === "BOH") return p.category === filter;
    return true;
  });

  return (
    <div>
      {error && <div className="border border-red-300 bg-red-50 text-red-700 rounded p-3 text-sm mb-4">{error}</div>}

      <div className="flex items-center gap-2 mb-4 text-xs">
        {(["all", "unassigned", "FOH", "BOH"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "px-3 py-1.5 rounded-full border font-medium " +
              (filter === f ? "bg-black text-white border-black" : "bg-white text-neutral-500 border-neutral-200 hover:bg-neutral-50")
            }
          >
            {f === "all" ? "All positions" : f === "unassigned" ? "Unassigned only" : f}
          </button>
        ))}
      </div>

      <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
        <div className="border rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-neutral-500">All positions</span>
            <span className="text-xs bg-neutral-100 rounded-full px-2 py-0.5 font-medium">{filtered.length}</span>
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-neutral-400">No positions match this filter.</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((p) => (
                <MasterCard key={p.id} position={p} onToggle={toggle} dragId={dragId} setDragId={setDragId} />
              ))}
            </div>
          )}
        </div>

        <div className="grid sm:grid-cols-3 gap-3">
          {POOLS.map((pool) => (
            <PoolWindow
              key={pool.key}
              pool={pool}
              positions={rows.filter((p) => p.tipPoolGroups.includes(pool.key))}
              method={methods[pool.key]}
              onChangeMethod={(m) => changeSplitMethod(pool.key, m)}
              onToggle={toggle}
              dragId={dragId}
              setDragId={setDragId}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-neutral-400 mt-4 text-center">
        Every change saves immediately. Tap the +/✓ buttons (works on phone), or drag a card into a pool window on
        desktop.
      </p>
    </div>
  );
}

function MasterCard({
  position,
  onToggle,
  dragId,
  setDragId,
}: {
  position: PositionListRow;
  onToggle: (positionId: number, pool: TipPoolGroup, add: boolean) => void;
  dragId: number | null;
  setDragId: (id: number | null) => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => setDragId(position.id)}
      onDragEnd={() => setDragId(null)}
      className={
        "flex items-center justify-between gap-2 rounded-lg border bg-neutral-50 px-2.5 py-2 cursor-grab active:cursor-grabbing" +
        (dragId === position.id ? " opacity-40" : "") +
        (!position.active ? " opacity-50" : "")
      }
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate">
          {position.name}
          {!position.active && <span className="text-neutral-400 font-normal"> (retired)</span>}
        </div>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {position.tipPoolGroups.length === 0 ? (
            <span className="text-[10px] text-neutral-400">Unassigned</span>
          ) : (
            position.tipPoolGroups.map((g) => {
              const pool = POOLS.find((p) => p.key === g)!;
              const c = COLOR[pool.colorClass as PoolColorKey];
              return (
                <span key={g} className={`text-[9px] font-bold text-white rounded px-1.5 py-0.5 ${c.chip}`}>
                  {pool.label}
                </span>
              );
            })
          )}
        </div>
      </div>
      <div className="flex gap-1 shrink-0">
        {POOLS.map((pool) => {
          const active = position.tipPoolGroups.includes(pool.key);
          const c = COLOR[pool.colorClass as PoolColorKey];
          return (
            <button
              key={pool.key}
              type="button"
              title={`${active ? "Remove from" : "Add to"} ${pool.title}`}
              onClick={() => onToggle(position.id, pool.key, !active)}
              className={
                "w-6 h-6 rounded border text-xs flex items-center justify-center font-semibold " +
                (active ? `text-white border-transparent ${c.chip}` : "bg-white border-neutral-200 text-neutral-400 hover:bg-neutral-100")
              }
            >
              {active ? "✓" : "+"}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PoolWindow({
  pool,
  positions,
  method,
  onChangeMethod,
  onToggle,
  dragId,
  setDragId,
}: {
  pool: (typeof POOLS)[number];
  positions: PositionListRow[];
  method: PoolSplitMethod;
  onChangeMethod: (m: PoolSplitMethod) => void;
  onToggle: (positionId: number, pool: TipPoolGroup, add: boolean) => void;
  dragId: number | null;
  setDragId: (id: number | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const c = COLOR[pool.colorClass as PoolColorKey];

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        if (dragId == null) return;
        onToggle(dragId, pool.key, true);
        setDragId(null);
      }}
      className={"rounded-xl border-2 border-dashed p-3 min-h-[220px] " + (dragOver ? `${c.ring} ring-2` : "border-neutral-200")}
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
        <span className="text-[13px] font-semibold">{pool.title}</span>
      </div>
      <p className="text-[11px] text-neutral-400 mb-2">{pool.hint}</p>

      <div className="space-y-1.5 mb-3">
        {positions.length === 0 ? (
          <div className="text-[11px] text-neutral-400 text-center border border-dashed rounded-lg py-5 px-2">
            No positions in this pool yet.
            <br />
            Tap + on a position, or drag it here.
          </div>
        ) : (
          positions.map((p) => {
            const otherPools = p.tipPoolGroups.filter((g) => g !== pool.key);
            return (
              <div
                key={p.id}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => setDragId(null)}
                className={"flex items-center justify-between gap-2 rounded-lg border bg-white px-2.5 py-2 cursor-grab active:cursor-grabbing" + (dragId === p.id ? " opacity-40" : "")}
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate">{p.name}</div>
                  {otherPools.length > 0 && (
                    <div className="text-[10px] text-neutral-400">
                      also in {otherPools.map((g) => POOLS.find((pl) => pl.key === g)!.label).join(", ")}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  title={`Remove from ${pool.title}`}
                  onClick={() => onToggle(p.id, pool.key, false)}
                  className="w-6 h-6 rounded border border-neutral-200 text-neutral-400 hover:bg-neutral-100 text-xs flex items-center justify-center shrink-0"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      <label className="block text-[11px] text-neutral-500">
        Split method
        <select
          value={method}
          onChange={(e) => onChangeMethod(e.target.value as PoolSplitMethod)}
          className="block w-full mt-1 border rounded px-2 py-1 text-xs"
        >
          <option value="POINT_WEIGHTED">Point-weighted</option>
          <option value="EQUAL_SPLIT">Equal split</option>
        </select>
      </label>
    </div>
  );
}
