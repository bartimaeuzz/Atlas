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
 * error rather than leaving the UI silently out of sync with the DB.
 *
 * Restyled onto design-system-v2 2026-08-19 — pure visual/structural
 * restyle, the toggle/drag interaction model above is untouched (same
 * `toggle`/`changeSplitMethod` functions, same optimistic-update +
 * revert-on-failure logic, same HTML5 drag handlers). Mobile layout was
 * already "stack, don't squeeze": the `lg:grid-cols-[260px_1fr]` master/
 * board split and the pool windows' `sm:grid-cols-3` both fall back to a
 * single column below their breakpoint, so at 375-390px this was already
 * master list, then Pool 1, then Pool 2, then Pool 3, each full-width and
 * scrolled vertically — never 3 squeezed columns. Kept that structure
 * rather than inventing a tab switcher: drag-and-drop is desktop-only
 * anyway (HTML5 DnD doesn't fire on touch), so the phone workflow is
 * "scroll master list, tap +, scroll to the pool to see it landed" either
 * way, and a stacked list keeps all 3 pools reachable by scroll without
 * an extra tap to switch tabs. Also fixed: the master card's per-pool
 * toggle buttons carried their ONLY pool-identity signal in a hover-only
 * `title=` (bare "+"/"✓" glyphs, indistinguishable from each other on
 * touch) — flagged in project_atlas_pool_assignment_ui memory as a title=
 * migration candidate. Converted to an always-visible signal instead:
 * each inactive button now shows its pool's number ("1"/"2"/"3") in that
 * pool's own color, so identity no longer depends on hover; title=/
 * aria-label kept as a bonus desktop tooltip + screen-reader name. The
 * pool-window remove button's title= was left as-is — it sits inside a
 * window whose colored dot + full pool name are already visible right
 * above it, so title= is genuinely supplementary there, not the only
 * channel. Pool colors (blue/emerald/amber) stay literal Tailwind
 * classes, not new CSS tokens — they're a categorical (not semantic)
 * mapping specific to this one board, which is exactly the "one-off, no
 * new token" case the retrofit rules call for.
 *
 * Touch-target fix 2026-08-19 (scrutinize catch): the toggle/remove
 * buttons originally shipped as `w-7 h-7` (28×28) plus `TAP_TARGET_PAD`.
 * That combination doesn't work -- TAP_TARGET_PAD's padding only grows a
 * tap target on elements without an explicit size; on a fixed `w-7 h-7`
 * box under Tailwind's border-box sizing, the padding is absorbed inside
 * the box instead of growing it, so the real hit target stayed 28×28.
 * Fixed by sizing the buttons with `min-h-11 min-w-11` directly instead
 * (same technique already used correctly on People's mobile sort-
 * direction button) -- a real 44×44 target, Oliver's explicit pick over
 * the alternative (small glyph + invisibly-grown hit box, which would
 * have left adjacent buttons' tap zones slightly overlapping at this
 * board's 4px gap). */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleTipPoolMembership, updatePoolSplitMethod, type TipPoolGroup, type PoolSplitMethod } from "@/lib/actions/tipPools";
import type { PositionListRow } from "@/lib/positions/loadPositionsList";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Select } from "@/components/ui/Field";

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
  pool3: { dot: "bg-amber-600", chip: "bg-amber-600", border: "border-amber-600", text: "text-amber-600", ring: "ring-amber-400 bg-[var(--warning-tint)]" },
} as const;

type PoolColorKey = keyof typeof COLOR;

interface SplitMethods {
  POOL_1_DINE_IN: PoolSplitMethod;
  POOL_2_TAKEOUT_ONLINE: PoolSplitMethod;
  POOL_3_DELIVERY: PoolSplitMethod;
}

/** readOnly (2026-08-21, Permission System Phase C): VIEW_SETTINGS
 * without EDIT_SETTINGS. Handled inside this component rather than by
 * wrapping it in a disabled <fieldset> from the page, for two reasons a
 * fieldset can't cover:
 *
 *  - Drag-and-drop lives on plain <div>s (draggable / onDrop below).
 *    `disabled` on a fieldset only affects form-associated elements, so
 *    a disabled wrapper would still let a desktop user drag a position
 *    into a pool, watch the optimistic update move it, and then get a
 *    red "Not authorized." banner when the server action refused --
 *    exactly the failure read-only mode exists to prevent.
 *  - The All/Unassigned/FOH/BOH filters are pure view state. A fieldset
 *    would disable those too, taking away filtering from someone who is
 *    only reading -- which is when filtering is most useful.
 *
 * Everything that writes is disabled; everything that only looks stays
 * live. */
