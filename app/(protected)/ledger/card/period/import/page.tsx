import Link from "next/link";
import { notFound } from "next/navigation";
import { loadCardStatementPeriodDetail } from "@/lib/ledger/loadCard";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { Banner } from "@/components/ui/Banner";
import { PageHeader } from "@/components/ui/Card";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { ImportClient } from "./ImportClient";

/** Statement-file import (2026-08-24) — its own page, not a modal: the
 * review list needs the whole 390px screen. Gate is the FA import key;
 * both server actions re-check it independently. */
export default async function ImportStatementPage({
  searchParams,
}: {
  searchParams: Promise<{ id?: string }>;
}) {
  const viewer = await getViewerCapabilities();
  if (!viewer?.has("FA_LEDGER_CARD_IMPORT")) return <NoAccess pageLabel="the statement import page" />;

  const params = await searchParams;
  const periodId = Number(params.id);
  if (!periodId) notFound();
  const period = await loadCardStatementPeriodDetail(periodId);
  if (!period) notFound();

  // Same editability rule as the period page itself: reconciled locks
  // everyone but an Admin.
  const locked = period.status === "reconciled" && !viewer.isAdmin;

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8">
      <Link
        href={`/ledger/card/period?id=${periodId}`}
        className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}
      >
        &larr; Statement period
      </Link>

      <PageHeader
        title="Import statement"
        description={`${period.cardName} — ${period.periodStart} to ${period.periodEnd}. Upload the bank's statement file, check every row, then add them all at once. Nothing is saved until you press Import.`}
      />

      {locked ? (
        <Banner
          tone="warning"
          title="This period is already reconciled"
          description="Its figures are locked, so nothing can be imported into it."
        />
      ) : (
        <ImportClient
          periodId={periodId}
          categories={period.categories}
        />
      )}
    </main>
  );
}
