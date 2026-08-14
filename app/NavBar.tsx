import { getCurrentStaffSession } from "@/lib/auth/session";
import { NavBarClient } from "./NavBarClient";

/** Server wrapper — resolves the staff session cookie server-side (client
 * components can't read an httpOnly cookie) and hands display name +
 * role down to the interactive client nav. Role is needed (2026-08-14)
 * so the client can decide between the full manager nav vs. the
 * reduced staff nav (My Schedule / My Pay only) — see NavBarClient.tsx. */
export async function NavBar() {
  const session = await getCurrentStaffSession();
  return <NavBarClient auth={session ? { name: session.name, systemRole: session.systemRole } : null} />;
}
