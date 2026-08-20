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

**Suggested reading order for a cold start:** this file top-to-bottom (the dated changelog below), then `db/schema.ts`, then `lib/calc/tipPool.ts` and `lib/calc/finalizeShift.ts`, then `app/shifts/[id]/` to see how it's wired into actual pages.

**Explicitly deferred — don't build these speculatively without checking first:**
- Position admin UI (create/edit positions with pool-membership checkboxes) — Oliver specifically asked to be reminded about this one.
- Generic/restaurant-configurable tip pool structure (count, membership, funding beyond the fixed 3 pools) — confirmed backlog item, deliberately not built until there's a second real restaurant's requirements to design against.
- Full Incentive Rules evaluation engine (conditions/targets/weights/reward dispatch) — the host drink bonus (2026-08-09) uses the engine's storage tables (MetricDefinition, MetricValue, the new positionMetrics) directly with hardcoded logic in finalizeShift.ts, not a generic rule evaluator. Build that dispatcher once a second bonus scenario (BOH sales-split, Manager weekly token) is actually being wired in — same "concrete first" sequencing already used for this engine.

**People:** Oliver = business/PM, non-technical, tests everything himself in the browser and reports real bugs he finds — treat his bug reports as ground truth. Seth (Auu) = Oliver's brother, developer on the separate Track 1 app; not currently building Track 2, may review it later.

---


## Done so far (2026-08-08)

- Next.js + TypeScript scaffold (App Router, Tailwind, ESLint) — dropped
  next/font/google (blocked by the sandbox's network policy), uses system fonts
- Database: SQLite via Drizzle ORM (Prisma dropped earlier for the same reason)
- Full schema in `db/schema.ts` — 23 tables
- `db/seed.ts` — sample data: three-pool tip structure, roster visibility
  settings, 4 online platforms (Grubhub/UberEats/DoorDash/HungryPanda)
- **Core tip-pool calculation engine** (`lib/calc/tipPool.ts`, `lib/calc/flatWage.ts`)
  — Pool 1 (dine-in), Pool 2 (takeout + platform-courier), Pool 3 (delivery,
  equal split). Exact-cent reconciliation.
- **Roster visibility engine** (`lib/roster/visibility.ts`) — STAFF/MANAGER/ADMIN
  roles, category-scoped visibility, leadership pay hard-hidden from staff.
- **Real, saved daily workflow** — the actual point of this round of work:
  - **`/shifts`** — list of all shifts with status (draft/finalized)
  - **`/shifts/new`** — create a shift (date + Lunch/Dinner), redirects into its roster
  - **`/shifts/[id]/roster`** — add/remove people on the shift's roster (employee +
    position + optional point override), persisted to `ShiftRosterEntry`
  - **`/shifts/[id]/closing-report`** — enter the day's sales: total sales, CC tip
    total, takeout/delivery CC tip subsets, cash sales, food/beverage split, PLUS
    per-platform online sales (sales amount, commission, tip split by who
    delivered — platform courier vs. restaurant's own driver). "Save (draft)"
    persists without locking; "Save & Finalize" persists AND locks.
  - **"Save & Finalize"** — runs the real tip-pool + flat-wage calculation
    (`lib/calc/finalizeShift.ts`, new pure function, unit tested) against
    whatever's on the roster and in the closing report, writes it as a locked
    snapshot into `TipPoolCalculation` + `EmployeePayout`, and marks the shift
    `finalized`. Chosen deliberately over recompute-on-view — a closing report
    is a historical record and shouldn't silently change later if settings
    change (confirmed with Oliver 2026-08-08).
  - **`/shifts/[id]/summary`** — read-only Summary Report for a finalized shift:
    sales totals, pool-by-pool tip breakdown, and a per-employee payout table
    (point value used, tip pool share, flat wage, total), pulling only from
    the locked snapshot, never recalculating live.
  - Once a shift is finalized, its roster and closing-report pages show a
    locked banner and stop accepting edits (server actions reject writes to
    a finalized shift).
- **`/shifts/[id]`** (unchanged) — the original playground calculator: plain
  styling on purpose, editable point values, manual financial inputs, runs
  the same tested engine live in the browser. Kept as a separate "what-if"
  tool, NOT wired to the saved roster/closing-report/summary flow above.
- **26 unit tests total, all passing** (`npm test`)
- Verified the saved flow end-to-end against the real DB (not just unit
  tests): created a shift, added a mixed roster (Pool 1 + Pool 2 + NONE-pool
  staff), entered sales + online platform tips, ran Save & Finalize, and
  confirmed the rendered Summary Report's dollar figures match the computed
  result exactly (e.g. Erika — who spans Pool 1 and Pool 2 as Host — showed
  $339.44 total on both the computation output and the page).

## Fixed (2026-08-08, later same day) — Host double-entry bug + point override timing

Oliver caught a real bug while testing: Host was modeled as two separate
Position rows ("Host" for Pool 1, "Host (Takeout/Online)" for Pool 2)
sharing one employee — if a manager only added the Pool 1 row to a shift's
roster, that person silently lost their Pool 2 tip share with no warning.

- **`Position` ↔ tip pool is now many-to-many** (`db/schema.ts`'s new
  `positionTipPools` table), not a single fixed value per position. Host is
  now ONE position belonging to both Pool 1 and Pool 2 — one roster entry
  covers both, nothing to forget. Deliberately kept open-ended rather than
  hard-coding "Server = Pool 1 only" as a rule, since other restaurants
  buying this app may run their floor differently.
- **Point value overrides moved from the Roster page to the Closing Report
  page.** Oliver's reasoning: a point bump is a closing-time judgment call
  ("they upsold a ton today"), not a staffing decision made when building
  the roster hours earlier. The roster page now only handles who's working;
  the closing-report page has a "Tip points" section, editable right up
  until Save.
- Playground calculator, `finalizeShift.ts`, and `loadRosterForCalc.ts` all
  updated for pool membership being an array now (`tipPoolGroups`) instead
  of a single value. Core `tipPool.ts` math untouched — it never cared how
  many roster rows a person came from, just their pooled point value.
- 27 tests total, all passing. Re-verified end-to-end against the real DB.

TEST_STOP_HERE_2