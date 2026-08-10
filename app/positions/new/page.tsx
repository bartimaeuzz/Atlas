import Link from "next/link";
import { PositionForm } from "../PositionForm";

export default function NewPositionPage() {
  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/positions" className="text-neutral-500 hover:underline">← Positions</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">New position</h1>
      <PositionForm existing={null} />
    </main>
  );
}
