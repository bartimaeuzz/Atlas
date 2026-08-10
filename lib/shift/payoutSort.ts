/**
 * Shared sort for the manager-facing "Payout by employee" tables (Preview
 * + Summary Report), added 2026-08-10 so they match the sort order
 * Oliver asked for on My Pay's "Also worked this shift" list: FOH before
 * BOH, then position name (A-Z), then employee name (A-Z). One function
 * so both pages can't drift apart on ordering.
 */
export function sortPayoutsForDisplay<T extends { employeeId: number }>(
  payouts: T[],
  namesById: Record<number, string>,
  positionsById: Record<number, { positionName: string; positionCategory: "FOH" | "BOH" }>
): T[] {
  const categoryRank = (c: string | undefined) => (c === "FOH" ? 0 : c === "BOH" ? 1 : 2);
  return [...payouts].sort((a, b) => {
    const posA = positionsById[a.employeeId];
    const posB = positionsById[b.employeeId];
    const catDiff = categoryRank(posA?.positionCategory) - categoryRank(posB?.positionCategory);
    if (catDiff !== 0) return catDiff;

    const posNameDiff = (posA?.positionName ?? "").localeCompare(posB?.positionName ?? "");
    if (posNameDiff !== 0) return posNameDiff;

    return (namesById[a.employeeId] ?? "").localeCompare(namesById[b.employeeId] ?? "");
  });
}
