/**
 * Two always-present, visually hidden live regions, mounted once in the
 * page shell (app/layout.tsx). Screen readers only reliably speak a live
 * region that ALREADY existed before its text changed; a node that
 * appears with role="alert" and its text in the same render — which is
 * exactly how Banner used to work — is announced by some readers and by
 * others not at all (WCAG 4.1.3). Banner now writes its text into these
 * via <Announce>; nothing else should touch them directly.
 */
export const POLITE_REGION_ID = "mohom-live-polite";
export const ASSERTIVE_REGION_ID = "mohom-live-assertive";

export function LiveRegions() {
  return (
    <>
      <div id={POLITE_REGION_ID} role="status" aria-live="polite" aria-atomic="true" className="sr-only" />
      <div id={ASSERTIVE_REGION_ID} role="alert" aria-live="assertive" aria-atomic="true" className="sr-only" />
    </>
  );
}
