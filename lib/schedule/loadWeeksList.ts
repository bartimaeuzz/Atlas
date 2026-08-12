import { inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { scheduleWeeks } from "@/db/schema";
import { datesInWeek, shiftWeek } from "@/lib/schedule/weekMath";

export interface WeekListEntry {
  weekStartDate: string;
  weekEndDate: string;
  status: "published" | "draft" | "not_planned";
}

export interface WeeksListData {
  weeks: WeekListEntry[];
  windowStart: string;
}

/** Powers /schedule/weeks — a flat list of weeks with their status, for
 * quickly seeing what's published vs still draft vs not planned at all
 * without having to click through the weekly grid one at a time
 * (2026-08-11, Oliver's ask — a navigation aid alongside the month
 * calendar, not a replacement for it). `count` consecutive weeks
 * starting at `windowStart`, each checked against scheduleWeeks —
 * missing means "not_planned", same meaning as loadWeeklyPlan's
 * `week: null`. */
export async function loadWeeksList(windowStart: string, count: number): Promise<WeeksListData> {
  const weekStarts = Array.from({ length: count }, (_, i) => shiftWeek(windowStart, i));

  const rows = await db.select().from(scheduleWeeks).where(inArray(scheduleWeeks.weekStartDate, weekStarts));
  const byStart = new Map(rows.map((r) => [r.weekStartDate, r]));

  const weeks: WeekListEntry[] = weekStarts.map((weekStartDate) => {
    const existing = byStart.get(weekStartDate);
    return {
      weekStartDate,
      weekEndDate: datesInWeek(weekStartDate)[6],
      status: existing ? (existing.status as "draft" | "published") : "not_planned",
    };
  });

  return { weeks, windowStart };
}