export function PoolBoard({
  positions,
  splitMethods,
  readOnly = false,
}: {
  positions: PositionListRow[];
  splitMethods: SplitMethods;
  readOnly?: boolean;
}) {
  const [rows, setRows] = useState(positions);
  const [methods, setMethods] = useState(splitMethods);
  const [filter, setFilter] = useState<"all" | "unassigned" | "FOH" | "BOH">("all");
  const [error, setError] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const router = useRouter();

  function toggle(positionId: number, pool: TipPoolGroup, add: boolean) {
    if (readOnly) return;
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
    if (readOnly) return;
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
      {error && (
        <div className="mb-4">
          <Banner tone="danger" title={error} />
        </div>
      )}

      <div className="flex items-center gap-2 mb-4 text-xs flex-wrap">
        {(["all", "unassigned", "FOH", "BOH"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={
              "px-3.5 py-2 rounded-[var(--radius-full)] border font-medium transition-colors " +
              (filter === f
                ? "bg-[var(--primary)] text-white border-transparent"
                : "bg-[var(--card)] text-[var(--ink-500)] border-[var(--border)] hover:bg-[var(--paper)]")
            }
          >
            {f === "all" ? "All positions" : f === "unassigned" ? "Unassigned only" : f}
          </button>
        ))}
      </div>

      {/* Below lg (and always on phone, ~375-390px), this falls back to a
       * single stacked column: master list, then the 3 pool windows (each
       * of which also stacks below sm) -- see the file-header note on why
       * that beats a tab switcher here. */}
      <div className="grid lg:grid-cols-[260px_1fr] gap-4 items-start">
        <Card className="p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-500)]">All positions</span>
            <Badge tone="neutral">{filtered.length}</Badge>
          </div>
          {filtered.length === 0 ? (
            <p className="text-xs text-[var(--ink-500)]">No positions match this filter.</p>
          ) : (
            <div className="space-y-1.5">
              {filtered.map((p) => (
                <MasterCard key={p.id} position={p} onToggle={toggle} dragId={dragId} setDragId={setDragId} readOnly={readOnly} />
              ))}
            </div>
          )}
        </Card>

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
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>

      <p className="text-xs text-[var(--ink-500)] mt-4 text-center">
        {readOnly
          ? "This is how the pools are set up today. You can look, but changing it needs Edit Settings access."
          : "Every change saves immediately. Tap the number buttons (works on phone), or drag a card into a pool window on desktop."}
      </p>
    </div>
  );
}

