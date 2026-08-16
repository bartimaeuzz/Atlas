"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Base modal shell — 40% black backdrop, click-to-close, Esc-to-close,
 * elevation L3, 12px radius. Every dialog in the app (light confirms,
 * danger typed-confirm, forms-in-a-popup like Print Checks) should consume
 * this one shell instead of hand-rolling `fixed inset-0 bg-black/40 ...`
 * per screen (found duplicated ad hoc in PrintChecksButton, 2026-08-16
 * verification pass). */
export function Modal({
  open,
  onClose,
  width = 360,
  children,
}: {
  open: boolean;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
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
        ref={ref}
        role="dialog"
        aria-modal="true"
        className="bg-[var(--card)] rounded-[var(--radius-lg)] shadow-[var(--shadow-3)] p-5 w-full"
        style={{ maxWidth: width }}
      >
        {children}
      </div>
    </div>
  );
}
