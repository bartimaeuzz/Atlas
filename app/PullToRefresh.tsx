"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { SpinnerIcon } from "@/components/ui/icons";

const TRIGGER_PX = 70;

/** Pull-down-to-refresh (2026-08-25, Oliver: "can we add swipe down to
 * refresh?"). Safari's own pull-to-refresh disappears in standalone
 * (Add to Home Screen) mode, so the app provides one: pull from the top
 * of the page, release past the threshold, and the route's server data
 * refetches via router.refresh() -- a soft refresh, no full reload.
 *
 * Deliberately inert everywhere else: only starts when the PAGE is at
 * scrollY 0, ignores pulls that begin inside a dialog (those scroll
 * their own lists), and desktop mice never fire touch events. Listeners
 * are passive -- we never fight the scroll, we just measure it. */
export function PullToRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [pull, setPull] = useState(0);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return;
      if ((e.target as Element | null)?.closest?.('[role="dialog"]')) return;
      startY.current = e.touches[0].clientY;
    }
    function onTouchMove(e: TouchEvent) {
      if (startY.current == null) return;
      if (window.scrollY > 0) {
        startY.current = null;
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const delta = e.touches[0].clientY - startY.current;
      // Resistance curve so the indicator feels rubber-banded, not 1:1.
      const eased = delta > 0 ? Math.min(delta * 0.5, 120) : 0;
      pullRef.current = eased;
      setPull(eased);
    }
    function onTouchEnd() {
      if (startY.current == null) return;
      const releasedAt = pullRef.current;
      startY.current = null;
      pullRef.current = 0;
      setPull(0);
      if (releasedAt >= TRIGGER_PX) {
        startTransition(() => router.refresh());
      }
    }
    window.addEventListener("touchstart", onTouchStart, { passive: true });
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onTouchEnd, { passive: true });
    window.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      window.removeEventListener("touchstart", onTouchStart);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onTouchEnd);
      window.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [router]);

  const visible = pull > 8 || isPending;
  const armed = pull >= TRIGGER_PX;
  if (!visible) return null;

  return (
    <div
      aria-hidden
      className="fixed left-1/2 z-50 -translate-x-1/2 pointer-events-none"
      style={{ top: `calc(env(safe-area-inset-top) + ${isPending ? 16 : Math.min(pull, 90) - 34}px)` }}
    >
      <div
        className={
          "flex items-center gap-2 rounded-[var(--radius-full)] border px-3 py-2 text-xs font-medium shadow-[var(--shadow-1)] " +
          (armed || isPending
            ? "bg-[var(--primary)] text-white border-[var(--primary)]"
            : "bg-[var(--card)] text-[var(--ink-500)] border-[var(--border)]")
        }
      >
        {isPending ? (
          <>
            <SpinnerIcon className="w-3.5 h-3.5 animate-spin" />
            Refreshing…
          </>
        ) : armed ? (
          "Release to refresh"
        ) : (
          "Pull to refresh"
        )}
      </div>
    </div>
  );
}
