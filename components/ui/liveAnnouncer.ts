/**
 * Serialised writer for the two live regions in LiveRegions.tsx (2026-09-02).
 * A live region only speaks when its text CHANGES, and two writes in the
 * same frame collapse to the last — so two Banners appearing together used
 * to lose all but one, and the same message twice in a row said nothing.
 *
 * This queues every message and plays them one at a time: clear the
 * region, set the text after a short timer (so even an identical repeat is
 * a real empty→text change), then wait before the next so a screen reader
 * finishes reading. Callers reach it through <Announce>, never directly.
 */
import { ASSERTIVE_REGION_ID, POLITE_REGION_ID } from "./LiveRegions";

type Msg = { text: string; assertive: boolean };
const queue: Msg[] = [];
let draining = false;
const GAP_MS = 900;

export function announce(text: string, assertive: boolean): void {
  if (!text || typeof document === "undefined") return;
  queue.push({ text, assertive });
  if (!draining) drain();
}

function drain(): void {
  const next = queue.shift();
  if (!next) {
    draining = false;
    return;
  }
  draining = true;
  const region = document.getElementById(next.assertive ? ASSERTIVE_REGION_ID : POLITE_REGION_ID);
  if (!region) {
    // The shell isn't mounted (should not happen in-app) — drop the
    // backlog rather than spin, and let a later call restart the queue.
    queue.length = 0;
    draining = false;
    return;
  }
  region.textContent = "";
  // setTimeout, not requestAnimationFrame: rAF is paused entirely while
  // the tab is backgrounded, which would stall every queued announcement
  // until the tab is shown again. A short timer still fires when hidden
  // (throttled, but it fires), and the ~60ms empty→text gap is enough for
  // a screen reader to register a change even when the text repeats.
  window.setTimeout(() => {
    region.textContent = next.text;
    window.setTimeout(drain, GAP_MS);
  }, 60);
}
