import { PositionForm } from "../PositionForm";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { LinkButton, PageHeader } from "@/components/ui";

export default async function NewPositionPage() {
  const canEditPools = await hasCapability("TIP_POOL_STRUCTURE_EDIT");

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <div className="mb-3">
        <LinkButton href="/positions" variant="ghost" size="sm">
          ← Positions
        </LinkButton>
      </div>
      <PageHeader title="New position" />
      <PositionForm existing={null} canEditPools={canEditPools} />
    </main>
  );
}
