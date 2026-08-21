import Link from "next/link";
import { notFound } from "next/navigation";
import { loadPositionForEdit } from "@/lib/positions/loadPositionsList";
import { PositionForm } from "../../PositionForm";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [position, canEditPools] = await Promise.all([
    loadPositionForEdit(Number(id)),
    hasCapability("TIP_POOL_STRUCTURE_EDIT"),
  ]);

  if (!position) notFound();

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/positions" className="text-neutral-500 hover:underline">← Positions</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">Edit position — {position.name}</h1>
      <PositionForm existing={position} canEditPools={canEditPools} />
    </main>
  );
}
