/** Shared money formatter for the Ledger subsystem (design-system retrofit,
 * 2026-08-19) -- every money value across Ledger goes through this so the
 * app-wide convention (2 decimals, thousands separator, `$` sign, negative
 * shown as a leading minus rather than parentheses) is applied consistently
 * instead of each file hand-rolling its own `${x.toFixed(2)}`. */
export function formatMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  return `${sign}$${Math.abs(amount).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
