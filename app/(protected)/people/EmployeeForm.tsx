"use client";

import { useActionState, useState } from "react";
import { createEmployee, updateEmployee, type EmployeeActionState } from "@/lib/actions/employees";
import type { EmployeeListRow, AssignablePosition } from "@/lib/employees/loadEmployeesList";
import { TextInput, Select, Checkbox } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";
import { LinkButton } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { ChevronDownIcon, EyeIcon, EyeOffIcon } from "@/components/ui/icons";

const initialState: EmployeeActionState = { error: null };

export function EmployeeForm({
  existing,
  allPositions,
  canViewContact,
  canViewHrSensitive,
}: {
  existing: EmployeeListRow | null;
  allPositions: AssignablePosition[];
  /** PEOPLE_CONTACT_INFO_VIEW / PEOPLE_HR_SENSITIVE, resolved server-side.
   * Two flags rather than one `viewerIsAdmin`, because the two tiers are
   * separately grantable as of 2026-08-23. The server action re-checks
   * both independently -- these only decide what renders. */
  canViewContact: boolean;
  canViewHrSensitive: boolean;
}) {
  const action = existing ? updateEmployee : createEmployee;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialAssigned = new Set(existing?.positions.map((p) => p.positionId) ?? []);
  // SSN/ITIN formats itself as XXX-XX-XXXX while typing (2026-08-24,
  // Oliver). Digits only, dashes inserted, capped at 9 digits -- error
  // prevention over a validation message after the fact.
  const [ssn, setSsn] = useState(existing?.hrSensitive?.ssnOrItin ?? "");
  // Masked even for Admins until the eye is tapped (2026-08-24, Oliver) --
  // shoulder-surfing protection on a shared terminal, distinct from the
  // capability gate that decides whether the field renders at all.
  const [ssnRevealed, setSsnRevealed] = useState(false);
  const formatSsn = (raw: string) => {
    const d = raw.replace(/\D/g, "").slice(0, 9);
    if (d.length <= 3) return d;
    if (d.length <= 5) return `${d.slice(0, 3)}-${d.slice(3)}`;
    return `${d.slice(0, 3)}-${d.slice(3, 5)}-${d.slice(5)}`;
  };
  const [assigned, setAssigned] = useState<Set<number>>(initialAssigned);

  const tipPointFor = (positionId: number) => existing?.positions.find((p) => p.positionId === positionId)?.tipPointValue;
  const wageRateFor = (positionId: number, period: "Lunch" | "Dinner") =>
    existing?.wageRates.find((r) => r.positionId === positionId && r.period === period)?.rate;

  const toggleAssigned = (positionId: number, checked: boolean) => {
    setAssigned((prev) => {
      const next = new Set(prev);
      if (checked) next.add(positionId);
      else next.delete(positionId);
      return next;
    });
  };

  return (
    <form action={formAction} className="space-y-6 max-w-2xl">
      {existing && <input type="hidden" name="employeeId" value={existing.id} />}

      {state.error && (
        <div className="border border-[var(--danger-border)] bg-[var(--danger-tint)] text-[var(--danger-700)] rounded-[var(--radius-md)] p-4 text-sm whitespace-pre-line">
          <div className="font-semibold mb-1">Couldn&apos;t save.</div>
          {state.error}
        </div>
      )}

      <TextInput
        type="text"
        name="nickname"
        label="Nickname / display name"
        defaultValue={existing?.nickname}
        required
        hint="What shows up everywhere in the app — schedule, roster, nav, tip pools. Not necessarily their legal name."
      />

      <div>
        <div className="grid sm:grid-cols-2 gap-4">
          <TextInput
            type="text"
            name="legalFirstName"
            label="Legal first name"
            defaultValue={existing?.legalFirstName ?? ""}
            required
          />
          <TextInput
            type="text"
            name="legalLastName"
            label="Legal last name"
            defaultValue={existing?.legalLastName ?? ""}
            required
          />
        </div>
        <p className="text-xs text-[var(--ink-500)] mt-2">
          Used for payroll and tax documents only — never shown elsewhere in the app.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <TextInput type="date" name="hireDate" label="Hire date" defaultValue={existing?.hireDate ?? ""} />
        <Select name="systemRole" label="System role" defaultValue={existing?.systemRole ?? "STAFF"}>
          <option value="STAFF">STAFF — restricted roster view</option>
          <option value="MANAGER">MANAGER — sees everything</option>
          <option value="ADMIN">ADMIN — sees everything</option>
        </Select>
      </div>

      <div className="max-w-xs">
        <Select
          name="primaryPositionId"
          label="Primary position"
          defaultValue={existing?.primaryPositionId ?? ""}
          hint="Must be one of the positions checked below. This is the row that carries this person's wage on a shift when they're staffed in more than one position."
        >
          <option value="">— none —</option>
          {allPositions
            .filter((p) => assigned.has(p.id))
            .map((p) => (
              <option key={p.id} value={p.id}>{p.name} ({p.category})</option>
            ))}
        </Select>
      </div>

      <Checkbox
        name="active"
        defaultChecked={existing?.active ?? true}
        label="Active — unchecking retires them (never deleted; past shifts stay intact)"
      />

      <Checkbox
        className="border border-[var(--border)] rounded-[var(--radius-md)] px-3 bg-[var(--paper)]"
        name="isFinancialAuditor"
        defaultChecked={existing?.isFinancialAuditor ?? false}
        label={<span className="font-medium text-[var(--ink-900)]">Financial auditor sign-off</span>}
        description={
          <>
            This person&apos;s PIN is the code that confirms a change to an already Printed or Paid
            Supplier Check. Anyone making that change — even an Admin — has to enter THIS
            person&apos;s code, not their own.
            <span className="block mt-1">
              This is not a permission. Who is <em>allowed</em> to make that change is set on the
              Permission and Roles page, under &ldquo;Supplier Check: edit locked invoice&rdquo;.
            </span>
          </>
        }
      />

      <Checkbox
        className="border border-[var(--border)] rounded-[var(--radius-md)] px-3 bg-[var(--paper)]"
        name="isPartner"
        defaultChecked={existing?.isPartner ?? false}
        label={<span className="font-medium text-[var(--ink-900)]">Partner</span>}
        description="Restaurant partner/owner, independent of system role. Used as the default department (Partner) when generating this person's login ID on the People page."
      />

      {/* Two tiers, two capabilities, two fieldsets (2026-08-23). These used
          to be one "Personal information (Admin only)" block behind one
          flag; contact details and SSN are now separately permissioned, so
          someone can be trusted with a phone number without being trusted
          with a social security number. A tier the viewer can't see is
          absent, not disabled — there is nothing they could do about it,
          so an inert control would only be noise. */}
      {canViewContact && (
        <fieldset className="border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
          <legend className="text-sm font-medium text-[var(--ink-900)] px-1">Contact details</legend>
          <p className="text-xs text-[var(--ink-500)] mb-3">
            How to reach this person. Not shown anywhere else in the app.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <TextInput
              type="date"
              name="dateOfBirth"
              label="Date of birth"
              defaultValue={existing?.contactInfo?.dateOfBirth ?? ""}
            />
            <TextInput
              type="tel"
              name="mobilePhone"
              label="Mobile phone"
              defaultValue={existing?.contactInfo?.mobilePhone ?? ""}
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="max-w-sm">
            <TextInput
              type="email"
              name="email"
              label="Email"
              defaultValue={existing?.contactInfo?.email ?? ""}
              placeholder="name@example.com"
            />
          </div>
        </fieldset>
      )}

      {canViewHrSensitive && (
        <fieldset className="border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
          <legend className="text-sm font-medium text-[var(--ink-900)] px-1">HR and payroll records</legend>
          <p className="text-xs text-[var(--ink-500)] mb-3">
            Home address and tax ID. Kept for payroll filing — not shown anywhere else in the app.
          </p>
          <div className="mb-4">
            <TextInput
              type="text"
              name="addressLine1"
              label="Address line 1"
              defaultValue={existing?.hrSensitive?.addressLine1 ?? ""}
            />
          </div>
          <div className="mb-4">
            <TextInput
              type="text"
              name="addressLine2"
              label="Address line 2 (optional)"
              defaultValue={existing?.hrSensitive?.addressLine2 ?? ""}
              placeholder="Apt, suite, unit, etc."
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <TextInput
              type="text"
              name="city"
              label="City"
              defaultValue={existing?.hrSensitive?.city ?? ""}
            />
            <TextInput
              type="text"
              name="state"
              label="State"
              defaultValue={existing?.hrSensitive?.state ?? ""}
              placeholder="NY"
            />
            <TextInput
              type="text"
              name="zipCode"
              label="ZIP code"
              defaultValue={existing?.hrSensitive?.zipCode ?? ""}
            />
          </div>
          <div className="max-w-xs">
            {/* Hand-rolled field (not TextInput) so the eye can anchor to
                the INPUT itself -- TextInput bundles label+input+hint in
                one box, and this field's long hint pushed a wrapper-
                anchored eye off the input row (measured live,
                2026-08-24). Classes mirror TextInput's fieldShell. */}
            <label className="block text-sm font-medium text-[var(--ink-700)] mb-1.5" htmlFor="ssnOrItin">
              SSN or ITIN
            </label>
            <div className="relative">
              <input
                id="ssnOrItin"
                type={ssnRevealed ? "text" : "password"}
                name="ssnOrItin"
                value={ssn}
                onChange={(e) => setSsn(formatSsn(e.target.value))}
                inputMode="numeric"
                maxLength={11}
                placeholder="XXX-XX-XXXX"
                className="w-full box-sizing-border-box border rounded-[var(--radius-md)] px-3 py-2.5 pr-11 text-base bg-[var(--card)] text-[var(--ink-900)] min-h-11 focus:outline-none focus:ring-2 focus:ring-[var(--primary-border)] focus:border-[var(--primary)] border-[var(--border-strong)]"
              />
              <button
                type="button"
                onClick={() => setSsnRevealed((r) => !r)}
                aria-label={ssnRevealed ? "Hide SSN" : "Reveal SSN"}
                className="absolute right-0 top-0 h-full min-w-11 flex items-center justify-center text-[var(--ink-500)] hover:text-[var(--ink-900)]"
              >
                {ssnRevealed ? <EyeOffIcon className="w-4 h-4" /> : <EyeIcon className="w-4 h-4" />}
              </button>
            </div>
            <p className="text-xs text-[var(--ink-500)] mt-1.5">
              SSN is generally required for a W-2 employee; ITIN generally applies to people who aren&apos;t authorized as a W-2
              employee. Check with your accountant or payroll provider before relying on this field for actual tax filing — Atlas
              doesn&apos;t validate or distinguish the two.
            </p>
          </div>
        </fieldset>
      )}

      {!canViewContact && !canViewHrSensitive && (
        <Banner
          tone="info"
          title="Personal info hidden"
          description="Contact details and HR records aren't part of what this account can see."
        />
      )}

      <Card className="!p-0 overflow-hidden">
      <details className="group" open={!existing}>
        <summary className="cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden flex items-center justify-between gap-2 px-4 py-3 min-h-11">
          <span className="text-lg font-medium text-[var(--ink-900)]">Positions</span>
          <ChevronDownIcon className="w-5 h-5 shrink-0 text-[var(--ink-500)] -rotate-90 transition-transform group-open:rotate-0" />
        </summary>
      <fieldset className="px-4 pb-4">
        <p className="text-xs text-[var(--ink-500)] mb-3">
          Which positions this person can be rostered into, and their standing tip point value for FOH
          positions (e.g. Server @ 1.0, Bartender @ 0.8 — a closing-time bump on a specific shift is
          entered on that shift&apos;s Closing Report, not here). For BOH positions, set their wage rate
          directly below — this is per-employee since BOH wages aren&apos;t shared like FOH&apos;s
          position-wide rate (set on the Positions page).
        </p>
        <div className="space-y-3">
          {allPositions.map((p) => (
            <div key={p.id} className="border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--card)]">
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink-900)] min-h-11">
                <input
                  type="checkbox"
                  name={`assign_${p.id}`}
                  checked={assigned.has(p.id)}
                  onChange={(e) => toggleAssigned(p.id, e.target.checked)}
                />
                {p.name} <span className="text-[var(--ink-500)] font-normal">({p.category})</span>
                {!p.active && <span className="text-xs text-[var(--ink-500)] font-normal">(retired)</span>}
              </label>

              {assigned.has(p.id) && (
                <div className="mt-2 sm:ml-6 flex flex-wrap gap-4 items-end">
                  <div className="w-28">
                    <TextInput
                      type="number"
                      step="0.1"
                      name={`tipPoint_${p.id}`}
                      label="Standing tip point value"
                      defaultValue={tipPointFor(p.id) ?? p.defaultTipPointValue ?? 1.0}
                    />
                  </div>
                  {p.category === "BOH" && (
                    <>
                      <div className="w-28">
                        <TextInput
                          type="number"
                          step="0.01"
                          name={`wageRate_${p.id}_Lunch`}
                          label="Lunch wage"
                          defaultValue={wageRateFor(p.id, "Lunch") ?? ""}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="w-28">
                        <TextInput
                          type="number"
                          step="0.01"
                          name={`wageRate_${p.id}_Dinner`}
                          label="Dinner wage"
                          defaultValue={wageRateFor(p.id, "Dinner") ?? ""}
                          placeholder="0.00"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </fieldset>
      </details>
      </Card>

      {/* Cancel LEFT of the primary (2026-08-24 consistency decision):
          dismissive-left/primary-right is what every ConfirmDialog, the
          preview's Back|Finalize pair, and Apple HIG / Material both do --
          five in-page forms had it backwards and were flipped together. */}
      <div className="flex items-center gap-3">
        <LinkButton href={existing ? `/people/${existing.id}` : "/people"} variant="secondary">
          Cancel
        </LinkButton>
        <Button type="submit" loading={isPending}>
          {isPending ? "Saving…" : existing ? "Save changes" : "Create employee"}
        </Button>
      </div>
    </form>
  );
}
