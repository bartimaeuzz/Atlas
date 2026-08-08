import Link from "next/link";
import { notFound } from "next/navigation";
import { loadClosingReportData } from "@/lib/shift/loadClosingReportData";
import { saveClosingReportSales, saveClosingReportAndFinalize } from "@/lib/actions/shift";

export default async function ClosingReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const shiftId = Number(id);
  const data = await loadClosingReportData(shiftId);

  if (!data.shift) notFound();
  const isFinalized = data.shift.status === "finalized";
  const s = data.sales;

  return (
    <main className="max-w-3xl mx-auto p-8 font-sans">
      <p className="text-sm mb-1">
        <Link href={`/shifts/${shiftId}/roster`} className="text-neutral-500 hover:underline">← Roster</Link>
      </p>
      <h1 className="text-2xl font-semibold mb-1">
        Closing Report — {data.shift.date} ({data.shift.period})
      </h1>
      <p className="text-sm text-neutral-500 mb-6">Status: {data.shift.status}</p>

      {isFinalized && (
        <div className="border border-amber-300 bg-amber-50 text-amber-800 rounded p-4 text-sm mb-6">
          This shift is finalized — figures are locked.{" "}
          <Link href={`/shifts/${shiftId}/summary`} className="underline">View the Summary Report →</Link>
        </div>
      )}

      <form className="space-y-8">
        <input type="hidden" name="shiftId" value={shiftId} />

        <fieldset disabled={isFinalized}>
          <legend className="text-lg font-medium mb-3">Sales</legend>
          <div className="grid sm:grid-cols-2 gap-4 max-w-xl">
            <Field label="Total sales" name="totalSales" defaultValue={s?.totalSales} />
            <Field label="CC tip total (Toast, all sources)" name="ccTipTotal" defaultValue={s?.ccTipTotal} />
            <Field label="Takeout CC tip (subset of above)" name="takeoutCcTip" defaultValue={s?.takeoutCcTip} />
            <Field label="Delivery Toast tip (subset of above)" name="deliveryToastTip" defaultValue={s?.deliveryToastTip} />
            <Field label="Cash sales" name="cashSales" defaultValue={s?.cashSales} />
            <Field label="Gross food sales" name="grossFoodSales" defaultValue={s?.grossFoodSales} />
            <Field label="Gross beverage sales" name="grossBeverageSales" defaultValue={s?.grossBeverageSales} />
          </div>
        </fieldset>

        <fieldset disabled={isFinalized}>
          <legend className="text-lg font-medium mb-3">Online platform sales</legend>
          <p className="text-xs text-neutral-500 mb-3">
            Split tips by who delivered: platform-courier tips feed Pool 2 (Host/Operator/Packer/Bag
            Handler), restaurant-driver tips feed Pool 3 (Delivery Guy).
          </p>
          <div className="space-y-4">
            {data.platformSales.map((p) => (
              <div key={p.platformId} className="border rounded p-3">
                <div className="text-sm font-medium mb-2">{p.platformName}</div>
                <div className="grid sm:grid-cols-4 gap-3">
                  <Field label="Sales amount" name={`platform_${p.platformId}_salesAmount`} defaultValue={p.salesAmount} />
                  <Field label="Commission fee" name={`platform_${p.platformId}_commissionFee`} defaultValue={p.commissionFee} />
                  <Field label="Tip — platform courier" name={`platform_${p.platformId}_tipCourier`} defaultValue={p.tipAmountPlatformCourier} />
                  <Field label="Tip — restaurant delivery" name={`platform_${p.platformId}_tipRestaurantDelivery`} defaultValue={p.tipAmountRestaurantDelivery} />
                </div>
              </div>
            ))}
          </div>
        </fieldset>

        {!isFinalized && (
          <div className="flex gap-3">
            <button
              formAction={saveClosingReportSales}
              className="border border-neutral-300 px-4 py-2 rounded hover:bg-neutral-50"
            >
              Save (draft)
            </button>
            <button
              formAction={saveClosingReportAndFinalize}
              className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800"
            >
              Save &amp; Finalize → View Summary
            </button>
          </div>
        )}
      </form>
    </main>
  );
}

function Field({ label, name, defaultValue }: { label: string; name: string; defaultValue?: number }) {
  return (
    <label className="text-sm block">
      <span className="block text-neutral-500 mb-1">{label}</span>
      <input
        type="number"
        step={0.01}
        name={name}
        defaultValue={defaultValue ?? 0}
        className="border rounded px-2 py-1 w-full disabled:bg-neutral-100"
      />
    </label>
  );
}
