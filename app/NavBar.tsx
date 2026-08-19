import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadUnseenLeaveRequestCount } from "@/lib/schedule/loadLeaveRequests";
import { loadUnseenSwapCount } from "@/lib/schedule/loadSwapRequests";
import { toIso } from "@/lib/schedule/weekMath";
import { NavBarClient } from "./NavBarClient";
import { SessionIdleWarning } from "./SessionIdleWarning";

/** Server wrapper — resolves the staff session cookie server-side (client
 * components can't read an httpOnly cookie) and hands display name +
 * role down to the interactive client nav. Role is needed (2026-08-14)
 * so the client can decide between the full manager nav vs. the
 * reduced staff nav (My Schedule / My Pay only) — see NavBarClient.tsx.
 *
 * Red-pill unseen count (2026-08-16, extended later same day for swap
 * requests) — resolved here, not in the client component, since it
 * needs DB reads. Only computed for MANAGER/ADMIN sessions. Leave and
 * swap counts are summed into ONE badge on the "Schedule" nav item
 * (confirmed: no separate nav entry) — a manager doesn't need to know
 * from the nav alone which of the it is, both point into the same
 * Schedule area. This renders on every navigation, so a visit to
 * /schedule/leave or /schedule/swaps (each marks its own section seen,
 * then calls router.refresh()) reliably clears its share of the badge
 * on the very next render. */
export async function NavBar() {
  const session = await getCurrentStaffSession();
  const isManager = session && (session.systemRole === "MANAGER" || session.systemRole === "ADMIN");
  const today = toIso(new Date());
  const [unseenLeaveCount, unseenSwapCount] = isManager
    ? await Promise.all([loadUnseenLeaveRequestCount(session.id, today), loadUnseenSwapCount(session.id, today)])
    : [0, 0];

  return (
    <>
      {/* Only mounted for a signed-in session — no point polling idle
       * status for a visitor sitting on /login. See SessionIdleWarning.tsx
       * for why this is a poll-based banner, not a client-only timer. */}
      {session && <SessionIdleWarning />}
      <NavBarClient
        auth={session ? { name: session.name, systemRole: session.systemRole } : null}
        unseenScheduleCount={unseenLeaveCount + unseenSwapCount}
      />
    </>
  );
}
