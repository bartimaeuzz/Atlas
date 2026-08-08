/**
 * Flat wage (เหมาจ่าย) lookup. FOH wages are shared per position+period
 * (PositionShiftRate). BOH wages are individual per employee+period
 * (EmployeeWageRate) — confirmed BOH pay differs per person and can split
 * unevenly across lunch/dinner based on hours worked, NOT a shared rate.
 */

export interface FlatWageParams {
  category: "FOH" | "BOH";
  positionRate?: number; // required when category = FOH
  employeeRate?: number; // required when category = BOH
}

export function calculateFlatWage(params: FlatWageParams): number {
  if (params.category === "FOH") {
    if (params.positionRate == null) {
      throw new Error("FOH flat wage requires a positionRate (PositionShiftRate lookup)");
    }
    return params.positionRate;
  }
  if (params.employeeRate == null) {
    throw new Error("BOH flat wage requires an employeeRate (EmployeeWageRate lookup)");
  }
  return params.employeeRate;
}
