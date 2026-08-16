"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { markNotificationSeen } from "@/lib/actions/notifications";

/** Fires once on mount to record that the signed-in manager has now
 * looked at the leave requests inbox, then refreshes the router so the
 * nav's red-pill count (resolved server-side in NavBar.tsx) drops on
 * the next render without needing a full page reload. Renders nothing.
 * useRef guards against firing twice under React 19 Strict Mode's
 * intentional double-invoke of effects in development. */
export function MarkSeenOnMount({ section }: { section: string }) {
  const router = useRouter();
  const firedRef = useRef(false);

  useEffect(() => {
    if (firedRef.current) return;
    firedRef.current = true;
    markNotificationSeen(section).then(() => router.refresh());
  }, [section, router]);

  return null;
}
