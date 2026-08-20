"use client";

import { useActionState, useState } from "react";
import { createEmployee, updateEmployee, type EmployeeActionState } from "@/lib/actions/employees";
import type { EmployeeListRow, AssignablePosition } from "@/lib/employees/loadEmployeesList";
import { TextInput, Select } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";
import { Banner } from "@/components/ui/Banner";

const initialState: EmployeeActionState = { error: null };

export function EmployeeForm({
  existing,
  allPositions,
  viewerIsAdmin,
}: {
  existing: EmployeeListRow | null;
  allPositions: AssignablePosition[];
  viewerIsAdmin: boolean;
}) {
  const action = existing ? updateEmployee : createEmployee;
  const [state, formAction, isPending] = useActionState(action, initialState);

  const initialAssigned = new Set(existing?.positions.map((p) => p.positionId) ?? []);
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

      <label className="flex items-center gap-2 text-sm text-[var(--ink-700)] py-1">
        <input type="checkbox" name="active" defaultChecked={existing?.active ?? true} />
        Active — unchecking retires them (never deleted; past shifts stay intact)
      </label>

      <label className="flex items-start gap-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)]">
        <input
          type="checkbox"
          name="isFinancialAuditor"
          defaultChecked={existing?.isFinancialAuditor ?? false}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium text-[var(--ink-900)]">Financial auditor</span>
          <span className="block text-xs text-[var(--ink-500)] mt-0.5">
            Can edit a Supplier Check invoice that&apos;s already Printed or Paid. Their own PIN below
            doubles as the confirmation code required on every such edit — anyone doing that edit,
            even an Admin, has to enter THIS person&apos;s code to confirm it, not their own.
          </span>
        </span>
      </label>

      <label className="flex items-start gap-2 text-sm border border-[var(--border)] rounded-[var(--radius-md)] p-3 bg-[var(--paper)]">
        <input
          type="checkbox"
          name="isPartner"
          defaultChecked={existing?.isPartner ?? false}
          className="mt-0.5"
        />
        <span>
          <span className="block font-medium text-[var(--ink-900)]">Partner</span>
          <span className="block text-xs text-[var(--ink-500)] mt-0.5">
            Restaurant partner/owner, independent of system role. Used as the default department
            (Partner) when generating this person&apos;s login ID on the People page.
          </span>
        </span>
      </label>

      {viewerIsAdmin ? (
        <fieldset className="border border-[var(--border)] rounded-[var(--radius-lg)] p-4">
          <legend className="text-sm font-medium text-[var(--ink-900)] px-1">Personal information (Admin only)</legend>
          <p className="text-xs text-[var(--ink-500)] mb-3">
            Only visible to Admin accounts. Used for HR/payroll records — not shown anywhere else in the app.
          </p>
          <div className="grid sm:grid-cols-2 gap-4 mb-4">
            <TextInput
              type="date"
              name="dateOfBirth"
              label="Date of birth"
              defaultValue={existing?.personalInfo?.dateOfBirth ?? ""}
            />
            <TextInput
              type="tel"
              name="mobilePhone"
              label="Mobile phone"
              defaultValue={existing?.personalInfo?.mobilePhone ?? ""}
              placeholder="(555) 555-5555"
            />
          </div>
          <div className="mb-4 max-w-sm">
            <TextInput
              type="email"
              name="email"
              label="Email"
              defaultValue={existing?.personalInfo?.email ?? ""}
              placeholder="name@example.com"
            />
          </div>
          <div className="mb-4">
            <TextInput
              type="text"
              name="addressLine1"
              label="Address line 1"
              defaultValue={existing?.personalInfo?.addressLine1 ?? ""}
            />
          </div>
          <div className="mb-4">
            <TextInput
              type="text"
              name="addressLine2"
              label="Address line 2 (optional)"
              defaultValue={existing?.personalInfo?.addressLine2 ?? ""}
              placeholder="Apt, suite, unit, etc."
            />
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mb-4">
            <TextInput
              type="text"
              name="city"
              label="City"
              defaultValue={existing?.personalInfo?.city ?? ""}
            />
            <TextInput
              type="text"
              name="state"
              label="State"
              defaultValue={existing?.personalInfo?.state ?? ""}
              placeholder="NY"
            />
            <TextInput
              type="text"
              name="zipCode"
              label="ZIP code"
              defaultValue={existing?.personalInfo?.zipCode ?? ""}
            />
          </div>
          <div className="max-w-xs">
            <TextInput
              type="text"
              name="ssnOrItin"
              label="SSN or ITIN"
              defaultValue={existing?.personalInfo?.ssnOrItin ?? ""}
              placeholder="XXX-XX-XXXX"
              hint="SSN is generally required for a W-2 employee; ITIN generally applies to people who aren't authorized as a W-2 employee. Check with your accountant or payroll provider before relying on this field for actual tax filing — Atlas doesn't validate or distinguish the two."
            />
          </div>
        </fieldset>
      ) : (
        <Banner
          tone="info"
          title="Personal info hidden"
          description="Date of birth, address, phone, email, and SSN/ITIN are only visible to Admin accounts."
        />
      )}

      <fieldset>
        <legend className="text-lg font-medium text-[var(--ink-900)] mb-2">Positions</legend>
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
              <label className="flex items-center gap-2 text-sm font-medium text-[var(--ink-900)]">
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

      <Button type="submit" loading={isPending}>
        {isPending ? "Saving…" : existing ? "Save changes" : "Create employee"}
      </Button>
    </form>
  );
}
