import { createShift } from "@/lib/actions/shift";

export default function NewShiftPage() {
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="max-w-md mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">New shift</h1>
      <p className="text-sm text-neutral-500 mb-6">
        One record per meal period — pick the date and Lunch or Dinner, then build the roster.
      </p>

      <form action={createShift} className="space-y-4">
        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1">Date</span>
          <input type="date" name="date" defaultValue={today} required className="border rounded px-2 py-1 w-full" />
        </label>

        <label className="block text-sm">
          <span className="block text-neutral-500 mb-1">Period</span>
          <select name="period" required defaultValue="Dinner" className="border rounded px-2 py-1 w-full">
            <option value="Lunch">Lunch</option>
            <option value="Dinner">Dinner</option>
          </select>
        </label>

        <button type="submit" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800">
          Create shift &amp; start roster
        </button>
      </form>
    </main>
  );
}
