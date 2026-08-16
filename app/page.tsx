import Link from "next/link";
import { LinkButton } from "@/components/ui/Button";

export default function Home() {
  return (
    <main className="max-w-2xl mx-auto px-4 sm:px-8 py-8">
      <h1 className="text-[24px] font-bold text-[var(--ink-900)] mb-2">Atlas</h1>
      <p className="text-[var(--ink-500)] mb-6">
        Roster → Closing Report → Save &amp; Finalize → Summary Report is the real, persisted daily flow. The playground
        calculator below is a separate manual-entry tool for testing the tip-pool math, not connected to saved data.
      </p>
      <div className="flex gap-3 flex-wrap items-center">
        <LinkButton href="/shifts">Shifts →</LinkButton>
        <LinkButton href="/positions" variant="secondary">
          Positions →
        </LinkButton>
        <LinkButton href="/settings" variant="secondary">
          Settings →
        </LinkButton>
        <Link href="/shifts/1" className="text-sm text-[var(--primary)] hover:underline">
          Playground calculator (seeded shift, manual entry)
        </Link>
      </div>
    </main>
  );
}
