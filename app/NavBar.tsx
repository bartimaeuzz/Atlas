import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadUnseenLeaveRequestCount } from "@/lib/schedule/loadLeaveRequests";
import { toIso } from "@/lib/schedule/weekMath";
import { NavBarClient } from "./NavBarClient";

/** Server wrapper — resolves the staff session cookie server-side (client
 * components can't read an httpOnly cookie) and hands display name +
 * role down to the interactive client nav. Role is needed (2026-08-14)
 * so the client can decide between the full manager nav vs. the
 * reduced staff nav (My Schedule / My Pay only) — see NavBarClient.tsx.
 *
 * Red-pill unseen count (2026-08-16) — resolved here, not in the client
 * component, since it needs a DB read. Only computed for MANAGER/ADMIN
 * sessions (staff have no leave-requests inbox to be unseen against).
 * This renders on every navigation, so a visit to /schedule/leave
 * (which marks the section seen, then calls router.refresh()) reliably
 * clears the badge on the very next render. */
export async function NavBar() {
  const session = await getCurrentStaffSession();
  const isManager = session && (session.systemRole === "MANAGER" || session.systemRole === "ADMIN");
  const unseenLeaveCount = isManager ? await loadUnseenLeaveRequestCount(session.id, toIso(new Date())) : 0;

  return (
    <NavBarClient
      auth={session ? { name: session.name, systemRole: session.systemRole } : null}
      unseenLeaveCount={unseenLeaveCount}
    />
  );
}
