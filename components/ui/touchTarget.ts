/** Utility class fragment for standalone small text links/buttons whose
 * visible content is smaller than WCAG 2.5.8's 24x24 CSS px legal floor
 * for touch targets -- e.g. a plain underlined "Forgot PIN?" link, or a
 * small "+ Request leave" toggle button. Expands the element's actual
 * clickable/tappable box via padding, then cancels the vertical padding
 * with an equal negative margin so surrounding layout (row height, flex
 * gaps) doesn't shift -- the growth is real for hit-testing purposes but
 * invisible for layout purposes. Horizontal padding is left uncancelled
 * (a few extra px of width here is low-risk and desirable).
 *
 * Apply this directly on the interactive element itself (the <a>/
 * <button>/<Link>), never on a wrapping <div>/<span> -- padding on a
 * non-interactive parent does not extend a child link's real hit area,
 * only the interactive element's own padding box does.
 *
 * Scope: standalone tap targets only (a link/button that is the whole
 * point of its own line or its own row), not links embedded mid-sentence
 * in a paragraph -- those are exempt from 2.5.8 under its own "Inline"
 * exception, and adding this padding to one would visually break the
 * paragraph's line flow. See project_atlas_design_retrofit_backlog.md
 * for the full list of instances this was applied to on 2026-08-18, and
 * which ones were deliberately left out because they're inline-in-prose.
 */
export const TAP_TARGET_PAD = "-my-2 py-2 px-1";

/** Comfort-tier variant: same trick sized so a text-xs word button reaches
 * the 44px Apple/Atlas comfort tier, not just the 24px legal floor. For
 * standalone word-actions that live in their own row with no adjacent
 * interactive element above or below (overlapping 14px margin bleeds
 * would otherwise invite mistaps). */
export const TAP_TARGET_PAD_44 = "-my-3.5 py-3.5 px-2";

/** ICON-ONLY controls, which the two helpers above cannot serve.
 *
 * Those work by padding a text box, so the result depends on how wide the
 * text is — and an icon has no text. Measured live 2026-09-05: every
 * icon-only button in the app carrying TAP_TARGET_PAD came out between
 * 24x32 and 26x34, clearing WCAG 2.5.8's 24px floor and missing the 44px
 * comfort tier that the rest of the app's controls hold.
 *
 * The pattern is not new — MaskedValue.tsx's reveal button already sized
 * itself this way. These two constants just give the decision a name so
 * the next icon button does not have to re-derive it.
 */

/** The full 44x44 box, for an icon button with room around it — a modal
 *  header's close, say, where the nearest thing is a heading inches away.
 *  The negative vertical margin keeps the row the height it was. */
export const ICON_TAP_TARGET_44 = "inline-flex items-center justify-center min-w-11 min-h-11 -my-3";

/** 44px TALL, width deliberately untouched — for an icon button in a
 *  crowded row.
 *
 *  Height is free; width is not. Measured at 390 on the invoice list, the
 *  "Remove invoice" X has 8px of gap to "Edit" on one side and 8px to
 *  "Approve" on the other, so a 44px-wide box would overlap both — and
 *  Remove and Approve are opposite outcomes on the same bill. In the card
 *  transaction list and the split editor the neighbour is the amount
 *  itself, so widening would put a delete target under a number.
 *
 *  A taller box is a real gain (24x32 -> 24x44, +37% area) that costs
 *  nobody anything. The remaining width is a LAYOUT problem, not a
 *  padding one — see the note in project memory. */
export const ICON_TAP_TARGET_TALL = "inline-flex items-center justify-center min-h-11 -my-3 px-1";
