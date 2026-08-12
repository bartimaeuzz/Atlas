import Link from "next/link";
import { loadTemplatesByPosition } from "@/lib/schedule/loadTemplatesByPosition";
import { PositionTemplateGrid } from "./PositionTemplateGrid";

export default async function ScheduleTemplatesPage() {
  const groups = await loadTemplatesByPosition();

  return (
    <main className="max-w-4xl mx-auto p-8 font-sans">
      <Link href="/schedule" className="text-sm text-neutral-500 hover:text-black">
        &larr; Schedule Planner
      </Link>
      <h1 className="text-2xl font-semibold mt-2 mb-1">Template assignments</h1>
      <p className="text-neutral-500 text-sm mb-6">
        Who normally works which position — the recurring baseline a week&apos;s plan will be
        pre-filled from. Pick a position, pick a person, then check off the days and shifts they
        work. This is a fixed default: it only changes when you tell it to (a resignation, a
        promotion, a sales-driven staffing change), not automatically every week.
      </p>

      {groups.length === 0 ? (
        <p className="text-neutral-500 text-sm">Add active positions first.</p>
      ) : (
        <PositionTemplateGrid groups={groups} />
      )}
    </main>
  );
}
