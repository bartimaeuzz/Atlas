"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { generateWeekFromTemplate } from "@/lib/actions/schedule";
import { Button } from "@/components/ui/Button";

export function GenerateWeekButton({ weekStartDate }: { weekStartDate: string }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      loading={isPending}
      onClick={() =>
        startTransition(async () => {
          await generateWeekFromTemplate(weekStartDate);
          router.refresh();
        })
      }
    >
      {isPending ? "Generating…" : "Generate from template"}
    </Button>
  );
}