function MasterCard({
  readOnly,
  position,
  onToggle,
  dragId,
  setDragId,
}: {
  position: PositionListRow;
  onToggle: (positionId: number, pool: TipPoolGroup, add: boolean) => void;
  dragId: number | null;
  setDragId: (id: number | null) => void;
  readOnly: boolean;
}) {
  return (
    <div
      draggable={!readOnly}
      onDragStart={() => setDragId(position.id)}
      onDragEnd={() => setDragId(null)}
      className={
        "flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--paper)] px-2.5 py-2" +
        (readOnly ? "" : " cursor-grab active:cursor-grabbing") +
        (dragId === position.id ? " opacity-40" : "") +
        (!position.active ? " opacity-50" : "")
      }
    >
      <div className="min-w-0">
        <div className="text-[13px] font-medium truncate text-[var(--ink-900)]">
          {position.name}
          {!position.active && <span className="text-[var(--ink-400)] font-normal"> (retired)</span>}
        </div>
        <div className="flex gap-1 mt-0.5 flex-wrap">
          {position.tipPoolGroups.length === 0 ? (
            <span className="text-[10px] text-[var(--ink-400)]">Unassigned</span>
          ) : (
            position.tipPoolGroups.map((g) => {
              const pool = POOLS.find((p) => p.key === g)!;
              const c = COLOR[pool.colorClass as PoolColorKey];
              return (
                <span key={g} className={`text-[9px] font-bold text-white rounded-[var(--radius-sm)] px-1.5 py-0.5 ${c.chip}`}>
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
          const actionLabel = `${active ? "Remove from" : "Add to"} ${pool.title}`;
          return (
            <button
              key={pool.key}
              type="button"
              title={actionLabel}
              aria-label={actionLabel}
              aria-pressed={active}
              disabled={readOnly}
              onClick={() => onToggle(position.id, pool.key, !active)}
              className={
                "min-h-11 min-w-11 rounded-[var(--radius-sm)] text-[13px] flex items-center justify-center font-bold transition-colors " +
                // Without these, a disabled button still lights up on
                // hover (:hover matches disabled elements) and then does
                // nothing on click -- which reads as broken rather than
                // as read-only. Same treatment SettingsForm's submit
                // button already uses.
                //
                // bg-inherit, NOT bg-[var(--card)]: `disabled:hover:` is
                // one class plus two pseudo-classes, so it outranks the
                // active branch's own bg-blue-600/emerald/amber -- an
                // in-pool button would have painted itself white while
                // its "✓" stayed white, making the glyph vanish.
                "disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-inherit " +
                (active
                  ? `text-white border border-transparent ${c.chip}`
                  : `bg-[var(--card)] border ${c.border} ${c.text} hover:bg-[var(--paper)]`)
              }
            >
              {active ? "✓" : pool.label.slice(-1)}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PoolWindow({
  readOnly,
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
  readOnly: boolean;
  onToggle: (positionId: number, pool: TipPoolGroup, add: boolean) => void;
  dragId: number | null;
  setDragId: (id: number | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);
  const c = COLOR[pool.colorClass as PoolColorKey];

  return (
    <div
      onDragOver={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        if (readOnly) return;
        e.preventDefault();
        setDragOver(false);
        if (dragId == null) return;
        onToggle(dragId, pool.key, true);
        setDragId(null);
      }}
      className={
        "rounded-[var(--radius-lg)] border-2 border-dashed p-3 min-h-[220px] bg-[var(--card)] transition-colors " +
        (dragOver ? `${c.ring} ring-2` : "border-[var(--border-strong)]")
      }
    >
      <div className="flex items-center gap-2 mb-0.5">
        <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
        <span className="text-[13px] font-semibold text-[var(--ink-900)]">{pool.title}</span>
      </div>
      <p className="text-[11px] text-[var(--ink-500)] mb-2">{pool.hint}</p>

      <div className="space-y-1.5 mb-3">
        {positions.length === 0 ? (
          <div className="text-[11px] text-[var(--ink-500)] text-center border border-dashed border-[var(--border)] rounded-[var(--radius-md)] py-5 px-2">
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
                draggable={!readOnly}
                onDragStart={() => setDragId(p.id)}
                onDragEnd={() => setDragId(null)}
                className={
                  "flex items-center justify-between gap-2 rounded-[var(--radius-md)] border border-[var(--border)] bg-[var(--card)] px-2.5 py-2" +
                  (readOnly ? "" : " cursor-grab active:cursor-grabbing") +
                  (dragId === p.id ? " opacity-40" : "")
                }
              >
                <div className="min-w-0">
                  <div className="text-[13px] font-medium truncate text-[var(--ink-900)]">{p.name}</div>
                  {otherPools.length > 0 && (
                    <div className="text-[10px] text-[var(--ink-500)]">
                      also in {otherPools.map((g) => POOLS.find((pl) => pl.key === g)!.label).join(", ")}
                    </div>
                  )}
                </div>
                {/* title= left in place here (not migrated to a visible
                 * caption): this button sits directly under the pool's
                 * colored dot + full name in the header above, so the
                 * pool identity is already visible without hovering --
                 * unlike the master card's toggle buttons, title= here is
                 * genuinely supplementary, not the only channel. */}
                <button
                  type="button"
                  title={`Remove from ${pool.title}`}
                  aria-label={`Remove from ${pool.title}`}
                  disabled={readOnly}
                  onClick={() => onToggle(p.id, pool.key, false)}
                  className="min-h-11 min-w-11 rounded-[var(--radius-sm)] border border-[var(--border)] text-[var(--ink-500)] hover:bg-[var(--paper)] hover:text-[var(--ink-900)] text-sm flex items-center justify-center shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-transparent disabled:hover:text-[var(--ink-500)]"
                >
                  ✕
                </button>
              </div>
            );
          })
        )}
      </div>

      <Select
        label="Split method"
        value={method}
        disabled={readOnly}
        onChange={(e) => onChangeMethod(e.target.value as PoolSplitMethod)}
        className="text-xs"
      >
        <option value="POINT_WEIGHTED">Point-weighted</option>
        <option value="EQUAL_SPLIT">Equal split</option>
      </Select>
    </div>
  );
}
