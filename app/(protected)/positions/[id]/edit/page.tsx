import { notFound } from "next/navigation";
import { loadPositionForEdit } from "@/lib/positions/loadPositionsList";
import { PositionForm } from "../../PositionForm";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { LinkButton, PageHeader } from "@/components/ui";

export default async function EditPositionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [position, canEditPools] = await Promise.all([
    loadPositionForEdit(Number(id)),
    hasCapability("TIP_POOL_STRUCTURE_EDIT"),
  ]);

  if (!position) notFound();

  return (
    <main className="max-w-3xl mx-auto p-4 sm:p-8 font-sans">
      <div className="mb-3">
        <LinkButton href="/positions" variant="ghost" size="sm">
          ← Positions
        </LinkButton>
      </div>
      <PageHeader title={`Edit position — ${position.name}`} />
      <PositionForm existing={position} canEditPools={canEditPools} />
    </main>
  );
}
