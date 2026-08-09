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

## Pool split method is now a per-restaurant setting (2026-08-08, later same day)

Oliver asked whether it'd be fair for restaurants to choose point-weighted
vs. equal split per pool (some restaurants want skill/seniority reflected,
others want pools to reinforce "everyone's equal" and avoid friction). Built
it as a real setting, not a hardcoded rule:

- `RestaurantSettings.pool1SplitMethod` / `pool2SplitMethod` / `pool3SplitMethod`,
  each `POINT_WEIGHTED` or `EQUAL_SPLIT`. Defaults match prior behavior
  exactly (Pool 1 & 2 point-weighted, Pool 3 equal) — nothing changes for
  Youk Thai unless someone flips a setting.
- `lib/calc/tipPool.ts` generalized: `PoolRosterEntry[]` + a split-method
  parameter for all three pools (previously Pool 3 only ever took a bare
  `employeeId[]` with no point data at all — fixed that too, since it would
  have silently ignored the new setting otherwise).
- `finalizeShift.ts` and the closing-report save flow read the setting from
  `RestaurantSettings` at finalize time and pass it through.
- Playground calculator (`/shifts/[id]`) got three dropdowns to flip each
  pool's split method live and see the effect — point-value inputs
  grey out for any pool currently set to equal split.
- Verified directly against the DB: gave two employees very different point
  values (2.0 vs 0.1) with Pool 1 set to EQUAL_SPLIT, confirmed their shares
  came out identical despite the point gap, confirmed the default
  (POINT_WEIGHTED) still produces the expected unequal split.
- 30 tests total, all passing.

**Explicitly NOT done (deferred to backlog, confirmed with Oliver):** making
the tip pools themselves — how many exist, who's a member, and what dollar
figures fund each one — restaurant-configurable. Oliver raised this as a
real concern (other restaurants may need more/different pools, e.g. tipping
out to BOH, a bar-specific pool, no delivery pool at all). Only the pool
count/membership rules/funding formulas are still hardcoded to Youk Thai's
three pools; only the split METHOD within those three is now configurable.
Revisit once there's a second real restaurant's requirements to design
against instead of guessing — see the schema memory for the full reasoning.

## Closing report error handling fixed (2026-08-08, later same day)

