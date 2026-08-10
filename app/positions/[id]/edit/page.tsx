import { notFound } from "next/navigation";
import { loadPositionForEdit } from "@/lib/positions/loadPositionsList";
import { PositionForm } from "../../PositionForm";

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const position = await loadPositionForEdit(Number(id));

  if (!position) notFound();

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-6">Edit position — {position.name}</h1>
      <PositionForm existing={position} />
    </main>
  );
}
