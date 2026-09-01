"use client";

import { useId, useState } from "react";
import { Select } from "@/components/ui/Field";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";

export interface PickerVendor {
  id: number;
  name: string;
}

/** Vendor dropdown that shrinks to the suppliers this restaurant actually
 * uses for the category being logged (2026-08-31, Aey: "want to add
 * invoice or petty cash from bar stuff -> show only bar related vendor").
 *
 * The links are LEARNED, not typed in -- see lib/ledger/vendorCategoryLinks.ts.
 * Three rules the filtering must never break:
 *
 * 1. The escape is always on screen. Filtering a list a manager is
 *    standing in front of, on a phone, at the back door, with a delivery
 *    driver waiting, is only safe if "show me everyone" is one tap away
 *    and visible without scrolling.
 * 2. The vendor already selected always stays in the options. A filter
 *    that silently unsets a choice submits the wrong row.
 * 3. No history, no hint. A fresh restaurant -- Youk on day one -- sees
 *    exactly the plain dropdown, with nothing to explain.
 *
 * Controlled by the host form (value/onChange) rather than holding its
 * own selection, because the vendor and the category now feed each other:
 * the category filters this list, and picking a vendor first can fill the
 * category back in. See AddEntryForm / LogInvoiceForm.
 */
export function VendorPicker({
  vendors,
  name,
  label,
  required,
  noneLabel,
  value,
  onChange,
  categoryId,
  links,
}: {
  vendors: PickerVendor[];
  name: string;
  label: string;
  required?: boolean;
  /** When set, an empty choice is allowed and shown with this label
   * (petty cash's "No vendor"); absent = required-style "Choose…". */
  noneLabel?: string;
  value: string;
  onChange: (vendorId: string) => void;
  /** The host form's currently selected category, "" when none. */
  categoryId: string;
  links: VendorCategoryLinkProps;
}) {
  const hintId = useId();
  const [showAll, setShowAll] = useState(false);

  const linkedIds = categoryId ? links.vendorIdsByCategory[Number(categoryId)] : undefined;
  // Only vendors still on the list count -- a linked vendor that has since
  // been retired is not offered, and a category whose every linked vendor
  // is retired falls back to the plain dropdown rather than to an empty one.
  const linked = new Set(linkedIds ?? []);
  const inCategory = vendors.filter((v) => linked.has(v.id));
  const canFilter = inCategory.length > 0;

  const options =
    canFilter && !showAll
      ? // Rule 2: the current selection rides along even when the category
        // says it doesn't belong here.
        vendors.filter((v) => linked.has(v.id) || String(v.id) === value)
      : vendors;

  return (
    <div>
      <Select
        name={name}
        label={label}
        required={required}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-describedby={canFilter ? hintId : undefined}
      >
        <option value="">{noneLabel ?? "Choose…"}</option>
        {options.map((v) => (
          <option key={v.id} value={v.id}>
            {v.name}
          </option>
        ))}
      </Select>
      {/* Below the select, never above it (2026-08-31 visual audit): a
          block above the label pushed this cell out of line with the
          Category field it is paired with -- 114px of skew at 390px --
          and read as belonging to the field above. */}
      {canFilter && (
        <p id={hintId} className="text-xs text-[var(--ink-500)] mt-1.5 flex flex-wrap items-center gap-x-2">
          {/* The line NAMES the narrowed list rather than just counting
              it, so someone who can't find a vendor reads "this list is
              filtered" instead of "that vendor is gone" (2026-08-31 UX
              research: an unlabelled adaptive list reads as broken).
              The count always means "linked to this category", never
              "rows currently in the dropdown" -- the two differ by the
              vendor riding along under rule 2, and counting that one in
              would claim a history it doesn't have. */}
          <span>
            {showAll ? `ทุกร้าน (${vendors.length})` : `ร้านที่เคยใช้กับหมวดนี้ · ${inCategory.length}`}
          </span>
          <button
            type="button"
            onClick={() => setShowAll(!showAll)}
            // No negative margin to visually un-indent this: at 390px the vendor
            // field is a 138px grid cell, and -mx-1.5 hung the button 6px out
            // over the gutter between the two columns (measured 2026-08-31).
            className="inline-flex items-center min-h-8 px-1.5 rounded-[var(--radius-md)] underline text-[var(--primary-700)] hover:bg-[var(--hover)]"
          >
            {showAll ? `แสดงเฉพาะหมวดนี้ (${inCategory.length})` : `แสดงทุกร้าน (${vendors.length})`}
          </button>
        </p>
      )}
    </div>
  );
}