Oliver hit this testing Pool 1/2: entered Takeout Tip = 20 but left Total CC
Tip blank/0, which correctly failed validation — but the error would have
shown as Next.js's generic/technical error page on the real Save flow, not
a helpful inline message (the playground calculator already had a nicer
error box; the real closing-report Save button didn't).

- Validation messages in `tipPool.ts` rewritten to be specific and
  actionable, with the actual numbers included (e.g. now says "Takeout tip
  ($20) plus delivery tip ($0) adds up to more than the Total CC Tip you
  entered ($0)... make sure you filled in Total CC Tip").
- `saveClosingReportSales` / `saveClosingReportAndFinalize` converted to
  React's `useActionState` pattern — they now catch errors and return
  `{ error }` instead of throwing uncaught. `redirect()` is deliberately
  called AFTER the try/catch (not inside it) since it works by throwing a
  special internal signal that must not be swallowed by our own catch.
- Closing report page split into a thin Server Component (`page.tsx`, loads
  data) + a new Client Component (`ClosingReportForm.tsx`, holds the form +
  `useActionState` + a red error banner matching the playground's style).
- Verified directly: called the action with Oliver's exact bad input
  (Takeout=20, Total CC Tip blank), confirmed it returns a friendly message
  instead of throwing, confirmed the shift stays in `draft` status (not
  silently finalized on a failed save).
- 30 tests still passing (no calc logic changed, only error messages/wiring).

## Preview-before-finalize safety step added (2026-08-08, later same day)

Oliver flagged this looking at his own test Summary Report: "Save & Finalize"
locked a shift immediately with no chance to review, so a data-entry mistake
would get permanently baked into a locked payroll record with no UI path to
undo it. Split the flow into three explicit steps:

- **Closing Report** — "Save (draft)" persists without locking (unchanged);
  the second button is now **"Save & Preview"** instead of finalizing
  directly.
- **Preview** (`/shifts/[id]/preview`, new) — computes the real payout live
  from whatever's currently saved, using the exact same calc engine as the
  real finalize step, but writes NOTHING to the database. Shows the same
  breakdown as the Summary Report. Go back to Closing Report, change
  anything, come back — it just recomputes fresh each time. Also where the
  same friendly validation errors show up now (e.g. "Takeout tip + delivery
  tip is more than Total CC Tip") if the numbers aren't ready yet.
- **Confirm & Finalize** — a separate explicit button on the Preview page.
  Only this step writes the locked snapshot and marks the shift finalized.
  Recomputes fresh from the database at the moment it's clicked (not from
  whatever the browser had cached), so it's always accurate.

Implementation: extracted the "gather inputs + compute" half of finalizing
into a shared `lib/shift/computeFinalizationPreview.ts`, used by both the
Preview page (compute only) and the real finalize action (compute + write).
Removed a small piece of now-dead duplicate code in the process.

Verified directly against the DB: after Save & Preview, confirmed zero
`TipPoolCalculation`/`EmployeePayout` rows exist and the shift is still
`draft`; computed the preview and noted the numbers; then ran Confirm &
Finalize and confirmed the shift became `finalized` with exactly 1
calculation row + 8 payout rows, and the locked totals matched the preview
exactly. 30 tests still passing (calc engine itself didn't change).

## Host drink bonus wired into the persisted flow (2026-08-09) — first real use of the Metrics engine

Closed the gap noted below (kept for history) — this was the first concrete
slice of the "generic Metrics + Incentive Rules engine" (schema existed
since the original Track 2 design, zero logic/UI until now). Deliberately
used only the engine's storage layer (`MetricDefinition`, `MetricValue`)
plus a small new `positionMetrics` join table, not the full
`IncentiveRule`/conditions/targets/weights evaluator — the reward math
(drink count × $/drink, pulled off Pool 1's top, capped by the pool itself)
was already correct and tested in `tipPool.ts`'s `HostDrinkBonusEntry`
mechanism; re-deriving it generically added risk without adding value yet.
Full rule evaluation stays deferred until a second bonus scenario (BOH
sales-split, Manager weekly token) is actually being built — see the START
HERE section's deferred list.

- **`positionMetrics`** (new table): which positions are eligible to have a
  given EMPLOYEE_SHIFT metric collected — e.g. Host ↔ `host_qualifying_drink_count`.
  Generic on purpose: a future bonus metric just needs new rows here, not
  new closing-report page code. Also replaced a `positionName.startsWith("Host")`
  hack that lived in the playground calculator (`CalculatorForm.tsx`) — both
  the real closing report and the playground now read eligibility from the
  same source.
- **`RestaurantSettings.hostDrinkBonusPerDrinkAmount`** (new, default 0,
  Youk Thai seeded to $1.00) — restaurant-configurable $/drink rate.
- **Closing Report** gets a new "Bonus metrics" section — generic loop over
  enabled EMPLOYEE_SHIFT metrics × eligible roster rows (today just Host's
  drink count; a future metric grows this section automatically). Saves
  into the existing `metricValues` table, same upsert pattern as the
  existing "Tip points" section.
- **`finalizeShift.ts`** no longer passes a hardcoded empty `hostDrinkBonus`
  array — `computeFinalizationPreview.ts` now resolves it from saved
  `metricValues` × the per-drink rate. `FinalizeEmployeePayout` gained
  `hostUpsellTipShare` (reusing an existing-but-previously-unused
  `EmployeePayout` column name — unrelated to the older, still-dead
  `HostUpsellTipRecord` table, which stores dollar amounts not a drink
  count and remains unused tech debt from before this round).
- **Preview + Summary Report** both render the bonus now: a "Host drink
  bonus (pulled off Pool 1 top)" line when nonzero, and a per-employee
  "Drink bonus" column in the payout table.
- 32 tests total (was 30) — two new tests: the bonus flowing through
  end-to-end additively (host gets their normal Pool 1 share PLUS the flat
  bonus, not either/or), and a bonus larger than the pool throwing the
  existing friendly error instead of silently clamping.
- Verified directly against the real DB: saved a drink count for Erika via
  the same code path the closing-report form uses, confirmed the Preview
  page computes the bonus correctly with zero DB writes, then finalized and
  confirmed the locked `EmployeePayout`/`TipPoolCalculation` rows match
  exactly. Also verified `loadClosingReportData` only surfaces Host as
  eligible for the metric (not the whole roster).

**Original gap note, kept for history:** the host cocktail/mocktail drink
bonus (qualifying-drink-count × $/drink, pulled off the top of Pool 1)
existed in `lib/calc/tipPool.ts` and the playground calculator, but wasn't
captured anywhere in the persisted closing-report flow — `finalizeShift`
always passed an empty bonus list. No schema field held "qualifying drink
count" for a real saved shift. Resolved above.

## How to run

**First time only:**
```
npm run setup     # installs dependencies + creates db/atlas.db + loads sample data
npm run dev       # starts the app — open /shifts
```

**After that, day to day:** just `npm run dev` again. It keeps running and
hot-reloads as files change — you do NOT need to redo install/db:push/db:seed
every time. Only re-run `npm run setup` if this doc (or I) tells you the
schema or sample data changed, or if you want to reset the sample data back
to its starting point (safe to run repeatedly now — resets ids too).

```
npm test          # runs all calculation + permission tests, anytime
```

## Not started yet

- Editing master data through the UI (employees, positions, wage rates — all still seed-only)
- Full Incentive Rules evaluation engine (conditions/targets/weights/reward dispatch) — host drink bonus (above) uses the engine's storage tables directly with hardcoded reward logic, not a generic evaluator yet
- Auth (systemRole field exists on Employee, no actual login system yet)
- Deploy to Vercel
- Validation against real Youk Thai numbers (`2026 - R.xlsx` not yet provided)
