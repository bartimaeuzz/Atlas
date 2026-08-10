import { getCurrentStaffSession } from "@/lib/auth/session";
import { NavBarClient } from "./NavBarClient";

/** Server wrapper — resolves the staff session cookie server-side (client
 * components can't read an httpOnly cookie) and hands just a display name
 * down to the interactive client nav. See NavBarClient.tsx for why this
 * split exists. */
export async function NavBar() {
  const session = await getCurrentStaffSession();
  return <NavBarClient auth={session ? { name: session.name } : null} />;
}
