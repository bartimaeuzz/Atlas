"use client";

import { useEffect } from "react";
import { announce } from "./liveAnnouncer";

/** Speaks `text` through the pre-mounted live region (LiveRegions.tsx),
 * via the serialised announcer so concurrent and repeated messages are
 * all heard. Renders nothing.
 *
 * `announceKey` is the identity of the event that produced this message,
 * NOT its text — pass the useActionState `state` object (a new reference
 * per submit). Without it, an identical error twice in a row would not
 * re-announce, because the text is the only other dependency and it did
 * not change. This is the "adopt via a nonce, not the content" lesson
 * (feedback-useactionstate-results-outlive-the-ui) applied to speech. */
export function Announce({
  text,
  assertive,
  announceKey,
}: {
  text: string;
  assertive: boolean;
  announceKey?: unknown;
}) {
  // announceKey is intentionally in the dependency list: a new identity
  // re-speaks the same text. It is used only for that identity, never read.
  useEffect(() => {
    if (text) announce(text, assertive);
  }, [text, assertive, announceKey]);
  return null;
}
