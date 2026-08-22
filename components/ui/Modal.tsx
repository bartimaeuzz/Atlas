"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/** Base modal shell — 40% black backdrop, click-to-close, Esc-to-close,
 * elevation L3, 12px radius. Every dialog in the app (light confirms,
 * danger typed-confirm, forms-in-a-popup like Print Checks) should consume
 * this one shell instead of hand-rolling `fixed inset-0 bg-black/40 ...`
 * per screen (found duplicated ad hoc in PrintChecksButton, 2026-08-16
 * verification pass).
 *
 * ACCESSIBILITY, added 2026-08-22 after the visual audit found this shell
 * was claiming more than it delivered. It has always rendered
 * `aria-modal="true"`, which is a promise to assistive technology that the
 * rest of the page is inert while the dialog is open. Nothing enforced
 * that: focus never entered the dialog, Tab walked straight out into the
 * page behind it, focus never came back to whatever opened it, and the
 * dialog had no accessible name at all — a screen reader announced a bare
 * "dialog". Four things now make that attribute honest:
 *
 *   1. Focus moves in on open — to `initialFocus` when given, otherwise to
 *      the panel itself (which is why it carries tabIndex={-1}).
 *   2. Tab and Shift+Tab cycle within the dialog rather than escaping it.
 *   3. Focus returns to the element that opened the dialog when it closes,
 *      so a keyboard user is not dumped back at the top of the document.
 *   4. `labelledBy` wires the dialog to its own visible title.
 *
 * Callers decide where focus lands, because the safe landing spot is
 * caller-specific: ConfirmDialog points it at Cancel (a stray Enter should
 * dismiss, never confirm), DangerConfirmDialog points it at the typed-word
 * input (its confirm button is disabled until the word matches anyway).
 */

/** Elements that can hold focus. Ordered by DOM position via
 *  querySelectorAll, which is the tab order for anything without an
 *  explicit positive tabindex — and this codebase has none. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  onClose,
  width = 360,
  labelledBy,
  initialFocus,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  /** id of the element holding this dialog's visible title. Without it the
   *  dialog is announced with no name. */
  labelledBy?: string;
  /** Where focus should land on open. Defaults to the first focusable
   *  element inside the dialog, and only to the panel itself if there is
   *  none — the panel is `outline-none`, so landing focus there leaves a
   *  sighted keyboard user with no visible indicator anywhere on screen.
   *  Caught by tracing this file rather than by any automated check. */
  initialFocus?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Remember what had focus BEFORE the dialog opened, so it can be given
  // back on close. Captured in the same effect that moves focus in, so the
  // two can never disagree about which element that was.
  useEffect(() => {
    if (!open) return;

    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // A frame's delay: the panel has just mounted, and initialFocus's own
    // element may not have attached its ref yet on the first commit.
    const id = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const fallback = panel?.querySelector<HTMLElement>(FOCUSABLE) ?? panel;
      (initialFocus?.current ?? fallback)?.focus();
    });

    return () => {
      cancelAnimationFrame(id);
      // Only restore if the element is still in the document — the action
      // the dialog confirmed may have re-rendered it away.
      const previous = restoreFocusRef.current;
      if (previous && document.contains(previous)) previous.focus();
    };
    // initialFocus is a ref object and stable across renders; depending on
    // it would re-run this effect and steal focus mid-interaction.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      if (e.key !== "Tab") return;

      const panel = panelRef.current;
      if (!panel) return;
      const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (items.length === 0) {
        // Nothing focusable inside: keep focus on the panel rather than
        // letting Tab walk into the page the dialog is covering.
        e.preventDefault();
        panel.focus();
        return;
      }

      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      } else if (!panel.contains(active)) {
        // Focus escaped some other way (a click on the backdrop, say).
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        tabIndex={-1}
        className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-[var(--shadow-3)] p-5 w-full outline-none"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  );
}
