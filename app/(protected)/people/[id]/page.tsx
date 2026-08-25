import Link from "next/link";
import { notFound } from "next/navigation";
import { loadEmployeeForEdit } from "@/lib/employees/loadEmployeesList";
import { getViewerCapabilities } from "@/lib/permissions/viewerCapabilities";
import { formatSystemRole } from "@/lib/format/formatSystemRole";
import { Card, Section } from "@/components/ui/Card";
import { LinkButton } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { MaskedValue } from "../MaskedValue";

/** Staff profile — VIEW first, edit behind a button (2026-08-24, Oliver:
 * "see that person information view only first but if you wanna edit ->
 * edit button"). Reuses loadEmployeeForEdit with the same two capability
 * flags the edit form resolves, so contact and HR tiers render for
 * exactly the people allowed to see them and nobody else — a tier the
 * viewer can't see is absent, not blanked. */
export default async function PersonProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const viewer = await getViewerCapabilities();
  const canViewContact = viewer?.has("PEOPLE_CONTACT_INFO_VIEW") ?? false;
  const canViewHrSensitive = viewer?.has("PEOPLE_HR_SENSITIVE") ?? false;

  const employee = await loadEmployeeForEdit(Number(id), { canViewContact, canViewHrSensitive });
  if (!employee) notFound();

  const fohPositions = employee.positions.filter((p) => p.positionCategory === "FOH");
  const bohPositions = employee.positions.filter((p) => p.positionCategory === "BOH");

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-8">
      <Link href="/people" className={`text-sm text-[var(--ink-500)] hover:text-[var(--ink-900)] ${TAP_TARGET_PAD}`}>
        &larr; People
      </Link>

      <div className="flex flex-wrap items-center justify-between gap-3 mt-2 mb-1">
        <div className="flex items-center gap-2.5">
          <h1 className="text-[28px] font-bold text-[var(--ink-900)]">{employee.nickname}</h1>
          {!employee.active && <Badge tone="neutral">Retired</Badge>}
          {employee.isPartner && <Badge tone="primary">Partner</Badge>}
        </div>
        <LinkButton href={`/people/${employee.id}/edit`} variant="secondary" size="sm">
          Edit
        </LinkButton>
      </div>
      <p className="text-sm text-[var(--ink-500)] mb-6">
        {formatSystemRole(employee.systemRole)}
        {employee.primaryPositionName ? ` · ${employee.primaryPositionName}` : ""}
      </p>

      <Section title="Basics">
        <Card className="max-w-md">
          <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
            <ProfileRow label="Legal name" value={[employee.legalFirstName, employee.legalLastName].filter(Boolean).join(" ") || "—"} />
            <ProfileRow label="Hire date" value={employee.hireDate ?? "—"} />
            <ProfileRow label="System role" value={formatSystemRole(employee.systemRole)} />
            <ProfileRow label="Login ID" value={employee.loginId ?? "—"} />
            <ProfileRow label="PIN" value={employee.hasPinSet ? "Set" : "Not set"} />
            {employee.isFinancialAuditor && <ProfileRow label="Financial auditor sign-off" value="Yes" />}
          </dl>
        </Card>
      </Section>

      <Section title="Positions">
        {employee.positions.length === 0 ? (
          <Card className="max-w-md">
            <p className="text-sm text-[var(--ink-500)]">No positions assigned yet.</p>
          </Card>
        ) : (
          <Card className="max-w-md">
            {[
              { header: "FOH — Front of house", items: fohPositions },
              { header: "BOH — Back of house", items: bohPositions },
            ]
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <div key={g.header} className="mb-3 last:mb-0">
                  <h3 className="text-xs font-semibold tracking-wide text-[var(--ink-500)] uppercase mb-1.5">{g.header}</h3>
                  <ul className="text-sm text-[var(--ink-700)] space-y-1">
                    {g.items.map((p) => (
                      <li key={p.positionId} className="flex items-center justify-between gap-3">
                        <span>
                          {p.positionName}
                          {p.positionId === employee.primaryPositionId && (
                            <span className="ml-1.5 text-[10px] text-[var(--primary)]">Primary</span>
                          )}
                        </span>
                        <span className="text-xs text-[var(--ink-500)] tabular-nums">{p.tipPointValue} pt</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
          </Card>
        )}
      </Section>

      {employee.contactInfo && (
        <Section title="Contact details">
          <Card className="max-w-md">
            <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
              <ProfileRow label="Date of birth" value={employee.contactInfo.dateOfBirth ?? "—"} />
              <ProfileRow label="Mobile phone" value={employee.contactInfo.mobilePhone ?? "—"} />
              <ProfileRow label="Email" value={employee.contactInfo.email ?? "—"} />
            </dl>
          </Card>
        </Section>
      )}

      {employee.hrSensitive && (
        <Section title="HR and payroll records">
          <Card className="max-w-md">
            <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1.5">
              <div className="contents">
                <dt className="text-[var(--ink-500)]">Address</dt>
                <dd className="text-right text-[var(--ink-900)] break-words">
                  {(() => {
                    const addr = [employee.hrSensitive.addressLine1, employee.hrSensitive.addressLine2, employee.hrSensitive.city, employee.hrSensitive.state, employee.hrSensitive.zipCode]
                      .filter(Boolean)
                      .join(", ");
                    return addr ? <MaskedValue value={addr} kind="text" /> : "—";
                  })()}
                </dd>
              </div>
              <div className="contents">
                <dt className="text-[var(--ink-500)]">SSN / ITIN</dt>
                <dd className="text-right text-[var(--ink-900)]">
                  {employee.hrSensitive.ssnOrItin ? <MaskedValue value={employee.hrSensitive.ssnOrItin} /> : "—"}
                </dd>
              </div>
            </dl>
          </Card>
        </Section>
      )}
    </main>
  );
}

function ProfileRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="contents">
      <dt className="text-[var(--ink-500)]">{label}</dt>
      <dd className="text-right text-[var(--ink-900)] break-words">{value}</dd>
    </div>
  );
}
