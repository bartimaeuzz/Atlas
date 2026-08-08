import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-2">Atlas — Track 2</h1>
      <p className="text-neutral-500 mb-6">
        Standalone build. Roster → Closing Report → Save &amp; Finalize → Summary Report is the
        real, persisted daily flow. The playground calculator below is a separate manual-entry
        tool for testing the tip-pool math, not connected to saved data.
      </p>
      <div className="flex gap-4 flex-wrap">
        <Link href="/shifts" className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800">
          Shifts →
        </Link>
        <Link href="/shifts/1" className="underline text-blue-600 self-center">
          Playground calculator (seeded shift, manual entry)
        </Link>
      </div>
    </main>
  );
}
