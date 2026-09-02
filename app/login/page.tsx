import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";
import { getCurrentStaffSession } from "@/lib/auth/session";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";
import { Banner } from "@/components/ui/Banner";
import { LoginForm } from "./LoginForm";
import { LoginWordmark } from "@/components/ui/Wordmark";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  // Already signed in — no point showing the login form again. "/" is the
  // role-aware tile home page (2026-08-16), same landing spot login itself
  // now uses for every role.
  const session = await getCurrentStaffSession();
  if (session) redirect("/");

  // 2026-08-19 idle-timeout landing (app/SessionIdleWarning.tsx redirects
  // here with this param once its poll comes back "already signed out").
  // Foolproof UX bar: an unexplained sign-out reads as "the app broke,"
  // not "this is a safety feature" — so say so explicitly, framed
  // reassuringly rather than as an error.
  const { reason } = await searchParams;

  // 2026-08-17 — which sign-in method to show is restaurant-configurable
  // (see Settings' "Staff login" section). "NAME" only needs the active
  // employee list; "ID" needs no server-side list at all, just the text
  // field.
  const settings = await loadRestaurantSettings();

  const activeEmployees =
    settings.staffLoginMethod === "NAME"
      ? await db.select({ id: employees.id, name: employees.nickname }).from(employees).where(eq(employees.active, true))
      : [];
  activeEmployees.sort((a, b) => a.name.localeCompare(b.name));

  return (
    <main className="max-w-sm mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-8">
        <LoginWordmark restaurantName={settings.restaurantName} />
        <h1 className="text-2xl font-bold text-[var(--ink-900)] mb-1.5">Staff sign in</h1>
        <p className="text-sm text-[var(--ink-500)]">
          {settings.staffLoginMethod === "NAME"
            ? "Pick your name and enter your PIN to see your own shift earnings."
            : "Enter your login ID and PIN to see your own shift earnings."}
        </p>
      </div>
      {reason === "idle" && (
        <div className="mb-4">
          <Banner tone="info" title="Signed out after 30 minutes of inactivity" description="Just a safety step for shared terminals — sign in again to continue." />
        </div>
      )}
      <LoginForm employees={activeEmployees} method={settings.staffLoginMethod} />
    </main>
  );
}
