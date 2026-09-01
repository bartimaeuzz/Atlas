import Link from "next/link";
import { loadCardStatementPeriodDetail } from "@/lib/ledger/loadCard";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { AddTransactionForm } from "../AddTransactionForm";
import { TransactionsList } from "../TransactionsList";
import { ReconcilePanel } from "../ReconcilePanel";
import { PeriodHeaderForm } from "../PeriodHeaderForm";
import { Badge } from "@/components/ui/Badge";
import { LinkButton } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import { NoAccess } from "@/components/NoAccess";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";

/** One statement period's work: log transactions against it, then
 * reconcile once the logged total matches the statement's own total.
 * Same "editable pre-lock, admin-only post-lock" shape as /ledger/day --
 * a RECONCILED period is normally locked, except an ADMIN account can
 * still correct it directly (doesn't un-reconcile it, just updates the
 * numbers underneath). */
export default async function CardStatementPeriodPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  if (!(await hasCapability("VIEW_LEDGER_CARD_REPORT"))) return <NoAccess pageLabel="the Card report" />;

  const params = await searchParams;
  const periodId = Number(params.id);

  if (!periodId) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8">
        <Banner tone="danger" title="No statement period specified." />
      </main>
    );
  }

  const [data, settings] = await Promise.all([
    loadCardStatementPeriodDetail(periodId),
    loadRestaurantSettings(),
  ]);
  if (!data) {
    return (
      <main className="max-w-lg mx-auto p-4 sm:p-8">
        <Link href="/ledger/card" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
          &larr; Card
        </Link>
        <div className="mt-4">
          <Banner tone="danger" title="That statement period doesn't exist." />
        </div>
      </main>
    );
  }

  const session = await getCurrentStaffSession();
  const isAdmin = session?.systemRole === "ADMIN";
  // Statement-file import entry (2026-08-24) -- only for FA import
  // holders; the import page and both its actions re-check.
  const canImport = await hasCapability("FA_LEDGER_CARD_IMPORT");
  const reconciled = data.status === "reconciled";
  const editable = !reconciled || isAdmin;

  return (
    <main className="max-w-lg mx-auto p-4 sm:p-8">
      <Link href="/ledger/card" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; Card
      </Link>

      <div className="flex items-center justify-between mb-1 mt-2">
        <h1 className="text-2xl font-bold text-[var(--ink-900)]">{data.cardName}</h1>
        <Badge tone={reconciled ? "success" : "neutral"}>{reconciled ? "Reconciled" : "Draft"}</Badge>
      </div>

      {reconciled && isAdmin && (
        <div className="mb-4">
          <Banner
            tone="info"
            title="Editing as admin"
            description="This period is already reconciled. Changes save directly without re-opening it."
          />
        </div>
      )}

      <PeriodHeaderForm
        periodId={data.id}
        periodStart={data.periodStart}
        periodEnd={data.periodEnd}
        statementTotal={data.statementTotal}
        paymentsCreditsTotal={data.paymentsCreditsTotal}
        editable={editable}
      />

      {editable && canImport && (
        <div className="mb-4">
          <LinkButton href={`/ledger/card/period/import?id=${data.id}`} variant="secondary" size="sm">
            Import statement file (PDF/CSV)
          </LinkButton>
        </div>
      )}

      {editable && (
        <>
          {/* Statement-first, said out loud (2026-08-25): the most likely
              confusion is a charge made yesterday that isn't here yet. */}
          <p className="text-xs text-[var(--ink-500)] mb-2">
            Enter only the lines printed on this statement. A pending charge that isn&rsquo;t printed yet belongs on the
            next statement.
          </p>
          <AddTransactionForm
            key={data.transactions.length}
            periodId={data.id}
            periodStart={data.periodStart}
            periodEnd={data.periodEnd}
            categories={data.categories}
          />
        </>
      )}

      <TransactionsList transactions={data.transactions} periodId={data.id} locked={!editable} categories={data.categories} />

      <ReconcilePanel
        periodId={data.id}
        chargesLogged={data.chargesLogged}
        creditsLogged={data.creditsLogged}
        statementTotal={data.statementTotal}
        paymentsCreditsTotal={data.paymentsCreditsTotal}
        reconciled={reconciled}
        reconciledSinglePerson={data.singlePerson}
        requireSecondPerson={settings.requireTwoPersonCardReconcile}
      />
    </main>
  );
}
