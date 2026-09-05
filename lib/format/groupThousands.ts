/**
 * Thousands separators for a number that is being TYPED, not merely shown
 * (2026-09-05, Oliver: "ทำไมมันถึงไม่ตามกฎตัวเลขที่ตกลงกันไว้ว่าต้องมีเครื่องหมาย comma").
 *
 * This exists because two of this project's rules looked like they were in
 * conflict, and are not:
 *
 *   - Money is written with a thousands separator. `formatMoney` does it
 *     everywhere money is DISPLAYED.
 *   - A prefilled form field must hand back exactly what is stored, never
 *     rounded or locale-rendered — the 2026-09-04 lesson, learned on this
 *     very sales-targets form, where `String(Math.round(value))` turned a
 *     stored 3,800.50 into 3,801 on the next unrelated save.
 *
 * `toLocaleString` breaks the second rule: it is a NUMBER formatter, so it
 * rounds, and its default caps the fraction at three digits. This is a
 * STRING transform instead. It inserts commas between groups of digits and
 * touches nothing else — every digit the caller passed in comes back out,
 * in the same order, with the same decimal point. "3800.50" becomes
 * "3,800.50", not "3,800.5" and not "3,801".
 *
 * The round trip is closed at the other end by the actions, which already
 * strip `$`, `,` and whitespace before parsing ("managers type $3,800 as
 * readily as 3800"). So the comma is free: it costs nothing on the way back
 * in and it satisfies the display rule on the way out.
 */

/** Groups the integer part of a plain decimal string. Anything that is not
 * a plain decimal — a half-typed "1.2.3", a stray letter — is handed back
 * untouched rather than mangled, because the field is still being typed in
 * and the action, not this function, is what refuses a bad number. */
export function groupThousands(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed === "") return "";
  const negative = trimmed.startsWith("-");
  const body = negative ? trimmed.slice(1) : trimmed;
  if (!/^\d*\.?\d*$/.test(body) || body === "" || body === ".") return raw;

  const [whole, fraction] = body.split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  // A trailing "." is kept: someone typing "1500." mid-number must not have
  // the point taken away underneath them.
  const tail = body.includes(".") ? `.${fraction ?? ""}` : "";
  return `${negative ? "-" : ""}${grouped}${tail}`;
}

/** The inverse. Removes only separators, never digits. */
export function ungroupThousands(raw: string): string {
  return raw.replace(/,/g, "");
}

/** Where an offset in the GROUPED string lands in the ungrouped one.
 *
 * Needed because taking the commas out on focus is a `value` assignment, and
 * assigning to `input.value` collapses the selection to the end — including
 * the select-all a browser performs when you TAB into a text field. Without
 * this, tabbing into a box holding "18,500.75" and typing 9 gives
 * "18500.759" instead of "9": the digits append to a number the manager
 * believed they were replacing, on a statement total, silently
 * (2026-09-05 visual audit). Map the offsets across, then put them back.
 */
export function ungroupedOffset(grouped: string, index: number): number {
  let commas = 0;
  const upTo = Math.min(index, grouped.length);
  for (let i = 0; i < upTo; i++) if (grouped[i] === ",") commas += 1;
  return index - commas;
}
