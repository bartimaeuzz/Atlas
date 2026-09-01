"use client";

import { useState } from "react";
import type { VendorCategoryLinkProps } from "@/lib/ledger/vendorCategoryLinks";

/** Vendor and category, held together (2026-08-31). The two fields sit
 * side by side on both logging forms and now feed each other: the
 * category shrinks the vendor list, and a vendor picked first says
 * something about which category is coming.
 *
 * How much it says depends on how many categories that vendor has ever
 * been booked under, and the difference is deliberate:
 *
 *   exactly one  -> fill it in, flagged as ours and freely editable.
 *   two or more  -> fill in NOTHING. Offer them as chips instead and let
 *                   the manager tap one. People do not correct values
 *                   that arrive already filled in (default bias), and a
 *                   category feeds the P&L, so a confident-looking wrong
 *                   guess here quietly mis-books money.
 *   none         -> nothing at all, same as a brand-new restaurant.
 *
 * The other half of the rule: Atlas only ever writes into a category the
 * manager has not chosen -- an empty one, or an earlier guess of its own.
 * A category a person picked is never overwritten, however confident the
 * history is. `categoryAutofilled` is what tells those two apart, and it
 * also carries the "we filled this in, change it if it's wrong" hint;
 * the moment the field is touched the flag is gone and so is the hint.
 */
export function useVendorCategoryPair(links: VendorCategoryLinkProps) {
  const [vendorId, setVendorIdState] = useState("");
  const [categoryId, setCategoryIdState] = useState("");
  const [categoryAutofilled, setCategoryAutofilled] = useState(false);
  const [suggestedCategoryIds, setSuggestedCategoryIds] = useState<number[]>([]);

  function setVendorId(next: string) {
    setVendorIdState(next);
    // Their category, their call -- leave it alone.
    if (categoryId !== "" && !categoryAutofilled) return;

    const linked = next ? links.categoryIdsByVendor[Number(next)] ?? [] : [];
    if (linked.length === 1) {
      setCategoryIdState(String(linked[0]));
      setCategoryAutofilled(true);
      setSuggestedCategoryIds([]);
      return;
    }
    // Several, or none. Either way nothing is written into the field --
    // and any earlier guess of ours, which belonged to the vendor that
    // was selected a moment ago, is cleared rather than left to look
    // like it applies to this one.
    setCategoryIdState("");
    setCategoryAutofilled(false);
    setSuggestedCategoryIds(linked.length > 1 ? linked : []);
  }

  function setCategoryId(next: string) {
    setCategoryIdState(next);
    setCategoryAutofilled(false);
    setSuggestedCategoryIds([]);
  }

  return { vendorId, setVendorId, categoryId, setCategoryId, categoryAutofilled, suggestedCategoryIds };
}

/** Shown under a category Atlas filled in by itself. */
export const AUTOFILLED_CATEGORY_HINT = "เติมให้จากการใช้งานประจำ — แก้ได้";
