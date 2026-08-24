"use client";

/** Floating "you'll be signed out soon" banner for the 30-minute
 * inactivity timeout (confirmed 2026-08-18 — see project memory "Atlas
 * Session Security"). Rendered from NavBar.tsx only when a session
 * exists — see that file for why.
 *
 * This is a UX layer, NOT the enforcement — the real cutoff is enforced
 * server-side in resolveSessionToken (lib/auth/session.ts) on every real
 * request, regardless of whether this component is mounted, in focus, or
 * even has JS enabled. What this does: poll the server every ~20s for
 * the authoritative remaining time (a read-only check that does not
 * itself count as activity — see checkSessionIdleStatus), tick a local
 * countdown between polls so it reads smoothly, show a warning once under
 * a minute remains, and offer an explicit "Stay signed in" that resets
 * the clock. If the poll ever comes back null (already idle/hard expired
 * server-side), send the person to /login with an explanation rather than
 * leaving a dead page open — foolproof UX bar per
 * project_atlas_target_users_accessibility.md: an unexplained sign-out
 * reads as "the app is broken," not "this is a safety feature." */

import { useCallback, useEffect, useRef, useState } from "react";
import { checkSessionIdleStatus, extendSession, type SessionIdleStatus } from "@/lib/actions/session";
import { IDLE_WARNING_MS } from "@/lib/auth/idleTimeout";
import { Button } from "@/components/ui/Button";
import { AlertTriangleIcon } from "@/components/ui/icons";

const POLL_INTERVAL_MS = 20_000; // well under IDLE_WARNING_MS so the banner reliably appears in time

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return minutes > 0 ? `${minutes}:${String(seconds).padStart(2, "0")}` : `${seconds}s`;
}

export function SessionIdleWarning() {
  // Absolute deadline (epoch ms), not a countdown number, in a ref — lets
  // a single 1s ticking interval recompute "remaining" from a fixed
  // point without restarting itself every render.
  const deadlineRef = useRef<number | null>(null);
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [extending, setExtending] = useState(false);

  const applyStatus = useCallback((status: SessionIdleStatus | null) => {
    if (!status) {
      deadlineRef.current = null;
      setSignedOut(true);
      return;
    }
    deadlineRef.current = Date.now() + status.msRemaining;
    setRemainingMs(status.msRemaining);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const poll = () => {
      checkSessionIdleStatus().then((status) => {
        if (!cancelled) applyStatus(status);
      });
    };
    poll();
    const pollId = window.setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [applyStatus]);

  useEffect(() => {
    const tickId = window.setInterval(() => {
      if (deadlineRef.current === null) return;
      const left = deadlineRef.current - Date.now();
      if (left <= 0) {
        setSignedOut(true);
      } else {
        setRemainingMs(left);
      }
    }, 1000);
    return () => window.clearInterval(tickId);
  }, []);

  useEffect(() => {
    if (!signedOut) return;
    // The real logout already happened server-side (or is about to, on
    // this session's next request) — this just gets the person to a
    // clear explanation instead of a dead page.
    //
    // HARD navigation on purpose (2026-08-24, Oliver caught the nav rail
    // still standing next to the login form): router.push() is a client
    // transition, and the App Router does not re-render the root layout
    // on those — so the rail that layout.tsx rendered while signed in
    // stayed mounted on /login. A full page load re-runs the layout with
    // no session, which is exactly what the manual logout action gets
    // from its server-side redirect().
    // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- the rule's suggested router.push() IS the bug being fixed; see the comment above
    window.location.assign("/login?reason=idle");
  }, [signedOut]);

  async function handleStaySignedIn() {
    setExtending(true);
    const status = await extendSession();
    setExtending(false);
    applyStatus(status);
  }

  if (signedOut || remainingMs === null || remainingMs > IDLE_WARNING_MS) return null;

  return (
    <div role="alertdialog" aria-live="assertive" className="fixed inset-x-0 bottom-0 z-40 flex justify-center px-4 pb-4 sm:pb-6">
      <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md rounded-[var(--radius-md)] border border-[var(--warning-border)] bg-[var(--warning-tint)] shadow-[var(--shadow-3)] px-4 py-3.5">
        <AlertTriangleIcon className="text-[var(--warning-700)] shrink-0" width={18} height={18} />
        <p className="text-sm text-[var(--warning-700)] flex-1 text-center sm:text-left">
          Signing out in {formatCountdown(remainingMs)} due to inactivity
        </p>
        <Button type="button" variant="secondary" size="sm" onClick={handleStaySignedIn} loading={extending} className="w-full sm:w-auto shrink-0">
          Stay signed in
        </Button>
      </div>
    </div>
  );
}
