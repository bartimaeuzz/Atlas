import { redirect } from "next/navigation";

/** Retired 2026-08-25 (Oliver: "remove it") -- this was the standalone
 * what-if tip calculator, a scratchpad predating the real closing-report
 * -> payout flow, orphaned from all navigation and still assuming one
 * point value per person after points went per-pool (a2ac906). The
 * Payout page covers the job against real saved data. Route kept so a
 * bare /shifts/<id> URL lands on the shift's roster instead of a 404. */
export default async function ShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/shifts/${Number(id)}/roster`);
}
