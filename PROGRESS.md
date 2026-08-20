# Atlas Track 2 — Progress

## START HERE (read this first, new session)

**What this is:** Atlas Track 2 is a standalone Thai restaurant management app (tip-pool + wage payroll) that Oliver (business/PM, non-dev) and Claude are building hands-on together, independently of his brother Seth's separate app (Track 1, at core-peach-sigma.vercel.app). Modeled on Youk Thai (NYC)'s real closing-report/payroll process. If this proves out, Oliver wants to sell it to Thai restaurants nationally — project codename "Atlas."

**Repo / branches:** `https://github.com/bartimaeuzz/Atlas.git` (public, clone anonymously, no auth needed to read). `main` = backend/schema/business-logic work — another session may be actively committing here, so run `git log` before assuming state, and don't force-push or rebase it. `ui-design` = UI/visual work, branched off `main`. If you're doing design/UI work, work on `ui-design` and stay off `main`.

**Architecture in one paragraph:** Next.js 16 (App Router) + TypeScript + Tailwind, Drizzle ORM over SQLite. All core payroll math (tip pool splits, wage calc) lives in framework-free pure functions in `lib/calc/` — no DB, no Next.js imports, fully unit tested (`npm test`, 30 tests passing as of the last backend change). Everything DB/Next-specific (loading data, writing records, redirects) lives in `lib/actions/` and `lib/shift/`. Business rules that vary by restaurant (CC tip deduction rate, tip-pool split method, roster visibility) are fields on `RestaurantSettings` in `db/schema.ts`, not hardcoded — a deliberate, standing convention. Keep following it rather than hardcoding new restaurant-specific behavior.

**Standing conventions to follow:**
- Server Actions use React's `useActionState` pattern (`(prevState, formData) => {error}`) so bad input shows an inline message instead of Next's generic crash page. `redirect()` always sits OUTSIDE any try/catch in an action (it throws internally to work).
- "Compute vs. write" separation for anything that becomes a permanent/locked record: build one pure "gather inputs + compute" function, reuse it for a read-only preview AND the real write, so preview and actual can never drift (see `lib/shift/computeFinalizationPreview.ts` for the pattern).
- Don't hardcode a fixed set of restaurant options where a `RestaurantSettings` field would do — see the pool split-method setting as the reference example.
- No Playwright/browser E2E available in this sandbox (blocked by sandbox restrictions). Verify behavior with direct-DB tsx scripts written to `scripts/`, delete them after use, and run `npm run db:seed` afterward to reset sample data.

RESUME_MARKER_2