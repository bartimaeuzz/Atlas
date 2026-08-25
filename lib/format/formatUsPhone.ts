/** "(646) 659-9555" for display — mirrors the People form's input mask
 * (2026-08-24) so a number reads the same everywhere it appears. Values
 * that aren't ten digits come back untouched rather than mangled. */
export function formatUsPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length !== 10) return raw;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}
