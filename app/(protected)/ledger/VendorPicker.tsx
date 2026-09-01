"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Field";

export interface TaggedVendor {
  id: number;
  name: string;
  tags: string[];
}

/** Vendor dropdown with tag filter chips (2026-08-31, Aey: "add tag or
 * category to vendor so when search can select only group that she want
 * to use. kill a list of eyesore. eg. want to add invoice or petty cash
 * from bar stuff -> show only bar related vendor").
 *
 * Chips render only when at least one vendor actually carries a tag —
 * a restaurant that never tags anything sees exactly the old dropdown.
 * A vendor with several tags appears under each of them. The currently
 * selected vendor always stays in the list even when a chip would
 * filter it out — filtering must never silently unset a choice. */
export function VendorPicker({
  vendors,
  name,
  label,
  required,
  noneLabel,
}: {
  vendors: TaggedVendor[];
  name: string;
  label: string;
  required?: boolean;
  /** When set, an empty choice is allowed and shown with this label
   * (petty cash's "No vendor"); absent = required-style "Choose…". */
  noneLabel?: string;
}) {
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>("");

  // Deduped case-insensitively (2026-08-31 visual audit: "Bar" and "bar"
  // on different vendors rendered as two chips) — first spelling wins,
  // matching happens lowercased.
  const tagMap = new Map<string, string>();
  for (const v of vendors) for (const t of v.tags) if (!tagMap.has(t.toLowerCase())) tagMap.set(t.toLowerCase(), t);
  const allTags = Array.from(tagMap.values()).sort((a, b) => a.localeCompare(b));
  const filtered =
    activeTag === null
      ? vendors
      : vendors.filter((v) => v.tags.some((t) => t.toLowerCase() === activeTag.toLowerCase()) || String(v.id) === selectedId);

  return (
    <div>
      <Select name={name} label={label} required={required} value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
        <option value="">{noneLabel ?? "Choose…"}</option>
        {filtered.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      {/* Chips BELOW the select (2026-08-31 visual audit, the headline
          regression): above the label they pushed the Vendor cell out of
          line with its paired Category field — 114px of skew at 390px —
          and read as belonging to the field ABOVE. Below the select the
          grid rows stay label-aligned and the chips visually attach to
          the control they filter. Data-triggered: with zero tags this
          whole block is absent, which is exactly how the misalignment
          shipped unseen. */}
      {allTags.length > 0 && (
        <div role="group" aria-label="Filter vendors by tag" className="flex flex-wrap items-center gap-1.5 mt-1.5">
          <span className="text-[11px] text-[var(--ink-500)]">Filter:</span>
          <button
            type="button"
            onClick={() => setActiveTag(null)}
            aria-pressed={activeTag === null}
            className={
              "min-h-8 px-2.5 rounded-[var(--radius-full)] text-xs font-medium border " +
              (activeTag === null
                ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)] hover:bg-[var(--hover)]")
            }
          >
            All
          </button>
          {allTags.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => setActiveTag(activeTag === tag ? null : tag)}
              aria-pressed={activeTag === tag}
              className={
                "min-h-8 px-2.5 rounded-[var(--radius-full)] text-xs font-medium border " +
                (activeTag === tag
                  ? "bg-[var(--primary)] text-white border-[var(--primary)]"
                  : "bg-[var(--card)] text-[var(--ink-700)] border-[var(--border-strong)] hover:bg-[var(--hover)]")
              }
            >
              {tag}
            </button>
          ))}
        </div>
      )}
      {activeTag !== null && (
        <p className="text-[11px] text-[var(--ink-500)] mt-1">
          Showing {filtered.length} {activeTag} vendor{filtered.length === 1 ? "" : "s"} — tap All to see everyone.
        </p>
      )}
    </div>
  );
}
