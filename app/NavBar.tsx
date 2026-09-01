import { loadUnseenLeaveRequestCount } from "@/lib/schedule/loadLeaveRequests";
import { businessTodayIso } from "@/lib/formatDateTime";
import { loadUnseenSwapCount } from "@/lib/schedule/loadSwapRequests";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NavBarClient } from "./NavBarClient";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { NAV_ITEM_CAPABILITY, resolveLedgerHref } from "./navItemCapabilities";
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
  // Permission System Phase C (2026-08-21) -- resolve which capability-
  // gated nav destinations this viewer can actually open, so the rail
  // never offers a link that lands on a no-access page.
  //
  // Note this runs for every signed-in session, staff included, even
  // though the staff nav has no gated destinations. That's deliberate
  // after the re-review: getViewerCapabilities() is React-cache()d per
  // request and the page below almost always needs it anyway, so
  // skipping it for STAFF would save nothing on manager pages and add a
  // branch. It resolves the session in the same call.
  const viewer = await getViewerCapabilities();
  const session = viewer?.session ?? null;

  // No session, no navigation (2026-08-23, Oliver spotted the rail on the
  // login screen). The signed-out rail was deliberate rather than an
  // oversight -- it had its own "Staff Login" item and tooltip -- but
  // measured on the live page it offered a visitor exactly three links:
  // the logo and wordmark, both pointing at "/" which redirects straight
  // back to /login, and "Staff Login", which is the page they are already
  // on. Every destination led back to where they stood, while the rail
  // still cost 48-216px, a tab stop, and a collapse toggle for a nav with
  // nothing in it.
  //
  // Returning null here rather than filtering items inside NavBarClient
  // keeps the decision in one place: the layout's content offset reads the
  // same session (see app/layout.tsx), so the rail and the padding that
  // clears it can never disagree about whether a rail exists.
  if (!session) return null;
  const isManager = session && (session.systemRole === "MANAGER" || session.systemRole === "ADMIN");
  let hiddenNavHrefs =
    viewer && isManager
      ? Object.entries(NAV_ITEM_CAPABILITY)
          .filter(([, capabilityKey]) => !viewer.has(capabilityKey))
          .map(([href]) => href)
      : [];
  // See resolveLedgerHref's own comment: the Ledger nav item points at
  // the Card report instead when that's the only half of the Ledger this
  // viewer holds, rather than being a link to a page that refuses them.
  const ledgerHref = viewer && isManager ? resolveLedgerHref(viewer.has) : "/ledger";
  if (ledgerHref === null) {
    if (!hiddenNavHrefs.includes("/ledger")) hiddenNavHrefs.push("/ledger");
  } else {
    // NAV_ITEM_CAPABILITY already added "/ledger" to the hidden list on
    // VIEW_LEDGER_OVERVIEW alone. Un-hide it when the card half is held:
    // NavBarClient filters BEFORE it applies the href override, so
    // leaving it hidden would drop the item and make the override dead
    // code -- which is exactly the "holds the capability, no way to use
    // it" bug resolveLedgerHref exists to prevent. Caught by the Phase C
    // re-review; the home tile (app/page.tsx) already handled this case.
    hiddenNavHrefs = hiddenNavHrefs.filter((h) => h !== "/ledger");
  }
  const navHrefOverrides: Record<string, string> =
    ledgerHref && ledgerHref !== "/ledger" ? { "/ledger": ledgerHref } : {};
  const today = businessTodayIso();
  const [unseenLeaveCount, unseenSwapCount] = isManager
    ? await Promise.all([loadUnseenLeaveRequestCount(session.id, today), loadUnseenSwapCount(session.id, today)])
    : [0, 0];
  // Restaurant name for the wordmark (2026-09-01) — one cheap single-row
  // read; the rail renders on every navigation, same as the badge counts.
  const { restaurantName } = await loadRestaurantSettings();

  return (
    <>
      {/* Only mounted for a signed-in session — no point polling idle
       * status for a visitor sitting on /login. See SessionIdleWarning.tsx
       * for why this is a poll-based banner, not a client-only timer. */}
      {session && <SessionIdleWarning />}
      <NavBarClient
        auth={{ name: session.name, systemRole: session.systemRole }}
        restaurantName={restaurantName}
        unseenScheduleCount={unseenLeaveCount + unseenSwapCount}
        hiddenNavHrefs={hiddenNavHrefs}
        navHrefOverrides={navHrefOverrides}
      />
    </>
  );
}
