import { redirect } from "next/navigation";

/** Retired 2026-08-25 (Oliver: "with new design UI we can dismount this
 * page") -- the month view shows every day and creates in place behind a
 * confirm popup (see CreateShiftSlot.tsx), so the standalone form had
 * nothing left to ask. The route stays only so a bookmarked or stale URL
 * lands on the shifts list instead of a 404. */
export default function NewShiftPage() {
  redirect("/shifts");
}
