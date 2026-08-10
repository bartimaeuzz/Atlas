"use client";

import { useMemo, useState } from "react";
import { calculateTwoPoolTips, type HostDrinkBonusInput, type PoolRosterEntry, type PoolSplitMethod } from "@/lib/calc/tipPool";
import type { RosterRow } from "@/lib/shift/loadRosterForCalc";

export function CalculatorForm({
  roster,
  initialCcTipTotal,
  hostBonusEligiblePositionIds,
}: {
  roster: RosterRow[];
  initialCcTipTotal: number;
  /** Positions eligible for the drink-count bonus input below, sourced from
   * db/schema.ts's positionMetrics table — replaces the old
   * positionName.startsWith("Host") hack (same source of truth the real
   * closing report's "Bonus metrics" section uses). */
  hostBonusEligiblePositionIds: number[];
}) {
  // Points are editable per roster row — matches how the schema actually
  // works (ShiftRosterEntry.pointValueOverride is per role-assignment for
  // this shift, not a single fixed number per person).
  const [points, setPoints] = useState<Record<number, number>>(() =>
    Object.fromEntries(roster.map((r) => [r.rosterEntryId, r.pointValue]))
  );

  const [deductionRate, setDeductionRate] = useState(0.045);
  const [pool1SplitMethod, setPool1SplitMethod] = useState<PoolSplitMethod>("POINT_WEIGHTED");
  const [pool2SplitMethod, setPool2SplitMethod] = useState<PoolSplitMethod>("POINT_WEIGHTED");
  const [pool3SplitMethod, setPool3SplitMethod] = useState<PoolSplitMethod>("EQUAL_SPLIT");
  const [grossCcTip, setGrossCcTip] = useState(initialCcTipTotal);
  const [takeoutCcTip, setTakeoutCcTip] = useState(0);
  const [cashTip, setCashTip] = useState(0);
  const [deliveryToastTip, setDeliveryToastTip] = useState(0);
  const [platformCourierTips, setPlatformCourierTips] = useState(0);
  const [platformDeliveryTips, setPlatformDeliveryTips] = useState(0);
  const [perDrinkAmount, setPerDrinkAmount] = useState(1);
  // ONE shared count for the whole host team's shift, not per host —
  // corrected 2026-08-10 to match the real business rule (a pooled
  // waiting-area drink count, split equally among whoever worked Host).
  const [sharedDrinkCount, setSharedDrinkCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [hasCalculated, setHasCalculated] = useState(false);
  const [result, setResult] = useState<ReturnType<typeof calculateTwoPoolTips> | null>(null);

  const pool1Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_1_DINE_IN"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: points[r.rosterEntryId] ?? r.pointValue }));

  const pool2Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_2_TAKEOUT_ONLINE"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: points[r.rosterEntryId] ?? r.pointValue }));

  const pool3Roster: PoolRosterEntry[] = roster
    .filter((r) => r.tipPoolGroups.includes("POOL_3_DELIVERY"))
    .map((r) => ({ employeeId: r.employeeId, pointValue: points[r.rosterEntryId] ?? r.pointValue }));

  const hosts = roster.filter(
    (r) => r.tipPoolGroups.includes("POOL_1_DINE_IN") && hostBonusEligiblePositionIds.includes(r.positionId)
  );

  const employeeNameById = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of roster) m.set(r.employeeId, r.employeeName);
    return m;
  }, [roster]);

  // Flat wage per employee — already de-duped to one row per employee by the loader.
  const flatWageByEmployee = useMemo(() => {
    const m = new Map<number, number>();
    for (const r of roster) if (r.flatWage != null) m.set(r.employeeId, r.flatWage);
    return m;
  }, [roster]);

  function handleCalculate() {
    setError(null);
    const hostDrinkBonus: HostDrinkBonusInput | null =
      sharedDrinkCount > 0 && hosts.length > 0
        ? { qualifyingDrinkCount: sharedDrinkCount, perDrinkAmount, recipientEmployeeIds: hosts.map((h) => h.employeeId) }
        : null;

    try {
      const r = calculateTwoPoolTips({
        deductionRate,
        grossCcTip,
        takeoutCcTip,
        cashTip,
        hostDrinkBonus,
        pool1Roster,
        pool1SplitMethod,
        platformCourierTips,
        pool2Roster,
        pool2SplitMethod,
        deliveryToastTip,
        platformDeliveryTips,
        pool3Roster,
        pool3SplitMethod,
      });
      setResult(r);
      setHasCalculated(true);
    } catch (e) {
      setResult(null);
      setHasCalculated(true);
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // Total estimated payout per employee = tip share(s) across whichever
  // pools they're in + host drink bonus (if any) + flat wage.
  const totalPayoutByEmployee = useMemo(() => {
    if (!result) return null;
    const totals = new Map<number, number>();
    const add = (id: number, amount: number) => totals.set(id, (totals.get(id) ?? 0) + amount);
    for (const [id, amt] of Object.entries(result.pool1.shareByEmployee)) add(Number(id), amt);
    for (const [id, amt] of Object.entries(result.pool2.shareByEmployee)) add(Number(id), amt);
    for (const [id, amt] of Object.entries(result.pool3.shareByEmployee)) add(Number(id), amt);
    for (const [id, amt] of Object.entries(result.hostDrinkBonusByEmployee)) add(Number(id), amt);
    for (const [id, wage] of flatWageByEmployee) add(id, wage);
    return totals;
  }, [result, flatWageByEmployee]);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="text-lg font-medium mb-3">Roster this shift</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Points are editable — try changing Erika&apos;s Pool 1 point to see how her
          share changes. Wage is looked up automatically (FOH: shared position rate,
          BOH: individual employee rate) and only counted once per person even if they
          have two rows (e.g. Host spans Pool 1 and Pool 2).
        </p>
        <RosterTable
          roster={roster}
          points={points}
          onPointChange={(id, v) => setPoints((p) => ({ ...p, [id]: v }))}
          splitMethods={{ POOL_1_DINE_IN: pool1SplitMethod, POOL_2_TAKEOUT_ONLINE: pool2SplitMethod, POOL_3_DELIVERY: pool3SplitMethod }}
        />
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Pool split method</h2>
        <p className="text-xs text-neutral-500 mb-3">
          Per-restaurant setting, not a fixed rule — point-weighted rewards higher point
          values, equal split ignores points entirely for that pool.
        </p>
        <div className="grid sm:grid-cols-3 gap-3 max-w-xl">
          <SplitMethodField label="Pool 1 (dine-in)" value={pool1SplitMethod} onChange={setPool1SplitMethod} />
          <SplitMethodField label="Pool 2 (takeout + platform-courier)" value={pool2SplitMethod} onChange={setPool2SplitMethod} />
          <SplitMethodField label="Pool 3 (delivery)" value={pool3SplitMethod} onChange={setPool3SplitMethod} />
        </div>
      </section>

      <section>
        <h2 className="text-lg font-medium mb-3">Shift financials</h2>
        <div className="grid grid-cols-2 gap-4 max-w-xl">
          <NumberField label="Deduction rate (e.g. 0.045 = 4.5%)" value={deductionRate} onChange={setDeductionRate} step={0.001} />
          <NumberField label="Gross CC tip (Toast total, all sources)" value={grossCcTip} onChange={setGrossCcTip} />
          <NumberField label="Takeout CC tip (subset of above)" value={takeoutCcTip} onChange={setTakeoutCcTip} />
          <NumberField label="Cash tip (added to Pool 1, no deduction)" value={cashTip} onChange={setCashTip} />
          <NumberField label="Delivery Toast tip (subset of above)" value={deliveryToastTip} onChange={setDeliveryToastTip} />
          <NumberField label="Platform-courier-delivered tips" value={platformCourierTips} onChange={setPlatformCourierTips} />
          <NumberField label="Restaurant-driver-delivered platform tips" value={platformDeliveryTips} onChange={setPlatformDeliveryTips} />
        </div>
      </section>

      {hosts.length > 0 && (
        <section>
          <h2 className="text-lg font-medium mb-3">Host team cocktail/mocktail bonus</h2>
          <p className="text-xs text-neutral-500 mb-3">
            One shared count for the whole host team&apos;s waiting-area drink sales this shift —
            split equally among {hosts.map((h) => h.employeeName).join(", ")}, not entered per person.
          </p>
          <div className="flex gap-4">
            <NumberField label="$ per qualifying drink" value={perDrinkAmount} onChange={setPerDrinkAmount} step={0.5} />
            <NumberField label="Qualifying drinks sold (whole team)" value={sharedDrinkCount} onChange={setSharedDrinkCount} step={1} />
          </div>
        </section>
      )}

      <button
        onClick={handleCalculate}
        className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800"
      >
        Calculate
      </button>

      {error && (
        <div className="border border-red-300 bg-red-50 text-red-700 rounded p-4 text-sm">
          {error}
        </div>
      )}

      {result && (
        <section className="space-y-6">
          <h2 className="text-lg font-medium">Results</h2>

          <PoolResult
            title="Pool 1 — Dine-in"
            lines={[
              ["Gross dine-in CC tip", result.pool1.grossDineInCcTip],
              ["Net dine-in CC tip (after deduction)", result.pool1.netDineInCcTip],
              ["Total host drink bonus (pulled off the top)", result.pool1.totalHostDrinkBonus],
              ["Net pool after host bonus", result.pool1.netPool1AfterHostBonus],
            ]}
            shares={result.pool1.shareByEmployee}
            employeeNameById={employeeNameById}
            extraShares={result.hostDrinkBonusByEmployee}
            extraLabel="+ drink bonus"
          />

          <PoolResult
            title="Pool 2 — Takeout + platform-courier delivery"
            lines={[
              ["Net takeout CC tip (after deduction)", result.pool2.netTakeoutCcTip],
              ["Platform-courier tips (no deduction)", result.pool2.platformCourierTips],
              ["Total Pool 2", result.pool2.totalPool2],
            ]}
            shares={result.pool2.shareByEmployee}
            employeeNameById={employeeNameById}
          />

          <PoolResult
            title="Pool 3 — Delivery (equal split)"
            lines={[
              ["Net delivery Toast tip (after deduction)", result.pool3.netDeliveryToastTip],
              ["Restaurant-driver platform tips (no deduction)", result.pool3.platformDeliveryTips],
              ["Total Pool 3", result.pool3.totalPool3],
            ]}
            shares={result.pool3.shareByEmployee}
            employeeNameById={employeeNameById}
          />

          {totalPayoutByEmployee && (
            <div className="border rounded p-4 bg-neutral-50">
              <div className="font-medium mb-2">Total estimated payout (tips + wage)</div>
              <table className="text-sm w-full max-w-md">
                <tbody>
                  {Array.from(totalPayoutByEmployee.entries())
                    .sort((a, b) => b[1] - a[1])
                    .map(([id, total]) => (
                      <tr key={id} className="border-t">
                        <td className="py-1">{employeeNameById.get(id) ?? `#${id}`}</td>
                        <td className="py-1 text-neutral-500">
                          {flatWageByEmployee.has(id) ? `wage $${flatWageByEmployee.get(id)!.toFixed(2)} + tips` : "tips only"}
                        </td>
                        <td className="py-1 text-right tabular-nums font-medium">${total.toFixed(2)}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
              <p className="text-xs text-neutral-500 mt-2">
                Doesn&apos;t include Manager/Floor Manager commission — that lives in the
                Incentive Rules engine, which isn&apos;t built yet.
              </p>
            </div>
          )}
        </section>
      )}

      {hasCalculated && !result && !error && (
        <p className="text-neutral-500 text-sm">No result.</p>
      )}
    </div>
  );
}

function RosterTable({
  roster,
  points,
  onPointChange,
  splitMethods,
}: {
  roster: RosterRow[];
  points: Record<number, number>;
  onPointChange: (rosterEntryId: number, value: number) => void;
  splitMethods: Record<"POOL_1_DINE_IN" | "POOL_2_TAKEOUT_ONLINE" | "POOL_3_DELIVERY", PoolSplitMethod>;
}) {
  const groups: Record<string, RosterRow[]> = {
    POOL_1_DINE_IN: [],
    POOL_2_TAKEOUT_ONLINE: [],
    POOL_3_DELIVERY: [],
    NONE: [],
  };
  // A row can now belong to more than one pool at once (e.g. Host is in
  // both Pool 1 and Pool 2 via one roster row) — show it in every group it
  // belongs to, not just one, so the "what pool is this person in" view
  // stays accurate.
  for (const r of roster) {
    if (r.tipPoolGroups.length === 0) {
      groups.NONE.push(r);
    } else {
      for (const g of r.tipPoolGroups) groups[g].push(r);
    }
  }

  const baseLabels: Record<string, string> = {
    POOL_1_DINE_IN: "Pool 1 (dine-in)",
    POOL_2_TAKEOUT_ONLINE: "Pool 2 (takeout + platform-courier)",
    POOL_3_DELIVERY: "Pool 3 (delivery)",
    NONE: "No tip pool (commission-only)",
  };

  return (
    <div className="grid sm:grid-cols-2 gap-4">
      {Object.entries(groups).map(([key, rows]) => {
        if (rows.length === 0) return null;
        const method = key === "NONE" ? null : splitMethods[key as keyof typeof splitMethods];
        const label = method
          ? `${baseLabels[key]} — ${method === "EQUAL_SPLIT" ? "equal split, points ignored" : "point-weighted"}`
          : baseLabels[key];
        return (
          <div key={key} className="border rounded p-3">
            <div className="text-xs font-medium text-neutral-500 mb-2">{label}</div>
            <table className="text-sm w-full">
              <tbody>
                {rows.map((r) => (
                  <tr key={r.rosterEntryId} title={r.wageNote ?? undefined}>
                    <td className="py-0.5">{r.employeeName}</td>
                    <td className="py-0.5 text-neutral-500">{r.positionName}</td>
                    <td className="py-0.5 text-right">
                      {key === "NONE" ? (
                        <span className="text-neutral-400">—</span>
                      ) : (
                        <input
                          type="number"
                          step={0.1}
                          disabled={method === "EQUAL_SPLIT"}
                          className="border rounded px-1 py-0.5 w-16 text-right tabular-nums disabled:bg-neutral-100 disabled:text-neutral-400"
                          value={points[r.rosterEntryId] ?? r.pointValue}
                          onChange={(e) => onPointChange(r.rosterEntryId, Number(e.target.value))}
                        />
                      )}
                    </td>
                    <td className="py-0.5 pl-2 text-right tabular-nums text-neutral-500 whitespace-nowrap">
                      {r.flatWage != null ? `$${r.flatWage.toFixed(2)}` : r.wageNote ? "—*" : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

function SplitMethodField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: PoolSplitMethod;
  onChange: (v: PoolSplitMethod) => void;
}) {
  return (
    <label className="text-sm block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <select
        className="border rounded px-2 py-1 w-full"
        value={value}
        onChange={(e) => onChange(e.target.value as PoolSplitMethod)}
      >
        <option value="POINT_WEIGHTED">Point-weighted</option>
        <option value="EQUAL_SPLIT">Equal split</option>
      </select>
    </label>
  );
}

function PoolResult({
  title,
  lines,
  shares,
  employeeNameById,
  extraShares,
  extraLabel,
}: {
  title: string;
  lines: [string, number][];
  shares: Record<number, number>;
  employeeNameById: Map<number, string>;
  extraShares?: Record<number, number>;
  extraLabel?: string;
}) {
  const employeeIds = Object.keys(shares).map(Number);
  if (employeeIds.length === 0 && Object.keys(extraShares ?? {}).length === 0) return null;

  return (
    <div className="border rounded p-4">
      <div className="font-medium mb-2">{title}</div>
      <dl className="text-sm grid grid-cols-2 gap-x-4 gap-y-1 mb-3 max-w-md">
        {lines.map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-neutral-500">{label}</dt>
            <dd className="text-right tabular-nums">${value.toFixed(2)}</dd>
          </div>
        ))}
      </dl>
      <table className="text-sm w-full max-w-md">
        <tbody>
          {employeeIds.map((id) => (
            <tr key={id} className="border-t">
              <td className="py-1">{employeeNameById.get(id) ?? `#${id}`}</td>
              <td className="py-1 text-right tabular-nums">${shares[id].toFixed(2)}</td>
              {extraShares?.[id] ? (
                <td className="py-1 text-right tabular-nums text-neutral-500">
                  {extraLabel} ${extraShares[id].toFixed(2)}
                </td>
              ) : (
                <td />
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NumberField({
  label,
  value,
  onChange,
  step = 1,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  step?: number;
}) {
  return (
    <label className="text-sm block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <input
        type="number"
        step={step}
        className="border rounded px-2 py-1 w-full"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
