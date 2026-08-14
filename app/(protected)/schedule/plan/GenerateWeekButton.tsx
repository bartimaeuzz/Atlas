"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWeekFromTemplate } from "@/lib/actions/schedule";

export function GenerateWeekButton({ weekStartDate }: { weekStartDate: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await generateWeekFromTemplate(weekStartDate);
          router.refresh();
        })
      }
      className="bg-black text-white px-4 py-2 rounded hover:bg-neutral-800 text-sm disabled:opacity-50"
    >
      {isPending ? "Generating…" : "Generate from template"}
    </button>
  );
}
