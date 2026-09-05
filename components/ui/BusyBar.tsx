"use client";

/** An indeterminate progress bar — "this is working", with no percentage.
 *
 * WHY NO PERCENTAGE (2026-09-05, Oliver asked for a progress bar): the
 * photo goes up through a server action, which resolves once and reports
 * nothing on the way. A real 0-100% needs XHR's upload.onprogress against
 * a route handler, and that route would have to carry its own auth — the
 * shape that served payroll to anonymous requests on 2026-08-21. Not
 * worth it for a ~300KB upload. A bar that invented a percentage would
 * be lying about progress it cannot see, so this one does not claim one.
 *
 * `aria-busy` plus the caption is what a screen reader gets; the stripe
 * is decorative and stops entirely under prefers-reduced-motion, where a
 * static filled track carries the same "in progress" meaning without the
 * vestibular cost (WCAG 2.3.3). */
export function BusyBar({ label }: { label: string }) {
  return (
    <div className="space-y-1" aria-busy="true">
      <div
        role="progressbar"
        aria-label={label}
        className="busybar h-1.5 w-full overflow-hidden rounded-full bg-[var(--hover)]"
      >
        <div className="busybar-fill h-full w-2/5 rounded-full bg-[var(--primary)]" />
      </div>
      <p className="text-xs text-[var(--ink-500)]">{label}</p>
      <style>{`
        @keyframes busybar-slide {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(350%); }
        }
        .busybar-fill { animation: busybar-slide 1.1s ease-in-out infinite; }
        @media (prefers-reduced-motion: reduce) {
          .busybar-fill { animation: none; width: 100%; opacity: 0.55; }
        }
      `}</style>
    </div>
  );
}
