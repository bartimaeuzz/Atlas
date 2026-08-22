import { loadPositionsList } from "@/lib/positions/loadPositionsList";
import { ToggleActiveButton } from "./ToggleActiveButton";
import { hasCapability } from "@/lib/permissions/viewerCapabilities";
import {
  PageHeader,
  LinkButton,
  EmptyState,
  Badge,
  TableCard,
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
  StackedCardList,
  StackedCard,
  StackedField,
} from "@/components/ui";

const POOL_LABELS: Record<string, string> = {
  POOL_1_DINE_IN: "Pool 1",
  POOL_2_TAKEOUT_ONLINE: "Pool 2",
  POOL_3_DELIVERY: "Pool 3",
};

function poolSummary(groups: string[]): string {
  return groups.length === 0 ? "—" : groups.map((g) => POOL_LABELS[g]).join(", ");
}

function rateSummary(p: { category: string; shiftRates: { period: string; flatRate: number }[] }): string {
  if (p.category !== "FOH") return "per-employee";
  const lunch = p.shiftRates.find((r) => r.period === "Lunch")?.flatRate;
  const dinner = p.shiftRates.find((r) => r.period === "Dinner")?.flatRate;
  return `${lunch?.toFixed(2) ?? "—"} / ${dinner?.toFixed(2) ?? "—"}`;
}

export default async function PositionsListPage() {
  // Phase C (2026-08-21): /settings/tip-pools is behind VIEW_SETTINGS.
  const [positionList, canSeeSettings] = await Promise.all([loadPositionsList(), hasCapability("VIEW_SETTINGS")]);

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <PageHeader
        title="Positions"
        description="Create and edit job positions — which tip pool(s) they belong to, roster visibility, and (for FOH) their flat wage rate. Retiring a position keeps every past shift that used it intact; it just stops showing up when staffing new ones."
        actions={<LinkButton href="/positions/new">+ New position</LinkButton>}
      />

      {/* The mb-6 lives on the wrapper, not the link: hanging it off a
          conditional element made the table jump up ~12px for anyone
          without VIEW_SETTINGS. */}
      <div className="mb-6">
        {canSeeSettings && (
          <LinkButton href="/settings/tip-pools" variant="secondary" size="sm">
            Bulk-manage tip pool assignment for every position →
          </LinkButton>
        )}
      </div>

      {positionList.length === 0 ? (
        <EmptyState
          message="No positions yet."
          action={<LinkButton href="/positions/new">+ New position</LinkButton>}
        />
      ) : (
        <>
          {/* Phone: stacked cards */}
          <StackedCardList>
            {positionList.map((p) => (
              <StackedCard
                key={p.id}
                dimmed={!p.active}
                title={
                  <>
                    {p.name}
                    {!p.active && (
                      <span className="ml-2 align-middle">
                        <Badge tone="neutral">Retired</Badge>
                      </span>
                    )}
                  </>
                }
                trailing={<Badge tone={p.category === "FOH" ? "primary" : "neutral"}>{p.category}</Badge>}
                footer={
                  <>
                    <LinkButton href={`/positions/${p.id}/edit`} variant="secondary" size="sm">
                      Edit
                    </LinkButton>
                    <ToggleActiveButton positionId={p.id} active={p.active} positionName={p.name} />
                  </>
                }
              >
                <StackedField label="Tip pools" value={poolSummary(p.tipPoolGroups)} />
                <StackedField label="Rate (Lunch / Dinner)" value={rateSummary(p)} numeric={p.category === "FOH"} />
              </StackedCard>
            ))}
          </StackedCardList>

          {/* Desktop: table */}
          <TableCard>
            <Table minWidth={620}>
              <THead>
                <TR>
                  <TH>Name</TH>
                  <TH>Category</TH>
                  <TH>Tip pools</TH>
                  <TH numeric>Rate (L / D)</TH>
                  <TH>
                    <span className="sr-only">Actions</span>
                  </TH>
                </TR>
              </THead>
              <TBody>
                {positionList.map((p) => (
                  <TR key={p.id} dimmed={!p.active}>
                    <TD emphasis>
                      {p.name}
                      {!p.active && (
                        <span className="ml-2 align-middle">
                          <Badge tone="neutral">Retired</Badge>
                        </span>
                      )}
                    </TD>
                    <TD>{p.category}</TD>
                    <TD muted={p.tipPoolGroups.length === 0}>{poolSummary(p.tipPoolGroups)}</TD>
                    <TD numeric muted={p.category !== "FOH"}>
                      {rateSummary(p)}
                    </TD>
                    <TD className="text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-2 justify-end">
                        <LinkButton href={`/positions/${p.id}/edit`} variant="secondary" size="sm">
                          Edit
                        </LinkButton>
                        <ToggleActiveButton positionId={p.id} active={p.active} positionName={p.name} />
                      </span>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </TableCard>
        </>
      )}
    </main>
  );
}
