import Link from "next/link";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-2">Atlas — Track 2</h1>
      <p className="text-neutral-500 mb-6">
        Standalone build. This is a plain, utility-first prototype for testing the
        core calculation logic against real numbers — not the final UI.
      </p>
      <Link href="/shifts/1" className="underline text-blue-600">
        Open the seeded Dinner shift →
      </Link>
    </main>
  );
}
