import Link from "next/link";
import { createShift } from "@/lib/actions/shift";
import { TextInput, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

export default function NewShiftPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="max-w-md mx-auto px-4 sm:px-8 py-8">
      <p className="text-sm mb-2">
        <Link href="/shifts" className="text-[var(--ink-500)] hover:text-[var(--ink-900)]">
          ← All shifts
        </Link>
      </p>
      <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-1.5">New shift</h1>
      <p className="text-sm text-[var(--ink-500)] mb-6">
        One record per meal period — pick the date and Lunch or Dinner, then build the roster.
      </p>

      <form action={createShift} className="space-y-4">
        <TextInput type="date" name="date" defaultValue={today} required label="Date" />
        <Select name="period" required defaultValue="Dinner" label="Period">
          <option value="Lunch">Lunch</option>
          <option value="Dinner">Dinner</option>
        </Select>
        <Button type="submit" className="w-full">
          Create shift &amp; start roster
        </Button>
      </form>
    </main>
  );
}
