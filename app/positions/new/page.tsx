import { PositionForm } from "../PositionForm";

export default function NewPositionPage() {
  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-6">New position</h1>
      <PositionForm existing={null} />
    </main>
  );
}
