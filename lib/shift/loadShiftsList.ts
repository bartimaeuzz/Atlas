import { desc } from "drizzle-orm";
import { db } from "@/db/client";
import { shifts } from "@/db/schema";

export async function loadShiftsList() {
  return db.select().from(shifts).orderBy(desc(shifts.date), desc(shifts.id));
}
