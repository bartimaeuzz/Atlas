import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { LoginForm } from "./LoginForm";

export default async function LoginPage() {
  // Already signed in — no point showing the login form again. "/" is the
  // role-aware tile home page (2026-08-16), same landing spot login itself
  // now uses for every role.
  const session = await getCurrentStaffSession();
  if (session) redirect("/");

  const activeEmployees = await db
    .select({ id: employees.id, name: employees.name })
    .from(employees)
    .where(eq(employees.active, true));
  activeEmployees.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="max-w-sm mx-auto p-8 font-sans">
      <h1 className="text-2xl font-semibold mb-1">Staff sign in</h1>
      <p className="text-sm text-neutral-500 mb-6">
        Pick your name and enter your PIN to see your own shift earnings.
      </p>
      <LoginForm employees={activeEmployees} />
    </main>
  );
}
