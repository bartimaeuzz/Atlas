import Link from "next/link";
import { eq } from "drizzle-orm";
import { db } from "@/db/client";
import { employees } from "@/db/schema";
import { RecoverForm } from "./RecoverForm";
import { TAP_TARGET_PAD } from "@/components/ui/touchTarget";
import { LoginWordmark } from "@/components/ui/Wordmark";
import { loadRestaurantSettings } from "@/lib/settings/loadRestaurantSettings";

/** Public "Forgot PIN?" page (2026-08-17) — deliberately reachable without
 * any session, same as /login itself. Lists every active employee (not
 * just Manager/Admin — Oliver's confirmed scope: the recovery code can
 * reset anyone's PIN, not only the account that's locked out) so a
 * correct recovery code can be used to fix whichever account actually
 * needs it. See lib/actions/recovery.ts for the actual verify+reset
 * logic and its rate limiting. */
export default async function RecoverPage() {
  const activeEmployees = await db
    .select({ id: employees.id, name: employees.nickname })
    .from(employees)
    .where(eq(employees.active, true));
  activeEmployees.sort((a, b) => a.name.localeCompare(b.name));
  const { restaurantName } = await loadRestaurantSettings();

  return (
    <main className="max-w-sm mx-auto px-4 py-16 sm:py-24">
      <div className="text-center mb-8">
        <LoginWordmark restaurantName={restaurantName} />
        <h1 className="text-2xl font-bold text-[var(--ink-900)] mb-1.5">Reset a PIN with your recovery code</h1>
        <p className="text-sm text-[var(--ink-500)]">
          Enter the restaurant&apos;s recovery code (from Settings → Account recovery), choose whose PIN to reset,
          and set a new one.
        </p>
      </div>
      <RecoverForm employees={activeEmployees} />
      <p className="text-center text-sm text-[var(--ink-500)] mt-6">
        <Link href="/login" className={`underline inline-block ${TAP_TARGET_PAD}`}>
          ← Back to sign in
        </Link>
      </p>
    </main>
  );
}
