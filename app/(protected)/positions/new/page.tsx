import Link from "next/link";
import { PositionForm } from "../PositionForm";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";

export default async function NewPositionPage() {
  const canEditPools = await hasCapability("TIP_POOL_STRUCTURE_EDIT");

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href="/positions" className="text-neutral-500 hover:underline">← Positions</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-6">New position</h1>
      <PositionForm existing={null} canEditPools={canEditPools} />
    </main>
  );
}
