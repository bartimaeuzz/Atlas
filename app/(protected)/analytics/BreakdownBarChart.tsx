import { categoricalSlot } from "./palette";

/**
 * Horizontal bar breakdown — used for both the Revenue-by-channel and
 * Expense-by-category charts (2026-08-16, Analytics/P&L page).
 *
 * Deliberately NOT a doughnut/pie, even though Oliver's reference
 * workbook uses one: the dataviz skill's own form guidance is explicit
 * that a horizontal bar (not a donut) is the right form for "part to
 * whole," especially with named categories — precise length comparison
 * beats angle judgment, and it stays readable with more than 2-3
 * slices. Every bar carries its own direct label (name + $ + %), so
 * nothing depends on color-matching alone — this is also the "relief"
 * the palette's own contrast WARN calls for on its lighter slots.
 *
 * `<details>` below the chart is a plain-HTML table view (the
 * accessibility twin every chart in the dataviz skill's method needs),
 * no client-side JS required.
 */
export function BreakdownBarChart({
  title,
  subtitle,
  slices,
  total,
}: {
  title: string;
  subtitle?: string;
  slices: { label: string; amount: number; share: number }[];
  total: number;
}) {
  const maxAmount = Math.max(1, ...slices.map((s) => s.amount));

  return (
    <div className="border rounded p-4">
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-sm font-medium">{title}</h3>
        <span className="text-sm font-semibold tabular-nums">${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
      </div>
      {subtitle && <p className="text-xs text-neutral-400 mb-3">{subtitle}</p>}

      {slices.length === 0 ? (
        <p className="text-sm text-neutral-400 py-4">No data for this range.</p>
      ) : (
        <div className="space-y-2 mt-3">
          {slices.map((s, i) => (
            <div key={s.label} className="flex items-center gap-3">
              <div className="w-32 shrink-0 text-xs text-neutral-600 truncate" title={s.label}>
                {s.label}
              </div>
              <div className="flex-1 h-5 bg-neutral-100 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.max(2, (s.amount / maxAmount) * 100)}%`,
                    backgroundColor: categoricalSlot(i),
                  }}
                />
              </div>
              <div className="w-32 shrink-0 text-right text-xs tabular-nums text-neutral-700">
                ${s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                <span className="text-neutral-400">({(s.share * 100).toFixed(1)}%)</span>
              </div>
            </div>
          ))}
        </div>
      )}

      {slices.length > 0 && (
        <details className="mt-3">
          <summary className="text-xs text-neutral-400 cursor-pointer hover:text-neutral-600">View as table</summary>
          <table className="w-full text-xs mt-2 border-collapse">
            <thead>
              <tr className="text-left text-neutral-500 border-b">
                <th className="py-1 pr-2 font-normal">Category</th>
                <th className="py-1 pr-2 font-normal text-right">Amount</th>
                <th className="py-1 font-normal text-right">Share</th>
              </tr>
            </thead>
            <tbody>
              {slices.map((s) => (
                <tr key={s.label} className="border-b border-neutral-100">
                  <td className="py-1 pr-2">{s.label}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">${s.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</td>
                  <td className="py-1 text-right tabular-nums">{(s.share * 100).toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
