import Link from "next/link";
import { NewShiftForm } from "./NewShiftForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";

/** Accepts ?date= and ?period= so the month view's "+ Create" buttons
 * (2026-08-24, Oliver) land here prefilled -- the manager only confirms. */
export default async function NewShiftPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; period?: string }>;
}) {
  const params = await searchParams;
  const today = new Date().toISOString().slice(0, 10);
  const defaultDate = params.date && /^\d{4}-\d{2}-\d{2}$/.test(params.date) ? params.date : today;
  const defaultPeriod = params.period === "Lunch" ? "Lunch" : "Dinner";

  return (
    <main className="max-w-md mx-auto px-4 sm:px-8 py-8">
      <p className="text-sm mb-2">
        <Link href="/shifts" className={`text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          ← All shifts
        </Link>
      </p>
      <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-1.5">New shift</h1>
      <p className="text-sm text-[var(--ink-500)] mb-6">
        One record per meal period — pick the date and Lunch or Dinner, then build the roster.
      </p>

      <NewShiftForm defaultDate={defaultDate} defaultPeriod={defaultPeriod} />
    </main>
  );
}
