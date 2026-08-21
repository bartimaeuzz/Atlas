import { LinkButton } from "@/components/ui/Button";

/**
 * Shown in place of a page the signed-in person doesn't hold the
 * capability for (Permission System Phase C, 2026-08-21).
 *
 * Rendered inline by the page itself rather than redirected to, on
 * purpose. Three reasons, all of them things this app has been bitten by
 * before:
 *
 * 1. The URL stays put, so the browser Back button does the obvious
 *    thing and a bookmarked link doesn't silently become a different
 *    page.
 * 2. It says what happened. requireAdmin() currently bounces a non-Admin
 *    to /people with no explanation — for the low-computer-literacy
 *    audience this app is built for (see
 *    project_atlas_target_users_accessibility memory), landing somewhere
 *    you didn't ask for reads as "the app is broken", not as "you don't
 *    have access".
 * 3. It's never a dead end: there is exactly one obvious next action
 *    (go back to the home page), matching the dead-end-guard pattern
 *    already established elsewhere in Atlas.
 *
 * Wording is deliberately plain and blame-free — no "forbidden",
 * "denied", "unauthorized", or error styling. Not having a capability is
 * a normal, expected state, not a mistake the person made.
 */
export function NoAccess({
  /** What the person was trying to open, in their words — e.g.
   * "the Analytics page". Used in the sentence, so keep it lowercase
   * and noun-shaped. */
  pageLabel,
}: {
  pageLabel: string;
}) {
  return (
    <main className="max-w-md mx-auto p-6 sm:p-8">
      <div className="rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--card)] p-6 shadow-[var(--shadow-1)]">
        <h1 className="text-xl font-bold text-[var(--ink-900)] mb-2">You don&apos;t have access to {pageLabel}</h1>
        <p className="text-sm text-[var(--ink-700)] mb-1">
          Your account isn&apos;t set up to open this page. Nothing is wrong — it just isn&apos;t part of what you
          manage.
        </p>
        <p className="text-sm text-[var(--ink-500)] mb-5">
          If you need it, ask an admin to turn it on for you under Permission and Roles.
        </p>
        <LinkButton href="/">Back to home</LinkButton>
      </div>
    </main>
  );
}
