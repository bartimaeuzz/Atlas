"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { publishWeek } from "@/lib/actions/schedule";

export function PublishWeekButton({ weekId }: { weekId: number }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() => {
        if (!window.confirm("Publish this week? It'll become visible to staff and start auto-filling new shifts.")) return;
        startTransition(async () => {
          await publishWeek(weekId);
          router.refresh();
        });
      }}
      className="bg-green-700 text-white px-4 py-1.5 rounded hover:bg-green-800 text-sm disabled:opacity-50"
    >
      {isPending ? "Publishing…" : "Publish"}
    </button>
  );
}
