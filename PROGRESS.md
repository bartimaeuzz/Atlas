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

## Corrected: host drink bonus is ONE shared count for the team, not per-host (2026-08-10)

Oliver tested the version above himself and caught a real modeling error:
it captured a drink count **per individual host**, but the actual business
rule is one shared count for the whole host team's waiting-area drink
sales, split **equally** among whoever worked Host that shift — not
individually self-reported. Two hosts on one shift should split one pooled
number, not each report their own.

- **`host_qualifying_drink_count` metric changed from EMPLOYEE_SHIFT to
  SHIFT scope** — one `MetricValue` row per shift (`employeeId: null`), not
  one per host. `positionMetrics` still defines who's in the "host team"
  that splits it, just reinterpreted (membership, not per-person input
  eligibility).
- **`tipPool.ts`'s `HostDrinkBonusEntry[]` (per-employee count) replaced
  with `HostDrinkBonusInput`** — one `{ qualifyingDrinkCount, perDrinkAmount,
  recipientEmployeeIds }`. The dollar total is still pulled off Pool 1's
  top exactly as before; the split among `recipientEmployeeIds` is always
  **equal** (reuses the existing exact-cent `splitByPointsExact` helper),
  regardless of Pool 1's own split-method setting — this bonus is
  deliberately never point-weighted.
- **Closing Report** UI changed from a per-host table to ONE shared number
  input (only shown if at least one Host is staffed). `loadClosingReportData`
  now distinguishes SHIFT-scope metrics (one input) from EMPLOYEE_SHIFT-scope
  metrics (one input per eligible person, still supported generically for a
  future metric that's genuinely per-person). Form field naming split into
  `metric_shift_<id>` vs `metric_emp_<id>_<employeeId>` so the two cases
  can never be mixed up by the save action's parser.
- Also flipped `total_sales`'s `MetricDefinition` row to `enabled: false` —
  it was a vestigial seed-data placeholder from the original schema design,
  never actually wired to anything (the real total sales figure is
  `ShiftSales.totalSales`, entered via the Sales section). Left enabled it
  would have started showing up as a confusing duplicate input once the
  generic SHIFT-metric UI went live.
- 34 tests total (was 32) — rewrote the host-bonus tests for the new shape,
  added a dedicated test proving equal split across 3 people with uneven
  point values (2.0/0.1/1.0) still divides the bonus within a cent of
  equal, and a `finalizeShift` test with two hosts (1.0 and 0.5 point
  values) splitting one shared count 50/50 despite their unequal Pool 1
  point values.
- Verified directly against the real DB, reproducing Oliver's exact test
  case: staffed Erika AND Alesso as Host on one shift, saved a single
  shared count of 5 drinks, confirmed both Preview and the finalized
  Summary Report show $2.50 each (not $5 each, not one person getting all
  of it).

## Wage adjustments — override + extra pay for shift-coverage situations (2026-08-10)

Oliver's real scenario (not multi-role staffing, which he confirmed doesn't
happen at Youk Thai): Erika works as Host but is asked to cover Aey's
Bartender role mid-shift after Aey calls in sick. She should keep her
Host-side tip pool share and drink bonus (both already worked correctly —
see the "false alarm" investigation below), but her **wage** needs
restaurant-level flexibility, since only one roster row's wage auto-counts
per person per shift.

Oliver's explicit spec: two separate optional fields per employee, both
shown as distinct lines in the finalized report, never merged into
"Flat wage":

- **Override** — replaces the auto-resolved wage entirely when set (e.g.
  swap Erika's Host rate for the Bartender coverage rate).
- **Extra pay** — always additive on top of whichever wage applies (auto or
  overridden), for ad hoc bonuses/adjustments that aren't a wage swap.

Implementation:

- New `shiftWageAdjustments` table: `shiftId`, `employeeId`,
  `wageOverrideAmount` (nullable — null means "use auto-resolved"),
  `extraPayAmount` (defaults to 0), `reason` (optional free-text note).
  Unique on `(shiftId, employeeId)` — one adjustment per person per shift.
- `employeePayouts` gained an `extraPayAmount` column (mirrors the existing
  `hostUpsellTipShare` pattern — a previously-nonexistent additive line,
  now a first-class snapshot column).
- `finalizeShift.ts`: `FinalizeShiftInput.wageAdjustments: Record<employeeId,
  WageAdjustment>`. Resolution order per employee: auto-resolved wage from
  the wage-bearing roster row, then `overrideAmount ?? autoResolvedWage`,
  then `extraPayAmount` always added on top. `totalCorePayout` = tip pool
  share + (override or auto wage) + host drink bonus share + extra pay.
- `loadClosingReportData.ts` returns `wageAdjustmentRows` — one row per
  unique employee on the roster, showing their auto-resolved wage for
  reference alongside editable override/extra-pay/reason fields.
- Closing Report UI: new "Wage adjustments" section, one row per employee,
  optional override amount + optional extra pay + optional reason. Save
  action parses `wageOverride_<employeeId>`, `extraPay_<employeeId>`,
  `wageReason_<employeeId>` fields and upserts into `shiftWageAdjustments`.
- Preview and Summary Report pages both render "Extra pay" as its own
  column, separate from "Flat wage" and "Tip pool share" — matches the
  house style established for the host drink bonus column.
- 36 tests total (was 34) — added two `finalizeShift` tests: one proving
  override replaces the auto wage while extra pay stays additive on top
  (with an untouched coworker in the same shift as a control), one proving
  extra pay alone (no override) adds on top of the normal auto-resolved
  wage.
- Verified directly against the real DB: staffed Erika as Host, entered a
  $70 override (replacing her $55 auto Host wage) plus $15 extra pay with
  a reason note, confirmed the closing-report loader reflects it, computed
  a live Preview showing flatWageAmount=$70 and extraPayAmount=$15
  separately, finalized (wrote `tipPoolCalculations` + `employeePayouts`),
  and confirmed the Summary Report loader (`loadSummaryData`) shows both
  fields correctly and separately — not merged, not lost.

Also worth recording since it's what prompted this feature: Oliver reported
what looked like a data-loss bug (adding Papi as Line Cook then again as
Host appeared to silently overwrite the Line Cook row). Investigated
directly against the real DB — confirmed no overwrite; all roster rows
persist. The Preview/Summary payout table correctly consolidates one
person's multiple roster rows into a single paycheck line (by design, one
payout per person), which just wasn't visually legible as "all your roles
are combined here." Multi-role staffing itself already works correctly
(tip share sums across all pool-eligible rows, host bonus eligibility
checks all of a person's rows) — wage was the only genuine gap, which this
feature closes.

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

## Position admin UI (2026-08-10) — first master-data editing UI, no more seed-file surgery for positions

Backlog item Oliver flagged earlier ("Position admin UI... be reminded about this later") — this round built it. Also closes the loop on a question Oliver asked directly: "if wage rates aren't on this page, where does someone go for a raise?" Answer, and the actual design split used:

- **FOH wage (`positionShiftRates`) is a property of the POSITION** — one
  shared Lunch/Dinner rate for everyone who works it. Belongs naturally on
  the Position page, so it's included this round: raise the whole
  position's rate in one place, applies to whoever's rostered next.
- **BOH wage (`employeeWageRates`) is a property of the EMPLOYEE**, not the
  position — a raise for one specific line cook can't be expressed at the
  Position level at all. Still no UI for this; flagged as the very next
  piece of master-data UI to build (Employee admin), not attempted this
  round to keep this one shippable.

What shipped:
- `positions.active` column (boolean, default true) — retire, never hard
  delete, matching the existing `employees.active` pattern. A retired
  position stays fully valid for every historical shift that already
  references it (roster entries, wage rates, tip pool calcs untouched); it
  just stops being offered when staffing a NEW shift's roster
  (`loadRosterPageData`'s `allPositions` query now filters `active: true`).
- `/positions` — list page, all positions (active + retired, retired shown
  greyed out), with pool membership and FOH rate shown inline.
- `/positions/new` and `/positions/[id]/edit` — shared `PositionForm`
  client component: name, category (FOH/BOH radio), tip pool membership
  (checkboxes for Pool 1/2/3), the two visibility flags
  (`alwaysVisibleInRoster`, `earningsHiddenFromStaff`), default tip point
  value, and — only shown when category is FOH — Lunch/Dinner flat rate
  inputs. Retire/Reactivate is a plain button (no form), calls
  `togglePositionActive` directly via `useTransition`.
- `lib/actions/positions.ts` — `createPosition`/`updatePosition` follow
  the same `(prevState, formData) => {error}` + "redirect() outside the
  try/catch" pattern as the shift actions, including a duplicate-name
  check. Pool membership + FOH rates are synced via delete-then-reinsert
  on the child tables (`positionTipPools`, `positionShiftRates`) — simple
  and safe since nothing has a foreign key pointing INTO those two tables.
- No new unit tests added — this is straightforward CRUD/wiring code, not
  pure calculation logic, matching this project's existing testing
  convention (`__tests__` dirs exist only under `lib/calc` and
  `lib/roster`, reserved for pure functions and the privacy-sensitive
  visibility logic). Verified instead with a direct-DB script exercising
  the full loop: create a position with pool membership + rates → confirm
  both list and edit loaders return it correctly → simulate a raise
  (Dinner rate 60→70) → retire it → confirm it disappears from
  `loadRosterPageData`'s roster dropdown while the seeded/existing Host
  position stays untouched → reactivate → confirm it reappears. 36 tests
  still passing (unchanged), full build clean.

## Restaurant Settings page + configurable roster category visibility + multi-role UX polish (2026-08-10)

Two things Oliver caught testing the Position admin UI himself:

**1. Roster category visibility was hardcoded, not restaurant-configurable.**
`lib/roster/visibility.ts` always restricted STAFF to their own category
(FOH sees FOH, BOH sees BOH) — unlike the peer-earnings-money layer, which
already was restaurant-configurable. Fixed: two new independent settings,
`rosterRestrictFOHToOwnCategory` / `rosterRestrictBOHToOwnCategory`, both
defaulting to `true` (today's behavior, nothing changes for Youk Thai
unless flipped). `getVisibleRosterEntries` now applies the category filter
conditionally per viewer's own category. Note: this module still isn't
wired into any live page (no staff login/self-serve view exists yet — see
Employee admin below), so the setting has no visible effect today; the
design is just correct now for whenever that view ships. 38 tests total
(was 36) — two new tests cover the flag off (opens the roster to the other
category) and independence between the two flags.

**Also surfaced: restaurantSettings had ZERO ui at all.** Every field on
that table (`ccTipDeductionRate`, the peer-earnings flags, all three pool
split methods, the host drink bonus rate) was seed-only — same class of
gap Position admin closed for positions. Rather than build a settings page
for just the two new visibility flags and leave the rest stranded, built
one `/settings` page covering the whole table in this pass:
`lib/settings/loadRestaurantSettings.ts`, `lib/actions/settings.ts`
(`updateRestaurantSettings`, same server-action error pattern as
everywhere else), `app/settings/page.tsx` + `SettingsForm.tsx`. Linked
from both the root page and the Shifts list header.

**2. Multi-role roster stress test — Aey as both Bartender (FOH) and Sous
Chef (BOH), no warning shown.** Confirmed via AskUserQuestion: a
confirmation prompt + a visual badge, not a hard block or an admin policy
setting. Reasoning: the wage-adjustments round already proved multi-role
payout math is correct (tip shares sum across pool-eligible rows, wage
auto-resolves with an override available), and Oliver himself said other
restaurants may genuinely use multi-role even though Youk Thai doesn't
day-to-day — building a block/allow policy now would be solving a problem
nobody's actually hit, the same trap this project has deliberately avoided
elsewhere (e.g. the pool-funding-engine deferral). Shipped: the roster
page's "Add someone" form is now a client component
(`AddRosterEntryForm.tsx`) that checks — client-side, against the roster
already loaded on the page, no extra round trip — whether the selected
employee already has an entry this shift, and if so shows a
`window.confirm()` naming their existing role(s) before submitting.
Cancel aborts the add. Separately, the roster table now shows a small "N
roles" badge next to anyone with more than one entry, so multi-role
staffing is legible on the Roster page itself without needing to check
Preview — directly closes the legibility gap from the earlier Papi
false-alarm.

Verified end-to-end against the real DB: flipped
`rosterRestrictBOHToOwnCategory` off and confirmed `getVisibleRosterEntries`
actually responds to the persisted setting (not just the pure-function
unit tests); staffed Aey as both Bartender and Sous Chef and confirmed the
roster loader returns exactly the two rows + role count the badge and
confirm-dialog logic need. 38 tests passing, build clean.

## Persistent nav bar + missing back-links filled in (2026-08-10)

Oliver asked directly: several pages (New Shift, New/Edit Position,
Settings, the playground calculator) had no way back except editing the
URL bar by hand, and there was no way to see "where am I" while navigating
into a shift. Root cause: navigation had been added ad hoc, per page, as
each page shipped — no shared layout-level nav ever existed.

Fixed with a persistent top nav bar in the root layout (`app/NavBar.tsx`),
so it shows on every page without needing to touch each page individually:
Atlas (home) / Shifts / Positions / Settings, with the current section
highlighted (`usePathname`). This alone fixes the "stuck on a page" problem
everywhere at once. Also added the specific contextual back-links that were
missing: `/shifts/new` and the playground calculator (`/shifts/[id]`) now
have "← All shifts"; `/positions/new` and `/positions/[id]/edit` now have
"← Positions". No unit tests (pure navigation UI, not logic); verified by
building, seeding, running the real dev server, and curling every affected
route to confirm the nav bar and each new back-link actually render.

## Employee admin UI (2026-08-10) — the per-employee BOH wage raise finally has a home

Closes the gap named at the end of the Position admin round: FOH wage
lives on the Position page (shared rate), but BOH wage is per-employee and
had nowhere to go. Mirrors Position admin's shape: `/employees` list +
`/employees/new` + `/employees/[id]/edit`, shared `EmployeeForm`. Fields:
name, active (retire/reactivate, never hard-delete — same pattern as
positions), hire date, system role, primary position, and a per-position
checklist (assign + standing tip point value; BOH-assigned positions also
get Lunch/Dinner wage rate inputs, shown conditionally). Primary position
must be one of the assigned positions — validated server-side.
`lib/actions/employees.ts` syncs `employeePositions` + `employeeWageRates`
via delete-then-reinsert, same pattern as Position admin's child tables.

**Caught a real pre-existing data-loss trap while verifying against the
real DB, before shipping:** two seeded BOH employees (Bomb, Papi) had
`employeeWageRates` history and a `primaryPositionId` but no matching
`employeePositions` row — a latent gap from when that table was originally
scoped "FOH only" (see its schema comment from 2026-08-08). Left alone,
opening either of their Edit pages would render "Primary position: — none
—" (the option wouldn't even be offered in the select) and hitting Save
would silently wipe their wage rate — exactly the kind of trap this
project has been careful to test for. Fixed two ways: `loadEmployeesList`
/ `loadEmployeeForEdit` now defensively backfill — a `primaryPositionId`
is always treated as assigned even without a real join-table row yet
(synthesized with the position's default tip point value), so the form
renders correctly and saving for real creates the missing row, closing
the gap permanently for that employee. Also fixed `db/seed.ts` directly so
fresh reseeds start consistent. This class of bug (defaulted/synthesized
form state silently overwriting real data on save) is worth remembering
as a recurring risk anywhere a form's initial state is assembled from
more than one table — verify the round trip, not just the read.

No new unit tests (CRUD, not pure calc logic — same convention as Position
admin). 38 tests still passing. Verified end-to-end against the real DB:
created an employee with an FOH position (tip point value) and a BOH
position (wage rate), staffed them on the real dinner shift, confirmed the
calc engine picked up their wage — then simulated a raise and confirmed
the SAME shift recomputed with the new amount (the actual point of this
feature). Separately reproduced the Papi trap by deleting his
`employeePositions` row back out, confirmed the defensive backfill kept
his wage rate visible and correct, and confirmed a simulated no-op Save
no longer wipes it.

## Cash tip field + per-pool tip columns + Total tip column (2026-08-10)

Oliver flagged two real gaps while testing Employee admin: no way to enter
cash tips at all, and the payout table only showed one combined "Tip pool
share" figure with no way to see per-pool detail or a clean tip-only
subtotal. Confirmed both via AskUserQuestion before touching money math.

**Cash tip:** `ShiftSales.cashTip` (new column) — entered manually by the
floor manager at close, pooled into Pool 1 exactly like CC tips but
WITHOUT the deduction (no card-processing fee on cash). `tipPool.ts`'s
`calculateTwoPoolTips` now takes `cashTip` as a Pool 1 input, added to the
deducted CC portion before the host drink bonus is pulled off the top
(`netPool1BeforeHostBonus = netDineInCcTip + cashTip`) — so a cash tip
correctly reduces what's available for the drink bonus check too, same as
the CC portion always did. New Closing Report field, new playground
calculator field, new "Cash tip" line in Preview/Summary's Tip pools box
(only shown when nonzero).

**Per-pool + total tip columns:** `calculateTwoPoolTips` already computed
`pool1.shareByEmployee` / `pool2.shareByEmployee` / `pool3.shareByEmployee`
separately internally — `finalizeShift.ts` was just summing them into one
`tipPoolShare` before this round, discarding the breakdown. Now tracked
separately as `pool1Share`/`pool2Share`/`pool3Share` on
`FinalizeEmployeePayout` (`tipPoolShare` kept as their sum, for anything
that only needs the total), plus a new `totalTip` field
(`tipPoolShare + hostUpsellTipShare` — every dollar that's a TIP, distinct
from wage). `employeePayouts` gained matching snapshot columns. Preview +
Summary payout tables now show Pool 1/Pool 2/Pool 3 as separate columns
(dashed out when zero, to avoid a wall of zeros for single-pool staff) AND
a bolded "Total tip" column — Oliver explicitly asked for both, not one or
the other.

6 new tests (42 total, was 38): cash tip pools into Pool 1 without
deduction, cash tip can't be negative, host drink bonus correctly pulls
off the top including the cash tip portion, and a finalizeShift test
proving pool1Share/pool2Share/pool3Share sum to tipPoolShare and totalTip
includes the drink bonus (using Host's real dual-pool membership as the
test case). Verified end-to-end against the real DB: set a $75 cash tip
on the seeded dinner shift, confirmed it flows undeducted through Preview,
finalize, and the Summary Report, and confirmed every payout row's pool
shares sum correctly to its total.

## Roster "Add someone" position dropdown now reflects Employee admin assignments (2026-08-10)

Oliver's other observation testing the roster: the Position dropdown
showed every position flat, with no connection to what we'd just built in
Employee admin (which positions a person is actually set up to work). New
`loadEmployeeAssignedPositionIds()` in `lib/employees/loadEmployeesList.ts`
returns an employeeId -> assigned positionId[] lookup, reusing the same
defensive primaryPositionId backfill built for Employee admin (so someone
like Papi, whose real `employeePositions` row may still be missing on an
older DB, correctly shows their primary position as assigned). Threaded
through `loadRosterPageData.ts` into a new `employeeAssignedPositionIds`
field.

`AddRosterEntryForm.tsx`'s Employee select is now controlled; the Position
select re-groups live as the employee selection changes — assigned
positions in an "Assigned to this person" group, everyone else in an
"Other positions" group with greyed-out (but still fully selectable) text.
Deliberately NOT a hard restriction — same flexibility reasoning as the
duplicate-add confirm dialog shipped earlier this project: a restaurant
may genuinely need someone to cover a position they're not formally set
up for, so this only nudges, never blocks. If an employee has no
assignments at all yet (brand new, never touched in Employee admin), the
dropdown falls back to a flat unstyled list rather than showing everything
greyed out, which would look broken.

No new unit tests (pure UI wiring off already-tested loader logic).
Verified against the real DB: Erika's lookup correctly shows only Host
(her seeded position), Papi's lookup correctly shows Line Cook via the
primaryPositionId backfill, and every active employee has an entry in the
lookup (even if empty).

## Incentive Rules engine — first real evaluation shipped (2026-08-10)

Oliver's 4-point feedback round also asked for the previously-deferred
generic Incentive Rules engine to finally be built out, scoped to one
concrete test case: "if total sale hit $10,000 BOH should get $20 flat
rate incentive... for test sake, real rule incentive amount should be
flexible and each individual BOH staff would probably get different
incentive amount." Confirmed via AskUserQuestion: flat rate for ALL BOH
first (not per-employee weighting), SHIFT-period only — same "concrete
first, generalize once a second real pattern emerges" sequencing already
used for the host drink bonus and the pool-funding-engine deferral.

The full schema (incentiveRules, incentiveRuleConditions,
incentiveRuleTargets, employeeRuleWeights, incentivePayoutRecords) was
already designed back on 2026-08-08 — this round wrote the evaluator.
New `lib/calc/incentiveRules.ts` (pure, DB-free, 14 unit tests) —
`evaluateShiftIncentiveRules(rules, shiftMetrics, roster)` — deliberately
scoped this round to: evaluationPeriod=SHIFT, rewardType=FLAT,
distributionMethod=PER_TARGET_FLAT, targets of type CATEGORY/POSITION/
EMPLOYEE, condition operators >=/>/<=/</between. A rule using anything
outside that scope (WEEK/MONTH period, PERCENT_OF_METRIC, ADJUST_TIP_POINT,
WEIGHTED_POOL) is silently skipped, not an error — same "skip what's out
of scope" approach used elsewhere. A rule with zero conditions never fires
(treated as unconfigured, not "always true").

Wired into `computeFinalizationPreview.ts`: loads enabled rules +
conditions + targets from the DB, builds a `shiftMetrics` map (currently
just `total_sales`, read directly off `ShiftSales.totalSales`, not the
vestigial disabled `metric_definitions` row of the same key), evaluates
against the roster's position category, and folds the result into
`finalizeShift.ts`'s existing per-employee payout row as a new
`incentiveAmount` field — additive on top of tip share/wage/extra pay,
same house style as `extraPayAmount`/`hostUpsellTipShare`. `employeePayouts`
gained an `incentiveAmount` column (snapshot). `runFinalize` (in
`lib/actions/shift.ts`) also writes one `incentivePayoutRecords` row per
(rule, employee) that actually fired — the audit trail table designed on
2026-08-08 finally has its first real writer, capturing which rule fired,
for how much, and a `metricSnapshot` of what it saw.

Preview and Summary Report both gained an "Incentive" column (between
Extra pay and Total). Summary's footnote updated to reflect what's
actually wired in now vs. still deferred (Manager/Floor Manager weekly
commission — needs per-employee weighting + WEEK-period evaluation, not
built yet).

Seeded the test rule itself: "BOH $10k Sales Bonus (test)" — SHIFT period,
FLAT $20, PER_TARGET_FLAT, condition `total_sales >= 10000`, target
CATEGORY:BOH. The seeded dinner shift's totalSales (4200) is well under
the threshold, so a fresh reseed correctly shows NO bonus out of the box —
bump Total Sales to $10,000+ on the closing report to see it fire for
every BOH person on that shift's roster (Chef, Line Cook in the seeded
data).

57 tests passing (was 42). Verified against the real DB: below $10k → zero
incentive for everyone; at exactly $10k → $20 each for Bomb (Chef) and
Papi (Line Cook), $0 for FOH staff, `totalCorePayout` correctly includes
it; and separately verified the actual finalize WRITE path — both the
`employeePayouts.incentiveAmount` snapshot column and the
`incentivePayoutRecords` audit-trail rows are written correctly with the
right rule id, amount, and metric snapshot.

## Staff self-service login + "My Pay" view (2026-08-10)

First staff-facing feature in the app — everything before this round was
manager-facing only. Closes out the long-standing "Earnings Summary"
backlog item and finally puts `lib/roster/visibility.ts` (designed and
unit-tested back on 2026-08-08) to real use — it had never been wired
into a live page until now.

**Login mechanism — a judgment call made without Oliver in the loop**
(he asked for a bigger overnight build and stepped away, explicitly
inviting this): PIN-based login, not email/password. Reasoning: this is a
shared restaurant terminal, not a personal device — whoever's on shift
picks their name from a list and enters a short PIN, the same pattern
POS/scheduling terminals commonly use. No new dependency needed (PINs are
hashed with Node's built-in `scrypt`, not bcrypt). **If this isn't the
login style Oliver actually wanted, it's a contained, swappable piece —
only `lib/auth/pin.ts`, the `pinHash` column, and the login form would
need to change, nothing downstream cares HOW the session got created.**

**Explicit scope boundary:** this round protects ONLY the two new pages
(`/login`, `/me`). Every existing manager-facing page (`/shifts`,
`/employees`, `/positions`, `/settings`) remains open/unauthenticated,
exactly as before. Gating the whole manager app behind a login is a
separate, bigger decision, deliberately not made unprompted.

**What shipped:**
- `employees.pinHash` (nullable — null means that person can't log in yet)
  and a new `staffSessions` table (random token in an httpOnly cookie,
  looked up server-side, 14-hour expiry — roughly a shift length, not a
  "remember forever" session).
- `lib/auth/pin.ts` — `hashPin`/`verifyPin`, scrypt + salt, 5 unit tests.
- `lib/auth/session.ts` — `createSession`/`resolveSessionToken`/
  `getCurrentStaffSession` (the last one is the one pages actually call —
  reads the cookie for the current request).
- `lib/actions/auth.ts` — `login` (useActionState, same error-inline
  pattern as every other form in this app) and `logout`.
- `/login` — pick your name from a dropdown of active employees, enter
  your PIN. Already-signed-in visitors get bounced straight to `/me`.
- Employee admin gained a "Staff login PIN" section (`SetPinForm.tsx` +
  `setEmployeePin` action) — deliberately a SEPARATE form from the main
  employee edit form, not one more field on it, so a routine profile edit
  can't accidentally wipe someone's PIN.
- `lib/staff/loadMyEarnings.ts` — the first real caller of
  `getVisibleRosterEntries`. For a given employee: every finalized shift
  they have a locked payout for (their own numbers always shown in full),
  plus a "who else worked this shift" list correctly filtered by the
  restaurant's visibility settings (FOH/BOH category restriction, peer-
  earnings show/hide, manager sees everything).
- `/me` — "My Pay" page. Lifetime total across all finalized shifts up
  top, then a card per shift: full personal breakdown (pool shares, drink
  bonus, wage, extra pay, incentive, total) plus the visibility-filtered
  coworker list.
- NavBar split into a server wrapper (`NavBar.tsx`, resolves the session
  cookie) + `NavBarClient.tsx` (the existing interactive nav, now also
  showing "My Pay"/name/Sign out when logged in, or "Staff Login" when
  not) — needed because a client component can't read an httpOnly cookie
  directly.
- Seed: every seeded employee gets a test PIN of "1234" (clearly commented
  as seed-only, never a runtime fallback) so a fresh reseed is immediately
  testable — try signing in as Erika, Bomb, or Papi.

**Side effect worth knowing about:** because the NavBar now reads the
session cookie on every request, pages that were previously statically
prerendered (the shift list, employee list, etc.) are now all
server-rendered on demand instead. Not a bug — cookie-dependent content
can't be statically cached — just a real change in the build output
(`npm run build`'s route table now shows every route as `ƒ Dynamic`,
where several used to show `○ Static`). No noticeable difference to how
the app feels to use at this scale.

62 tests passing (was 57). Verified against the real DB: PIN accept/reject,
session create+resolve, and — the actual point of this feature — three
different viewers seeing three different things on the SAME finalized
shift: a FOH staff member (Erika) sees only her FOH coworkers, not the two
BOH people at all; a BOH staff member (Papi) sees only BOH coworkers, and
even then his coworker's (Bomb's) dollar figures are hidden per the
default peer-earnings setting while his own numbers are always shown; the
shift's MANAGER (Bomb) sees the entire roster with full money on every row.

## Point value on My Pay + week/month grouping + comprehensive seed rewrite (2026-08-10)

Oliver tested the staff login round himself and came back with 5 concrete
points, plus his real live Position/Employee admin screens as reference
data:

1. My Pay didn't show the point value that actually determined a payout —
   fixed, each shift card now shows it with a one-line explanation of what
   it means.
2. My Pay needed week/month grouping with a filter, "so employee can keep
   track their income easily for financial product purposes."
3. Seed data needed to cover a full 7-day week so that grouping is
   actually testable.
4. Seed data needed every shift fully staffed already, so Oliver stops
   manually rebuilding the roster by hand every time a schema change
   forces a reseed.
5. He gave exact numbers for BOH (`$100 Lunch / $200 Dinner`, explicit
   placeholder "for now") and pointed at his own live Position/Employee
   admin screens as the real position list and FOH wage rates to use.

**What this surfaced, unprompted:** Oliver's live dev database had 19
employees and 17 positions he'd built up by hand across previous testing
sessions — none of which existed in the old, much smaller seed script.
Every time a schema change forced `npm run db:seed`, he'd been silently
losing that and rebuilding it from scratch. Fixed at the root: the seed
script's baseline team is now HIS actual 19-person roster and 17
positions (FOH flat rates and tip pool membership copied directly from
his live Position admin), not a small illustrative sample — so a reseed
now regenerates something close to what he already had, instead of
wiping it down to almost nothing.

**Shared finalize-write helper extracted first** (`lib/shift/finalizeShiftWrites.ts`) —
seeding 14 shifts as fully finalized needed the exact same write logic
`runFinalize` already had (TipPoolCalculation, EmployeePayout rows,
IncentivePayoutRecord audit rows, status flip). Pulled out once so both
call sites share it instead of drifting.

**Seed now builds a full week**: Mon 2026-08-03 through Sun 2026-08-09,
Lunch + Dinner each (14 shifts total), all 19 employees rostered at their
PRIMARY position on every shift — maximizes test coverage per Oliver's
"all positions filled" ask, at the cost of NOT modeling realistic
day-to-day scheduling variance (nobody has a day off in this seed — noted
as a known, deliberate simplification). Manager/Operator/Packer stay
unstaffed on every shift, matching Oliver's actual live data (no
employee's primary position is any of the three) — same "it's fine for a
position to exist with nobody in it yet" precedent as the original
Delivery Guy placeholder. Sales figures vary by day and deliberately cross
the $10k incentive threshold on Friday and Saturday dinner only, so the
BOH bonus visibly fires on 2 of the 14 shifts and not the other 12 — a
live demonstration of the incentive engine baked right into the seed, no
manual number-editing needed to see it work.

**My Pay UI**: new `app/me/MyEarningsView.tsx` (client component) groups
the flat shift list by week or by calendar month (toggle button, defaults
to Week), sub-grouped by day within each period, with a subtotal at every
level (week/month, day, and the existing per-shift total). No new date
library — the grouping math (find the most recent Monday, bucket by
`YYYY-MM`) is simple enough to write directly, and dates are parsed
pinned to UTC noon specifically to dodge the classic "date string parses
as the previous day in a negative-UTC-offset timezone" bug.

62 tests still passing (no new unit tests this round — the new seed data
and grouping UI are both verified against the real DB/rendering, not
appropriate for the pure-function `__tests__` convention). Verified
against the real DB: Papi (BOH) has exactly 14 finalized shifts with the
$20 incentive firing on exactly the 2 days that crossed $10k and nowhere
else, his lifetime total matches a manual sum; Aey (systemRole MANAGER)
sees the full 19-person roster on every shift; Erika (FOH staff) never
sees any of the 5 BOH coworkers, confirming the category restriction
still holds against the much bigger roster; and all 7 seeded dates
correctly bucket into the single week starting Monday 2026-08-03.

**Backlog, not built this round:** CSV/PDF export of the week/month view
for actual "financial product" use (loan applications, proof-of-income
documents) — Oliver mentioned this as motivation but didn't ask for it
directly yet. The seed also only covers one week, so month view won't
show more than that single week until a future round extends the date
range — flagged as a known, easy-to-extend limitation, not a bug.

## Manager access tied to the position worked THAT SHIFT, not a fixed flag (2026-08-10)

Oliver caught a real modeling bug in the previous round's seed data by
looking at his own Employees screenshot: Nancy — whose PRIMARY position
literally IS Floor Manager — showed `systemRole: STAFF`, while Aey
(primary Bartender, Floor Manager just one of five cross-trained
positions) had been hardcoded `systemRole: MANAGER` in the seed rewrite.
His question — "credential to see all people wage and tip is bond with
roles or primary position?" — surfaced that the honest answer was
"neither, it's a totally separate hand-set flag," which is exactly why it
had drifted out of sync.

**Fix, not a patch:** `employees.systemRole` (STAFF/MANAGER/ADMIN) stays
for genuinely standing elevation (ADMIN — system ownership, independent
of any floor role). But regular manager-tier roster visibility is now
SHIFT-SCOPED, derived from whichever position an employee is actually
rostered at for that specific shift, via a new `positions.grantsManagerAccess`
flag (seeded true for Manager and Floor Manager — same two positions as
the existing `alwaysVisibleInRoster`/`earningsHiddenFromStaff` flags, kept
as a separate flag since it governs a conceptually different thing:
whether working this role grants YOU elevated viewing, not what happens
to YOUR OWN visibility/privacy).

`lib/staff/loadMyEarnings.ts` now computes an "effective role" per shift:
standing MANAGER/ADMIN always wins; otherwise, check whether the position
the employee is rostered at for THAT shift has `grantsManagerAccess` —
if so, they see everything for that shift only, same as a real manager
covering the floor for a day would. Their other shifts, worked at a
different position, are completely unaffected. Removed the seed's
hardcoded `systemRole: "MANAGER"` on Aey entirely — she doesn't need it
anymore; Nancy needed nothing added at all, since Floor Manager being her
primary position now correctly elevates her automatically, every shift,
with zero hand-maintained flag.

**Schema note:** adding a column to `positions` via `drizzle-kit push`
hit a `FOREIGN KEY constraint failed` this round — `positions` has many
incoming foreign keys (positionTipPools, positionShiftRates,
employeePositions, employeeWageRates, shiftRosterEntries, positionMetrics),
and drizzle-kit's SQLite push strategy for a heavily-referenced table
tries a table-rebuild that trips FK enforcement mid-migration. Worked
around by adding the column directly via a plain `ALTER TABLE ... ADD
COLUMN` with `PRAGMA foreign_keys = OFF` for that one statement, then
re-running `drizzle-kit push` afterward to confirm the schema was back in
sync (it was — "Changes applied" with zero data loss, verified via row
counts before/after). Worth remembering for any FUTURE column added to
`positions` specifically — plan for this same workaround.

**Coworker sort order (Oliver's second ask):** "Also worked this shift"
now sorts FOH before BOH, then position name (A–Z), then employee name
(A–Z) — implemented once in the loader (`compareCoworkerRows` in
`loadMyEarnings.ts`), applied before the visibility filter so every
consumer gets an already-sorted list.

62 tests still passing. Verified against the real DB: Nancy is
automatically elevated (sees all 19) despite `systemRole: STAFF`; Aey is
correctly RESTRICTED on her normal Bartender shifts (no BOH visible); a
one-off test shift where Aey was rostered as Floor Manager confirmed the
elevation is real for that shift without leaking into her other,
unrelated shifts; and the coworker list sort order (FOH-before-BOH, then
position, then name) holds for both a manager's full view and a
restricted staff view.

## Corrected: Aey's manager access is a standing partner flag, not shift-derived (2026-08-10, later same round)

The previous round's fix (above) removed Aey's hardcoded `systemRole:
MANAGER` on the theory that her elevated access should be derived purely
from which position she's rostered at each shift. Oliver corrected this
directly — in Thai, flagging a language barrier in the earlier English
exchange: Aey is one of the restaurant's PARTNERS, not just a
cross-trained staff member. She works actual shifts (often as Bartender)
but should see everything — including BOH wages — every single day,
regardless of which position she's covering that day.

**Fix:** restored `systemRole: "MANAGER"` on Aey's seed record. No code
change was needed in `lib/staff/loadMyEarnings.ts` — its "effective role"
computation already checks standing `systemRole` first and only falls
back to the shift-scoped `grantsManagerAccess` check if standing role is
plain STAFF, so simply restoring her seed value was sufficient.

**The two mechanisms now correctly represent two different real
situations, and both stay:**
- `employees.systemRole = MANAGER/ADMIN` — permanent, person-level
  elevation (Aey as partner, Oliver as owner/admin).
- `positions.grantsManagerAccess` — temporary, shift-level elevation for
  an ordinary staff member covering a Floor Manager/Manager shift for a
  day (the scenario the previous round's fix was actually built for, and
  still correctly handles).

Verified against the real DB post-reseed: Aey, rostered as Bartender
(her usual shift), sees all 19 coworkers including all 6 BOH staff and
their wage figures — confirms standing MANAGER role, not the shift-scoped
flag, is what's granting the access.

## Pastry Chef corrected from FOH to BOH (2026-08-10, same round)

Oliver caught a seed data mistake: "might be minor mistake from me but
Pastry Chef is BOH not FOH in seed data." The position had been seeded
with `category: "FOH"` and a `positionShiftRates` flat-rate row, which
doesn't match how BOH wages actually work in this app (per-employee
`employeeWageRates`, not a flat per-position rate).

**Fix:** changed `category` to `"BOH"`, removed its `positionShiftRates`
rows entirely, and added Chong (the Pastry Chef employee) to the seed's
BOH wage list at the same $100 Lunch / $200 Dinner placeholder as the
other five BOH staff. Verified: Pastry Chef now has zero
`positionShiftRates` rows and Chong has two `employeeWageRates` rows
(Lunch $100, Dinner $200), and shows up correctly in the BOH block of
both the Preview and Summary payout tables.

## Position column + consistent sort on Preview and Summary payout tables (2026-08-10, same round)

Oliver asked for "Payout by employee" (Preview + Summary Report) to show
each employee's position, sorted the same direction as My Pay's "Also
worked this shift" list, for consistency across the app.

**Fix:** added a shared `lib/shift/payoutSort.ts` helper
(`sortPayoutsForDisplay`) implementing the same FOH-before-BOH, then
position name, then employee name ordering already used in
`loadMyEarnings.ts`'s `compareCoworkerRows`. Both
`computeFinalizationPreview.ts` and `loadSummaryData.ts` now compute a
`positionByEmployeeId` map (via the same representative-row convention
used everywhere else for multi-role employees) and both the Preview page
and Summary Report page render a new "Position" column and sort through
the shared helper instead of their previous ad-hoc sorts (summary was
previously sorted by payout amount descending).

Verified against the real DB: Summary Report's 19-row payout table now
reads as one alphabetized FOH block (by position, then name) followed by
one alphabetized BOH block, ending with Pastry Chef (Chong) correctly in
the BOH block.

62 tests still passing, `tsc --noEmit` clean, production build clean.
No schema change this round (`grantsManagerAccess` column was already
added and pushed in the prior round) — only seed data and application
code changed, so this handoff needs a reseed but NOT another
`drizzle-kit push`.

## Not started yet

## drizzle-kit push abandoned for Turso — replaced with generate + migrate (2026-08-10)

While deploying, `drizzle-kit push --force` against a completely empty
Turso database reported "No changes detected" instead of creating any
of the 27 tables — a real, documented bug in how drizzle-kit's live
introspection talks to Turso's HTTP protocol (confirmed against a known
GitHub issue: Turso introspection can misreport an empty database).
Worked around it live by generating the schema as plain SQL
(`drizzle-kit generate`, which is local-only and unaffected — it never
connects to the target) and running each CREATE TABLE/INDEX statement
individually against Turso's SQL console. Also discovered mid-repair
that pasting the ENTIRE multi-statement script into that console
executes and reports success for the WHOLE batch but silently applies
NOTHING — another symptom of the same underlying transaction-handling
bug on Turso's HTTP protocol (matches a second known drizzle-kit/libSQL
GitHub issue about transactions breaking on Turso specifically).
Statement-by-statement execution is reliable; multi-statement is not.

**Root fix, not just a one-off patch:** rather than keep doing this by
hand for every future schema change, added `db/migrate.ts` using
Drizzle's own `migrate()` function (`drizzle-orm/libsql/migrator`)
instead of `drizzle-kit push`. This is a fundamentally different, more
robust mechanism — `push` does a live diff/introspection against the
target (the buggy part); `migrate()` just applies a fixed, ordered list
of already-generated SQL files and tracks which ones it's already run
in a `__drizzle_migrations` table on the target DB itself. No
introspection, no diffing, so it sidesteps this whole bug class. This is
also the mechanism Drizzle's own docs recommend for production —
`push` is explicitly meant for rapid local prototyping, not deploys.

New workflow for any FUTURE schema change: `npm run db:generate`
(writes a new SQL file to `db/migrations/`, purely local, safe) then
`npm run db:migrate` (applies only what's new, safe to re-run, works
against either the local file or Turso depending on `DATABASE_URL`).
`db:push` script kept in package.json for quick local-only prototyping
but should NOT be used against Turso going forward.

Verified independently of Oliver's Turso credentials: ran `db:migrate`
twice against a fresh throwaway local SQLite file — first run created
all 27 tables plus the tracking table (confirmed via direct row count),
second run correctly detected the migration was already applied and did
nothing (idempotent). 62 tests still passing, build clean.


## DB driver migrated from better-sqlite3 to libSQL (Turso-ready) (2026-08-10)

First step toward a real deployment (Oliver picked this over two other
options — Incentive Rules generalization, real-data validation — via
AskUserQuestion, explicitly to get off local-only SQLite so the app can
finally be a live URL instead of a git-bundle-handoff loop).

**Why this had to happen first:** the app ran on `better-sqlite3` against
a local file (`db/atlas.db`). That's fine for a dev sandbox but doesn't
work on Vercel — serverless functions don't have a persistent local
disk, and `better-sqlite3` needs a native binary matched to the deploy
target's OS/architecture, which breaks in serverless builds anyway. Turso
is a hosted, SQLite-compatible database (the `libSQL` fork) built
specifically for this — same SQL dialect, same Drizzle schema file,
reachable over the network from anywhere including Vercel.

**What changed:** `db/client.ts` now uses `@libsql/client` +
`drizzle-orm/libsql` instead of `better-sqlite3` +
`drizzle-orm/better-sqlite3`. Connection is env-var driven: with no
`DATABASE_URL` set it opens the same local file as before (`file:./db/atlas.db`,
override with `DATABASE_PATH`) — local dev is unchanged. Set
`DATABASE_URL` (a `libsql://...` URL) + `DATABASE_AUTH_TOKEN` and it
points at a hosted Turso database instead — no other code changes
needed anywhere in the app for that switch. `drizzle.config.ts` updated
to `dialect: "turso"` with the same env-var logic, so `drizzle-kit push`
works identically against either target. `better-sqlite3` uninstalled —
zero remaining references outside a couple of explanatory comments.

**Two real bugs caught by this migration, not hypothetical:**
1. `db/seed.ts`'s delete-then-recreate loop (`for (const t of tableNames)
   db.run(...)`) was never awaited. This silently worked under
   better-sqlite3 because that driver is synchronous under the hood —
   the loop blocked on each statement whether or not `await` was there.
   libSQL's driver is genuinely async; the same code fired all DELETEs
   without waiting, raced the inserts that followed, and produced
   `UNIQUE constraint failed` errors on reseed. Fixed by awaiting each
   iteration (order matters here — children before parents, so this had
   to stay sequential, not `Promise.all`). Audited the entire codebase
   for the same pattern (any un-awaited `db.run`/`db.insert`/etc.) —
   this was the only occurrence.
2. The module-level `PRAGMA foreign_keys = ON` (needed every session,
   same as it was under better-sqlite3) can't use top-level `await` —
   `db/client.ts` is `require()`-d synchronously by `tsx`-run scripts
   (seed, tests) via CommonJS, and Node throws `ERR_REQUIRE_ASYNC_MODULE`
   on an async module in that context. Used a fire-and-forget
   (`void client.execute(...)`) instead — safe in practice since it
   resolves before any real application query gets a chance to run.

**Verified thoroughly, not just unit tests:** 62 tests pass, `tsc
--noEmit` clean, `npm run build` clean, `npx drizzle-kit push --force`
reports "No changes detected" against the existing schema (confirms the
new dialect config reads the same DB correctly), `npm run db:seed`
completes cleanly end-to-end on the new driver, and — the real test — ran
an actual production build (`next build && next start`) and curled
`/shifts`, `/positions`, `/login` against the live server: all 200, and
the shifts page correctly rendered all 14 real seeded shifts with their
real dates/periods/status, proving the new driver works through Next's
actual server-rendering runtime, not just standalone scripts.

**Not done yet, this is prep only:** no Turso database exists yet — that
requires Oliver to create an account (Claude can't create accounts on
his behalf). No Vercel deployment yet either. Next: confirm with Oliver
how he wants deployment wired up (GitHub-connected continuous deploy vs.
one-off manual deploys) and walk him through the Turso account/env-var
setup.


## Shipped (2026-08-10) — disciplinary/correction deductions

Oliver's ask (originally backlogged same day, built same day once he
said "deduction"): the restaurant needs a way to deduct pay for
disciplinary issues (late to work, breaking restaurant property, etc.).
Since FOH/BOH wages are flat-rate per shift (not hourly), a deduction
can't come out of hours worked — it's a direct dollar amount taken off
that person's payout, its own line item, never netted silently into
another number. Confirmed via AskUserQuestion before building: (1)
visible to the disciplined employee + managers only, NEVER other
coworkers — same precedent as `extraPayAmount` never appearing on the
"Also worked this shift" list; (2) takes effect immediately when a Floor
Manager enters it, no separate approval step, same trust level as the
existing wage override/extra pay fields; (3) a one-off dollar amount per
shift only, no running/lifetime total for now (a broader "employee
performance/attendance stats dashboard" idea — lateness frequency, days
scheduled, shift-swap counts, for evaluation/year-end bonus — was saved
as backlog instead, see `project_atlas_future_features_backlog` in
memory).

**What shipped:**
- Extended the existing `shiftWageAdjustments` table (not a new table,
  per the original backlog note) with `deductionAmount` (real, default 0)
  and `deductionReason` (text, nullable) — same per-shift-per-employee row
  as the wage override/extra pay fields.
- `employeePayouts.deductionAmount` — same snapshot-column pattern as
  `extraPayAmount`/`incentiveAmount`.
- `lib/calc/finalizeShift.ts` — `deductionAmount` is subtracted in
  `totalCorePayout` as its own term (wage/override/extra pay/incentive
  amounts themselves are untouched), defaults to 0 via `?? 0` so every
  existing caller/test without a `deductionAmount` key keeps compiling
  and behaving exactly as before.
- New "Disciplinary deductions" fieldset on the Closing Report form
  (`deduction_<id>` + `deductionReason_<id>` inputs), wired through
  `upsertWageAdjustments` in `lib/actions/shift.ts` — negative amounts
  rejected same as the existing fields.
- New "Deduction" column (red, `-$X.XX`) on both the Preview page and the
  Summary Report's payout table, positioned between Incentive and Total.
- New "Deduction" row (red, only shown when > 0) in My Pay's own-payout
  block in `MyEarningsView.tsx` — deliberately NOT added to
  `MyEarningsCoworkerRow`, so it structurally cannot leak onto a
  coworker's row.
- Migration `db/migrations/0002_blue_hawkeye.sql` — three
  `ALTER TABLE ... ADD COLUMN` statements (`employee_payouts` +
  `shift_wage_adjustments` x2), generated via `drizzle-kit generate`.

**Verified:**
- 3 new unit tests in `lib/calc/__tests__/finalizeShift.test.ts`
  (deduction alone, deduction combined with override + extra pay,
  backward-compat default-to-0 when the field is omitted entirely) — all
  68 tests pass.
- `next build` succeeds, no TypeScript errors.
- Real-DB e2e script (`verify_deduction.ts`) run against the actual
  seeded data: set an $8.50 deduction on one employee's finalized
  payout → confirmed it appears correctly in that employee's OWN My Pay
  view AND in the manager-facing Summary Report row → confirmed a
  coworker viewing the same shift sees the disciplined employee's roster
  row (name/position/tip/wage) with NO `deductionAmount` field present at
  all, not even a zeroed-out one. All checks passed.

**Not yet run:** `npm run db:migrate` against the live Turso database —
Oliver needs to run this himself before pushing this code live (same
order-of-operations as every prior schema change: migrate Turso first,
then deploy code that expects the new columns).


## Backlog (2026-08-10) — per-column, per-viewer earnings visibility on My Pay

Oliver's ask, explicitly deferred ("don't need to do it right now... save
it as a backlog"): the current visibility settings
(`rosterShowPeerEarningsFOH`/`BOH`) are coarse — they hide/show tip share
and flat wage together, as one pair, per FOH/BOH category. He wants finer
admin control: separate toggles per financial COLUMN (Tip, Wage,
Incentive, Total) rather than one combined on/off, AND the ability for
an admin to decide "whoever sees whatever" — implying per-employee or
per-role granularity, not just per-category.

**Not scoped or designed yet** — needs a real conversation before
building, per usual: does "whoever sees whatever" mean per-employee
overrides (a real access-control table, more complex) or just more
columns added to the existing per-category toggle (simpler, consistent
with the current settings model)? Revisit when this becomes the actual
next request rather than guessing at the shape now.

**Note (2026-08-10, deployed round):** this per-column granularity is
still NOT built — see the separate, narrower feature shipped below
("coworker list visibility") which addresses a related-but-different ask
(hide the WHOLE coworker list, not fine-grained per-column control).

## Coworker list visibility on My Pay — FOH/BOH toggle (2026-08-10)

Oliver's ask, given after the Turso deployment went live and he was
poking around My Pay: he wants staff who log in to check their own pay to
optionally not see the "Also worked this shift" coworker list AT ALL —
not just have the $ figures hidden (already covered by
`rosterShowPeerEarningsFOH`/`BOH`), but the whole list of names/positions
suppressed, as a privacy safeguard for the future. Confirmed via
AskUserQuestion before building: (1) split FOH/BOH, mirroring the
existing `rosterRestrictFOHToOwnCategory`/`BOH` pattern rather than one
global toggle, and (2) a NEW, independent setting rather than repurposing
the existing peer-earnings checkboxes — so a restaurant could show the
list with earnings hidden, OR hide the list entirely even with earnings
on.

**What shipped:**
- `restaurantSettings.rosterShowCoworkerListFOH`/`BOH` (both default
  `true` — preserves today's behavior for Youk Thai until someone flips
  them in Settings).
- `lib/roster/visibility.ts`: new, EARLIER gate in
  `getVisibleRosterEntries` — keyed by the VIEWER's own category (same
  convention as the restrict-to-own-category setting). When off, every
  entry except the viewer's own is dropped before any of the existing
  restrict/earnings-redaction logic even runs. MANAGER/ADMIN are exempt,
  same as every other visibility rule in this file.
- No UI change needed in `MyEarningsView.tsx` — it already only renders
  the "Also worked this shift" section when `coworkers.length > 1`, so
  once the loader returns just the viewer's own row, the section
  disappears for free.
- Settings page: new fieldset "Roster — coworker list visibility (My
  Pay)" with the two checkboxes, right above the existing category
  visibility fieldset.
- Migration `db/migrations/0001_large_power_man.sql` — two
  `ALTER TABLE ... ADD COLUMN` statements, generated via
  `drizzle-kit generate` (never `push`, per [[feedback-drizzle-hosted-db-caution]]).

**Verified:**
- 3 new unit tests in `lib/roster/__tests__/visibility.test.ts` (off for
  FOH only, independence per category, MANAGER/ADMIN unaffected) — all 65
  tests pass.
- `db/migrate.ts` applied cleanly against a fresh throwaway local DB,
  confirmed both columns present via direct `PRAGMA table_info` query.
- Real-DB e2e script (`verify_coworker_list_setting.ts`) run against the
  actual seeded data: default state (Erika, FOH, sees 13 coworker rows on
  a shift) → flip `rosterShowCoworkerListFOH` off → Erika now sees ONLY
  her own row on every shift, her own totalCorePayout unchanged → Papi
  (BOH) unaffected, still sees BOH coworkers → Oliver (ADMIN) unaffected
  → flipped back to `true`, confirmed restored. All checks passed.
- `next build` succeeds, no TypeScript errors.

- Full Incentive Rules evaluation engine (conditions/targets/weights/reward dispatch) — host drink bonus (above) uses the engine's storage tables directly with hardcoded reward logic, not a generic evaluator yet
- Auth (systemRole field exists on Employee, no actual login system yet)
- Deploy to Vercel
- Validation against real Youk Thai numbers — **partially resolved 2026-08-10**, see below (Oliver provided a real monthly sales/tax export, `MARCH 2026.xlsx`, used to design and verify the sales/tax report feature). `2026 - R.xlsx` (the original closing-report DNA file, for tip/wage validation) still not provided.

## Sales tax fields + sales/tax export report (2026-08-10)

Oliver asked for a report export before doing anything else ("ก่อนจะ Export ได้
เราต้องมาคุยกันก่อนไหมว่าเราต้องการอะไรบ้าง?") — right call, since this
surfaced a real gap: Atlas never had a sales-tax field at all. Rather than
design blind, Oliver shared a real file: an email from Aey (the Youk Thai
manager) with the actual monthly report she sends — `MARCH 2026.xlsx` — a
Toast section (daily Net Sale/Tax/Total Sale/Cash/CC/CC Tips/Total Credit)
and one section per online platform (Grubhub/Uber/DoorDash/HungryPanda,
each with Net/Tax/Tips/Total).

**Real finding from reviewing that file, confirmed with Oliver using the
actual numbers:** the file's "CC" and "Total Credit" columns are SWAPPED
relative to their own labels. Proven directly: every single row satisfies
`labeled-"Total Credit" + "CC Tips" == labeled-"CC"` (checked across 4+
days, e.g. Mar 1: 23,528.60 + 4,188.24 = 27,716.84). This means the column
labeled "CC" is actually the total that hit the card terminal (sales +
tip combined), and the column labeled "Total Credit" is actually the
card-sales-only portion (no tip) — the opposite of what the labels say.
Confirmed with Oliver: the export uses CORRECT labels (`CC Sales`,
`Total Credit`), not a copy of the swapped original.

Also confirmed with Oliver: `shiftSales.totalSales` has ALWAYS meant Net
Sale (pre-tax) — nothing about its existing meaning changes, tax is
purely additive as a new field.

**What shipped:**
- `restaurantSettings.defaultSalesTaxRate` (seeded 0.08875 — NYC's
  combined rate, confirmed by checking Tax/NetSale ratio in the real
  file's data, comes out to exactly 0.08875 on every row). Editable on
  `/settings`.
- `shiftSales.salesTax` and `onlinePlatformSalesRecords.taxAmount` —
  both NULLABLE (same `null = not yet touched` convention as
  `shiftWageAdjustments.wageOverrideAmount`). `loadClosingReportData.ts`
  auto-suggests `base × defaultSalesTaxRate` when null, flagged via a new
  `salesTaxIsAuto`/`taxAmountIsAuto` boolean the UI uses to show "auto-
  calculated, edit if it differs." Once a manager saves the closing
  report (even unchanged), that number becomes the explicit, permanent
  figure for that shift — chose nullable specifically so a legitimate $0
  entry doesn't get silently overwritten by the auto-suggestion on next
  load.
- New `lib/reports/loadSalesTaxReport.ts` — rolls up FINALIZED shifts
  into daily rows grouped by calendar date (summing Lunch+Dinner, since
  Atlas's `shifts` table is per-meal-period but Toast/accounting report
  per day), computing `ccSalesOnly = totalSales - cashSales` and
  `totalCredit = ccSalesOnly + ccTipTotal` with the corrected semantics
  above. Same auto-fill-if-null fallback as the closing report, so a
  report over old/never-revisited shifts still shows a sane tax figure
  instead of $0.
- New `/reports` page — preset buttons (This week/month/year) + a custom
  date-range form, on-page Toast daily table + online-platform range
  totals, and an "Export .xlsx" link.
- New `app/reports/export/route.ts` (first Route Handler in this app —
  needed for the `Content-Disposition` header a server action can't set)
  + `lib/reports/buildSalesTaxWorkbook.ts` (new `exceljs` dependency) —
  generates a `.xlsx` laid out like the real MARCH 2026.xlsx (Toast
  section, then one 4-column block per platform side by side, then
  online sale/tax totals), correct labels, opens directly in Google
  Sheets via upload — Oliver's stated normal workflow, no Google API
  integration needed.
- Deliberate simplification vs. the original file: every platform gets
  the same 4 columns (Net/Tax/Tips/Total) — the original inconsistently
  omitted Tips for Uber, but Atlas tracks tips uniformly across every
  platform already, so there's no reason to omit it here.

**Verified:**
- Migration `db/migrations/0003_graceful_shooting_star.sql` (3 new
  columns across `online_platform_sales_records`, `restaurant_settings`,
  `shift_sales`).
- `verify_sales_tax.ts` — auto-suggestion formula matches expected
  (`totalSales × 0.08875`), flagged auto before any save, and an explicit
  save with a DELIBERATELY different number is preserved exactly and
  flagged non-auto on reload (never silently overwritten).
- `verify_sales_tax_report.ts` — real seeded data (14 finalized shifts,
  7 days) rolls up to exactly 7 daily rows; every day's `netSale + tax =
  totalSale` and `ccSalesOnly + ccTips = totalCredit`; daily rows sum
  exactly to the totals row; online platform totals sum correctly;
  `buildSalesTaxWorkbook` produces a real, correctly-laid-out `.xlsx`
  (spot-checked by reading it back with openpyxl).
- 68 unit tests still passing (tax is reporting-only, doesn't touch the
  calc engine, so nothing existing changed behavior).
- `next build` succeeds, no TypeScript errors.

**Not yet run:** `npm run db:migrate` against the live Turso database —
same order-of-operations as every prior schema change, Oliver migrates
Turso before pushing this code live.

## Post-deploy fixes: broken dark theme, live sales-tax calc, roster position default (2026-08-10)

Oliver tested the sales-tax + Reports round live (after migrating and
pushing it himself) and came back with three things.

**Dark theme was unusable.** Screenshot showed a half-black page — real
bug, not a design choice: `app/globals.css` still had create-next-app's
default `@media (prefers-color-scheme: dark)` block from day one, flipping
the body background to near-black whenever the browser/OS is in dark
mode. Every page in this app is built with hardcoded light-mode Tailwind
classes (`bg-white` cards, `text-neutral-500`, etc.) with zero `dark:`
variants anywhere, so the result was a broken half-dark page, not a real
dark theme. **Fix:** removed the dark-mode media query entirely, added
`color-scheme: light` to `:root` so native form controls (date pickers,
etc.) stay light too. Forces light mode always until a real dark theme is
deliberately designed (would touch every page — not attempted here).

**Sales tax didn't visibly auto-calculate.** The auto-suggestion was only
ever computed once, server-side, at page load (`loadClosingReportData.ts`)
— typing a new Total sales value did nothing to the Sales tax field until
a full reload, which looked broken even though the underlying formula was
correct. **Fix:** `ClosingReportForm.tsx`'s Total sales / Sales tax pair
(and each online platform's Sales amount / Sales tax pair, via new
`PlatformSalesRow` sub-component) are now live client state — Sales tax
recomputes as the sales figure changes, UNLESS the manager has directly
edited the Sales tax field themselves (tracked per-field, starts "already
touched" if a real explicit value was saved before, so reopening a
filled-in report never silently overwrites a prior manual correction).
`loadClosingReportData.ts`/`ClosingReportData` now also expose
`defaultSalesTaxRate` at the top level so the client component has the
rate to compute with.

**Roster "Add someone" — asked for the Position dropdown to default to
the picked employee's primary position** ("point at the primary position
so I don't need to select every time"). `loadRosterPageData.ts`'s
`allEmployees` now also returns `primaryPositionId`. `AddRosterEntryForm.tsx`
computes a sane default (primary position if active & assigned, else
first assigned, else first overall) and applies it via
`key={selectedEmployeeId}` + `defaultValue` on the Position `<select>` —
remounts fresh with the new default every time the employee changes,
while staying a normal, freely-editable dropdown afterward.

**Verified:** 68 unit tests still passing (none of this touches the calc
engine). `next build` clean. Ad hoc script confirmed
`loadRosterPageData` returns real `primaryPositionId` values against
seeded data and `loadClosingReportData.defaultSalesTaxRate` matches the
seeded 0.08875 (not kept as a permanent `verify_*.ts`, since it's a thin
plumbing check rather than a new business rule). No schema changes this
round — no migration needed, just commit + push.

## Sortable Employees list (2026-08-10)

Oliver: "a tiny touch wont hinder our work, can you add sorting to these
column?" — the Employees admin list had no way to reorder rows other
than the default (alphabetical by name from the loader).

Extracted the table out of `app/employees/page.tsx` into a new client
component, `EmployeesTable.tsx`, since sort state has to live in the
browser while the page itself stays a server component doing the actual
data load. Clicking a column header (Name, Primary position, Positions,
Role) sorts by it ascending, clicking again reverses to descending; a
▲/▼ indicator shows the active column and direction. Plain client-side
`useMemo` + `localeCompare` — the employee list is small (tens of rows,
not thousands) and this is a viewing convenience only, so a full
server-round-trip/URL-param sort wasn't worth the extra complexity.

Oliver later reported "Can you check it yourself? Nothing is happening"
after this shipped. Rather than assume the code was broken, used the
Claude-in-Chrome browser tool to personally load the live production
site and click the column headers — sorting worked correctly both
directions. Likely a stale-cache or click-location issue on Oliver's
end, not a code bug; reported back instead of re-patching working code.

**Verified:** no schema/logic changes, so no new unit tests were needed;
confirmed working directly against the live production site.

## Split peer-earnings visibility into independent Tip/Wage toggles (2026-08-10)

Backlog item picked up after confirming Phase 1 (Closing Report system +
roster + export report) was functionally complete. The "peer earnings"
setting on My Pay's coworker list was one combined FOH/BOH toggle that
hid or showed tip share AND flat wage together. Oliver confirmed scope
via two clarifying questions: keep the same FOH/BOH category-level
granularity (not per-employee — that's a bigger ACL change, not asked
for), and only split the Tip/Wage toggles that already exist (do NOT add
Incentive/Total to the coworker view — those aren't shown to coworkers
today and would need new plumbing beyond a toggle split).

`restaurantSettings` gained `rosterShowPeerWageFOH`/`BOH` (new columns,
same true/false default split the combined toggle already had, so
nothing changes for Youk Thai until someone flips Tip and Wage
independently). The existing `roster_show_peer_earnings_foh`/`boh` SQL
columns were REPURPOSED as Tip-only — same column, renamed only in
TypeScript (`rosterShowPeerTipFOH`/`BOH`) — so this half of the split
needed zero migration risk, just an ADD for the new Wage columns
(migration `0004_legal_shaman.sql`).

`lib/roster/visibility.ts`'s `getVisibleRosterEntries` now redacts
`tipShare` and `flatWage` independently instead of as one all-or-nothing
pair — a category can show tip share while hiding wage, or vice versa.
Settings page's "Roster — peer earnings visibility" fieldset now shows
four checkboxes (Tip FOH/BOH, Wage FOH/BOH) instead of two. My Pay's
"Also worked this shift" coworker rows render tip and wage independently
now (one, both, or neither, depending on the category's settings)
instead of assuming both were always shown together.

**Verified:** extended `visibility.test.ts` with tests specifically for
the independent split (tip shown/wage hidden, the reverse, and the
viewer's own row always showing both regardless of settings) — 71 unit
tests total, all passing. `next build` clean (compiled + typechecked;
this sandbox's outputs mount has a known FUSE quirk that blocks the
build's final write step, worked around by building a clean rsync'd
copy in the sandbox home directory instead — same class of limitation
already documented for `npm install`/git in the ui-design session
notes). Migration NOT yet applied to the production Turso DB — run
`npm run db:migrate` to apply, then `git push`.

## Schedule Planner — Phase 1 shipped: staffing targets + template assignments (2026-08-11)

First piece of a much larger feature Oliver and I designed across several
rounds of discussion, grounded in a real reference schedule from another
NYC Thai restaurant (Soothr LIC, shared as a screenshot). Full design
doc: `Atlas_Schedule_Planner_Schema_v1.md` (also saved to project
memory as `project_atlas_schedule_planner`). Building it in phases on
purpose — Oliver's own words: "คิด Schema ให้แตกก่อนที่จะเริ่มลงมือทำ"
(think the schema all the way through before starting to build).

**What Phase 1 is:** the foundation everything else sits on. Two new
tables, both purely additive (migration `0005`, no changes to any
existing table):

- `positionStaffingTargets` — "how many of this Position do we need,
  this day-of-week, this period?" Confirmed against the real Soothr
  sheet: the numbered position rows (Runner 1/2/3/4, Bar 1/2/3, Host
  1/2/3, etc.) are exactly this — a headcount target, not distinct job
  titles. New page `/schedule/targets`: an editable grid (Position rows
  × day-of-week columns, one grid per Lunch/Dinner), full-grid resync on
  save (same delete-then-reinsert pattern as `syncPositionChildRows` in
  `lib/actions/positions.ts`).
- `employeeScheduleTemplates` — "Employee X normally works Position Y,
  this day-of-week, this period," the recurring baseline a week's plan
  (a later phase) will be pre-filled from. Confirmed with Oliver: this
  is a deliberately FIXED baseline — it only changes when someone tells
  the Manager to (a resignation, a promotion, a sales-driven staffing
  need), not on an automatic weekly rebuild. New page
  `/schedule/templates`: add-assignment form (reuses the same
  employee-picks-defaults-position UX as the roster's "Add someone"
  form), list of active assignments, retire button (same
  retire-don't-delete convention as Positions/Employees).

**The RED flag, corrected mid-design:** first guess was that red meant
an open swap request — wrong. Oliver corrected it: red means a slot is
KNOWN to be vacating — resignation notice given (two weeks is Thai
restaurant custom) or a promotion/transfer to a different position.
Doubles as an internal "open shift, come talk to me" signal for other
staff and the Manager's own hiring/coverage tracker. Implemented as
`vacancyReason` (`RESIGNATION`/`PROMOTION`/`OTHER`) +
`vacancyStartsOn` on the template row — set via a "Mark vacating" inline
form on `/schedule/templates`, cleared via "Clear vacancy." Deliberately
does NOT cover approved LEAVE (a temporary absence shouldn't mutate the
permanent recurring pattern) — that's a separate `leaveRequests` table
in a later phase, cross-referenced at weekly-plan-build time instead.

**What's explicitly NOT built yet** (see the schema doc's "proposed
build order"): the actual weekly plan grid + publish + auto-seed into
`shifts`/`shiftRosterEntries`, the staff-facing "My Schedule" view,
leave requests + Manager request log, and the swap-request portal
(yellow/green states). Also backlog, not started: KPI/performance-linked
shift allocation, an AI ops dashboard, OpenTable/Resy integration, and a
training/"restaurant bible" archive with AI chat — all noted in memory,
none scoped.

**Verified:** all 71 existing unit tests still pass unchanged (nothing
in Phase 1 touches the calc engine or existing tables). `next build`
clean — compiled, typechecked, and generated all 21 routes including the
three new `/schedule*` pages with zero errors (again worked around the
sandbox's outputs-mount FUSE quirk on the build's own finalize step by
building a clean rsync'd copy in the sandbox home directory). No new
unit tests added — Phase 1 is straightforward CRUD with no new
calculation logic to unit-test, unlike e.g. `tipPool.ts`. Migration
`0005_numerous_major_mapleleaf.sql` NOT yet applied to the production
Turso DB — run `npm run db:migrate` to apply, then `git push`.

## Vacancy marking now scoped by reason (2026-08-11, same day)

Oliver spotted this testing on himself: he marked one of his template
rows (Monday Dinner Bartender) as resigning, but his other recurring
rows (Wed/Thu Lunch, Wed Dinner) didn't show the red warning at all.
Not a bug — the vacancy lookup was working exactly as scoped, just
scoped too narrowly. Confirmed with Oliver: "resigning" should mean
the person is leaving entirely, so it should flag every shift they
have, not just the one row clicked. That also raised a real second
case he asked about: what if an employee just wants to permanently
drop ONE recurring day (not resigning, not promoted)? That's exactly
what the existing `OTHER` reason is for — it just needed the scope
rule spelled out.

`setTemplateVacancy`/`clearTemplateVacancy` (`lib/actions/schedule.ts`)
now scope by reason instead of always touching just the clicked row:

- **RESIGNATION** — every active template row for that `employeeId`,
  any position/day/period.
- **PROMOTION** — every active row for that `employeeId` +
  `positionId` (other positions they hold stay untouched).
- **OTHER** — just the single row clicked. Relabeled in the UI as
  "Dropping this shift only" so the scope is obvious at the point of
  choosing, not just in a tooltip. This is the "employee asked to
  permanently drop this one recurring day" case.

Clearing a vacancy reads the row's CURRENT reason first and clears
using that same scope, so undoing a resignation clears every row it
flagged rather than leaving the others stuck red. `TemplatesTable.tsx`
now shows a one-line scope hint under the reason dropdown
("Flags every shift this person has..." etc.) so the behavior isn't a
surprise. No schema changes — this is entirely in the action layer;
`db/schema.ts`'s comment on `employeeScheduleTemplates` updated to
document the cascade rule for future reference.

Verified: all 71 tests pass, `next build` clean (23 routes, unchanged
— no new pages, just changed action/UI behavior).

## Correction: Preview reverted to fully read-only (2026-08-11, same day)

The "editable Manager view" change in the entry right below this one
was wrong — Oliver corrected it directly after testing: Preview must
never allow editing in either view, full stop. "Edit" needs to stay a
clearly separate, deliberate action, not something that happens by
accident while reviewing. Reverted `/schedule/plan/preview` to render
`WeeklyPlanGrid` with `readOnly` unconditionally true again (both
Manager and Staff views). To make the "how do I get back to editing"
problem this was originally trying to solve actually easy, replaced
the small top-left "← Back to edit" text link with a proper visible
button ("Edit this week →") next to the view toggle — same
destination (`/schedule/plan?week=...`), just impossible to miss this
time. No schema changes. All 71 tests pass, `next build` clean (23
routes, unchanged).

## Three follow-up fixes from live testing (2026-08-11)

Oliver tested the previous round live and reported three issues, all
fixed:

- **Vacancy ring wasn't showing.** `loadWeeklyPlan` compared
  `assignment.date < vacancy.startsOn` (strict less-than) to decide
  whether an assignment is in the grace period. Oliver had set
  `vacancyStartsOn` to the exact Monday the already-generated
  assignment fell on, so `date < startsOn` was false (equal, not
  less) and the ring never rendered — even though the assignment was
  still sitting right there on the grid. Changed to `<=`: an
  already-scheduled assignment now shows the warning through and
  including the vacancy date itself. (Doesn't affect
  `generateWeekFromTemplate`'s `date >= vacancyStartsOn` skip rule for
  *new* weeks — that's intentionally forward-looking and unchanged.)
- **Couldn't edit from the Preview page.** Manager view was rendered
  fully read-only, same as Staff view — meaning reviewing the preview
  and noticing a problem meant a round trip back to `/schedule/plan`
  to fix it, then back to Preview to re-check. Manager view is now
  fully editable (same quick-add/remove as the real grid, same
  warnings); Staff view stays read-only since it's meant to mirror
  exactly what employees will see, not a second editing surface.
- **Weeks list only linked to Preview for draft weeks.** Published
  weeks jumped straight to the editable grid with no preview option at
  all. Every planned week (draft or published) now shows both
  "Preview →" and "Edit →"; only "Not planned" weeks show a single
  "Plan this week →" action, since there's nothing to preview yet.

No schema changes. Verified: all 71 tests pass, `next build` clean (23
routes, same as before — these were all fixes to existing pages).

## Vacancy indicator, roster grid redesign, weeks list (2026-08-11)

Three more Oliver-requested additions on top of the preview/month/
person views. No schema changes.

- **Red vacancy-soon indicator on weekly plan pills:** when an
  assignment's employee is in the grace period before their template
  slot's vacancy date (resignation/promotion, set on
  `/schedule/templates`), their pill on `/schedule/plan` now gets a
  red ring + dot + tooltip ("Oliver is resigning as of 2026-08-12 —
  this slot will need a replacement"). `loadWeeklyPlan` now cross-
  references `employeeScheduleTemplates`' vacancy fields per
  assignment (`vacatingSoon`, keyed by employeeId+positionId+
  dayOfWeek+period, only set if the assignment's date is still before
  `vacancyStartsOn`). Deliberately shown in BOTH the manager grid and
  the staff preview view — unlike the other diagnostics (understaffed,
  double-booked), which stay manager-only — because red was designed
  from the start to double as an internal "open shift, come talk to
  me" signal staff should see too.
- **Roster page redesigned as a position grid:** `/shifts/[id]/roster`
  used to be a flat employee list plus a separate "Add someone" form
  below it. Now it's a Position-per-row grid (new `RosterGrid.tsx`),
  matching the Schedule Planner's visual language: each position shows
  who's assigned as pills, a "N/target" count against
  `positionStaffingTargets` for that exact day-of-week+period (red
  background if short), and an inline "+ Add" dropdown right in the
  row — the same last-minute, day-of adjustment surface as before, now
  laid out like the weekly grid it usually gets auto-seeded from.
  Carries over both guards the old form had: the multi-role confirm
  dialog (window.confirm before double-adding someone) and the
  assigned-vs-other position grouping in the picker. `loadRosterPageData`
  gained a `targets: Record<positionId, number>` field (resolved down
  to this shift's specific day+period) and sorts positions FOH-then-
  BOH to match. The old `AddRosterEntryForm.tsx` is superseded — see
  sandbox note below on why it's not actually gone from the filesystem.
- **New `/schedule/weeks` list page:** a flat, scannable list of weeks
  (12 at a time, prev/later navigation) each showing Published/Draft/
  Not planned, with a direct action link (View / Review & publish /
  Plan this week). Complements the month calendar rather than
  replacing it — faster to scan when you just want to know "what's
  left to publish" without reading day-level detail.

**Sandbox note:** this sandbox's FUSE-mounted outputs directory
wouldn't allow deleting `AddRosterEntryForm.tsx` even via `mv` out of
the directory (same class of EPERM issue as the recurring `.next`/git-
lock problems already documented below) — worked around by renaming it
to `AddRosterEntryForm.tsx.stale` in place and adding `*.stale` to
`.gitignore`, and excluding that pattern from the delivery zip's rsync
so it never actually reaches the real repo. If you ever see a stray
`.stale` file in a future handoff, it's dead code that safely deletes.

Verified: all 71 existing unit tests pass unchanged, `next build`
clean — 23 routes including `/schedule/weeks`.

## Schedule Planner: publish preview + month/person zoom views (2026-08-11)

Three more pieces on top of the shipped weekly plan grid, all requested
in one go by Oliver ("I want schedule preview before publishing" +
"can we see it as monthly as well... zoom out to oversee the future,
then zoom in to a week, and check each person's shifts"). No schema
changes for any of these — all three read existing tables in new
shapes.

- **Publish preview gate (`/schedule/plan/preview`):** the draft
  banner's Publish button now links here first instead of publishing
  directly. Two views, toggled by `?view=`: "Manager view" (read-only
  grid, keeps the red/orange warnings) and "Staff view" (same grid,
  warnings hidden — what employees will actually see once it's live).
  Both reuse `WeeklyPlanGrid` itself via new `readOnly`/`hideDiagnostics`
  props rather than a second component, so the preview can never drift
  from the real editable grid's data or layout. "Confirm & Publish"
  sits at the bottom of this page.
- **Month zoom-out (`/schedule/plan/month`):** a calendar covering the
  whole month, one cell per day, showing a shortfall count ("3 short" /
  "Covered") and a status dot (green=published, gray=draft,
  blue=projected). Key design call, confirmed with Oliver: most future
  weeks won't have been "Generated" yet, so showing only actual data
  would leave most of the month blank — not much of an "oversee the
  future" tool. Instead, weeks that don't exist yet are PROJECTED live
  from the recurring templates using the same rules
  `generateWeekFromTemplate` uses (now factored out into
  `lib/schedule/projectTemplate.ts`'s `projectAssignmentsForWeek`, a
  pure function shared by both the real generate action and this
  read-only projection, so they can't drift apart). Click any day to
  jump into that week's real grid.
- **Person zoom-in (`/schedule/plan/person`):** pick an employee, see
  their shifts across a month, calendar-style, same
  projected/draft/published blending as the month view. Built as
  reusable infrastructure on purpose — this is the same shape staff
  will want for their own "My Schedule" page later (a later phase),
  just pre-selected to the logged-in employee instead of a manager's
  pick.

All three link to each other and back to the weekly grid ("Zoom out to
month view" / "Zoom in to weekly view" / "View by person"), plus cards
on the `/schedule` landing page. Verified: all 71 existing unit tests
pass unchanged, `next build` clean — 22 routes including the three new
pages. No new unit tests (presentational + read-only query composition,
no new calculation logic); no real-DB smoke test possible from this
sandbox since it has no Turso credentials (only Oliver's machine does)
— relying on the build/typecheck pass plus careful review of the
query logic for this round.

## Weekly plan inline quick-add + staffing target stepper (2026-08-11)

Two related UI improvements Oliver asked for after using the shipped
Phase 2 grid live:

- **Inline quick-add on `/schedule/plan`:** every grid cell (not just
  under-target/red ones — confirmed with Oliver, he wants to be able
  to add extra people to already-full cells too) now has a small
  dropdown right in the cell, grouped "usually works this role" vs
  "other," calling the existing `addPlannedAssignment` action directly
  (same pattern as `GenerateWeekButton`/`PublishWeekButton` — a plain
  function call inside `startTransition`, not a `<form>`, since this
  lives inside a table cell). No more needing the separate form below
  the grid for the common case. The "extra coverage" (yellow)
  checkbox only appears once a name is picked, and is always a manual
  toggle — explicitly NOT auto-set based on whether the add pushes the
  cell over target. Oliver's reasoning: the app can't tell "covering a
  known gap" from "anticipating a busy day," and those mean different
  things to him, so he wants to say which one it is rather than have
  it guessed.
- **Staffing target stepper on `/schedule/targets`:** replaced the
  plain number input in each grid cell with a `[-] [count] [+]`
  control (Oliver's words: wanted it to feel like a "game UI" quantity
  picker). Purely presentational — still the same underlying
  `<input type="number" name="target_...">` under the hood, so the
  existing full-grid submit + server-side resync in
  `updateStaffingTargets` didn't need to change at all.

Presentational/UI-only, no schema or action changes. All 71 tests
pass, `next build` clean.

## Weekly plan: double-booking warning badge (2026-08-11, Oliver-reported)

Oliver spotted it live on the deployed `/schedule/plan` page (himself
listed as both Bartender and Busser on the same Monday Dinner slot) —
nothing in the schema stops a manager from assigning the same person
to two different positions in the same date+period, but a person
obviously can't work both at once. Not blocking it outright (a manager
might occasionally mean it, e.g. a genuinely dual-role person), just
surfacing it: `WeeklyPlanGrid.tsx` now computes, per employee per
date+period slot, every position they're assigned across the whole
grid, and renders a small orange "!" badge next to their name pill
when that's more than one, with a hover tooltip naming the conflicting
position(s). Pure client-side computed from data already loaded, no
schema/action changes. No new tests (presentational only); verified
via build + all 71 existing unit tests passing unchanged.

## Schedule Planner — Phase 2 shipped: weekly plan grid + publish + auto-seed (2026-08-11)

Second piece, built directly on top of Phase 1's staffing targets and
template assignments. Two new tables (migration `0006`, purely
additive):

- `scheduleWeeks` — one row per Monday-starting week, `status`
  (`draft`/`published`) + `publishedAt`. A week only exists once
  someone generates it.
- `plannedShiftAssignments` — the actual grid cells: employee ×
  position × date × period, `sourceType` (`FROM_TEMPLATE` vs
  `MANUAL_ADD`) and `isExtraCoverage` (the YELLOW flag — confirmed
  standalone from the RED vacancy flag, a manager marking a slot as
  extra headcount for an anticipated busy day, independent of the
  template).

**New page `/schedule/plan`:** week-nav (prev/next Monday), a
"Generate from template" button when that week hasn't been built yet
(seeds `plannedShiftAssignments` from active `employeeScheduleTemplates`
rows, skipping anyone not yet effective or already vacated by that
date), then a Position × Date grid per Lunch/Dinner — same visual
shape as the Staffing Targets grid on purpose. Cells under their
staffing target get a red-tinted background + "N/target" badge (an
at-a-glance short-staffed signal, distinct from the RED
vacancy-on-template flag — this is a live count-vs-target comparison,
not a stored flag). Manual add-to-slot form reuses the roster's
employee-picks-defaults-position UX, with an "Extra coverage" checkbox
for the YELLOW case. "Publish" button (confirm dialog) flips
`status` to `published` and stamps `publishedAt`.

**Auto-seed on publish:** once a week is published, creating a brand
new shift for a date inside that week (via the existing `createShift`
action) now automatically bulk-inserts `shiftRosterEntries` from the
matching `plannedShiftAssignments` — the "the plan becomes the actual
roster" behavior Oliver wants. Deliberately scoped to NEW shifts only;
reusing an existing draft shift is untouched, so the existing manual
"Add someone" flow still works for day-of fixes without fighting the
auto-seed.

**What's explicitly still not built:** staff-facing "My Schedule" view
on `/me`, leave requests + Manager request log, and the swap-request
portal (green state). All noted in the schema doc and memory, none
started.

**Verified:** all 71 existing unit tests still pass unchanged (no
calc-engine or existing-table changes). `next build` clean — compiled,
typechecked, and generated all 20 routes including the two new
`/schedule/plan` pages with zero errors (same rsync'd-copy workaround
for the outputs-mount FUSE build quirk). No new unit tests — like
Phase 1, this is CRUD + a straightforward seed/publish flow, no new
calculation logic. Migration `0006_minor_thunderbolt_ross.sql` NOT yet
applied to the production Turso DB — run `npm run db:migrate` to apply,
then `git push`.

## Template Assignments page redesign: Position -> person -> checkbox grid (2026-08-12)

Oliver asked for this one explicitly ("let's talk before you build") and
we discussed the design before any code: the old `/schedule/templates`
page was a flat list of every (employee, position, day, period) row plus
a one-slot-at-a-time add form. Slow to use — a position like Server
normally has 3+ people, each with their own multi-day pattern, so adding
each day/period as a separate form submission took many clicks, and the
growing flat list was hard to scan ("I really hate the long list").

New shape, confirmed with Oliver point by point before building:

1. **Layout** — Position rows first. Each position card shows who's
   currently assigned (name + their pattern, e.g. "Chui — Mon L, Wed D"),
   plus a dropdown of people ELIGIBLE for that position (same "assigned
   in Employee admin" list AddTemplateForm used to grey-in) to pick who
   to add or edit. Picking a name opens a Monday-Sunday x Lunch/Dinner
   checkbox grid for just that person in that position.
2. **Editing an existing person pre-checks their current pattern**
   (confirmed — not a blank grid every time). Saving diffs what's
   checked against what's stored: newly-checked boxes create (or
   reactivate a previously-retired) row, unchecked boxes retire that row
   immediately, no vacancy warning. This is also the new home for the
   "employee wants to drop just one recurring day" case from the
   previous entry below — no separate reason/UI needed for it anymore,
   just uncheck the box.
3. **effectiveFrom stays in the schema, not in this UI.** Oliver: hasn't
   used it yet with real data, unsure how it should work, doesn't want
   to design it blind — keep the column and the DB support, just don't
   expose a field for it right now so it's there to pick back up later.
   New rows created by the grid save with `effectiveFrom: null` (takes
   effect immediately), same as most existing rows already had.
4. **Kebab menu (⋮) per assigned person** replaces the old inline
   Mark-vacating/Retire buttons — opens a small popup with "Mark
   vacating…" (reason + start date, same red-flag mechanic as before),
   "Clear vacancy", and "Retire from this position" (immediate, no
   warning). Scope note: since the smallest unit this UI edits is now
   "this person, in this position" (not a single day/period row),
   PROMOTION and OTHER now share that same cascade scope in
   `setTemplateVacancy`/`clearTemplateVacancy` (every active row for
   that employeeId + positionId) — RESIGNATION is unchanged (every row
   for the employeeId, any position). They stay separate reasons for
   labeling purposes even though the blast radius is now identical.

New: `lib/schedule/loadTemplatesByPosition.ts` (position -> eligible
employees + assigned employees w/ pattern + vacancy status),
`lib/actions/schedule.ts`'s `syncEmployeePositionTemplate` (diff-and-sync
one employee+position pair's checked cells) and
`retireEmployeeFromPosition`, `app/schedule/templates/PositionTemplateGrid.tsx`
(all the new UI). Removed `createTemplateAssignment`/
`retireTemplateAssignment` (superseded, nothing else referenced them).
Retired `AddTemplateForm.tsx`, `TemplatesTable.tsx`,
`loadScheduleTemplates.ts` to `.stale` (sandbox can't hard-delete files —
see `.gitignore`'s note).

Verified: all 71 tests pass (no test coverage for this page — UI-only
change, same as before), `next build` clean, 27 routes unchanged.

## Manager auth — first cut (2026-08-14)

Zero auth existed on any manager page (`/shifts`, `/employees`,
`/positions`, `/settings`, `/reports`, `/schedule/**`) until now — a
real gap given Youk Thai (Aey's restaurant, opening October 2026) is
Atlas's actual upcoming deployment, not just a sandbox. Built fast
(inside a ~43-minute session budget), deliberately reusing the
existing staff PIN session system as-is rather than inventing a new
mechanism: `app/(protected)/layout.tsx` (a Next.js route group — the
`(protected)` segment is invisible in the URL, so every route keeps
its exact same path) calls `lib/auth/guard.ts`'s new `requireManager()`,
which calls the existing `getCurrentStaffSession()` and requires
standing `employees.systemRole` MANAGER or ADMIN, redirecting to
`/login` otherwise.

Known v1 gap, documented not hidden: does not consider the
shift-scoped `positions.grantsManagerAccess` elevation (someone
covering a manager shift without a standing MANAGER/ADMIN account),
only the standing role. Extend `requireManager()` if that case comes
up for real.

No schema change, no migration. All 71 tests pass unchanged (routing
change only), `next build` clean, all 27 routes resolve at the same
URLs as before.

## Staff-facing My Schedule + role-aware nav (2026-08-14, same day)

Oliver: "set non-manager to see only publish schedule in schedule
menu as 'my schedule' and 'my pay'" — direct follow-up to the manager
auth cut above, since the nav bar was still showing every STAFF
account the full manager item list even though clicking through now
bounces them to `/login`.

New `app/me/schedule/page.tsx` — reuses `loadEmployeeSchedule`
(already built reusable for exactly this per its own 2026-08-11 doc
comment: "same loader, just pre-selected to the logged-in employee
instead of a manager's pick"). Locked to the logged-in employee's own
id, no employeeId picker. Only renders shifts from PUBLISHED weeks —
draft/projected days render blank rather than leaking a manager's
still-editable plan.

`NavBar.tsx`/`NavBarClient.tsx` now role-aware: MANAGER/ADMIN
accounts see the full nav unchanged; STAFF accounts see just "My
Schedule" in the nav bar (My Pay was already a separate always-shown
link on the right, unchanged).

Verified: `loadEmployeeSchedule`'s own query already scopes both
`plannedShiftAssignments` and `employeeScheduleTemplates` by
`employeeId`, confirmed no cross-employee data leak before shipping
this to a staff-facing page. All 71 tests pass unchanged, `next
build` clean, `/me/schedule` resolves alongside the existing routes.

## My Schedule: Day off tile vs not-published-yet shading (2026-08-14, same day)

Follow-up from Oliver on the staff My Schedule view shipped earlier
today: "the day that they no schedule shows day off tile in published
week. and the week that not publish yet chang calendar a shade of
grey." Previously both states rendered as an identical blank cell,
which could read as "you're off" when it actually meant "not
published yet." Now: published + nothing scheduled -> a bordered
"Day off" tile; not published yet (draft/projected) -> the whole cell
shaded grey, no tile, with a legend explaining both states.
Presentational only, no loader change. All 71 tests pass, build clean.

## Danger zone: clear a draft day / delete a whole week (2026-08-14, same day)

Oliver: "i would like to be able to delete draft day and draft week
schedule and start over again." Clarified scope with him before
building (per standing never-assume rule) across three questions:
what "delete draft day" means (clear every assignment for one date,
whole week untouched), what "delete draft week" means (full reset --
delete the week row and all its assignments, back to "Not planned"),
and whether either should be allowed on an already-PUBLISHED week.
His answer to the third: "can do but need more badge alert what you
are going to do. with manager pin require."

Shipped as two new actions in `lib/actions/schedule.ts` --
`clearDay(weekId, date, pin)` and `deleteWeek(weekId, pin)` -- both
gated by a second, narrower PIN re-check (`verifyCurrentManagerPin`)
on top of the page-level `requireManager()` guard, so a manager has to
actively re-confirm their own identity for this specific destructive
action, not just have an active session. New `DangerZone.tsx` (a
collapsed `<details>` disclosure at the bottom of the Weekly Plan
page) shows a louder red warning banner when the week is published,
since staff may already be seeing it on My Schedule.

Verified FK delete order (assignments before the week row, matching
the `weekId -> scheduleWeeks.id` reference). No schema/migration
change, no new route. 71 tests pass unchanged, build clean. No new
unit tests -- consistent with this file's other CRUD actions
(`removePlannedAssignment`, `publishWeek`), which are likewise
untested; only the calc engine has unit coverage in this project.

## Danger zone v2: drop PIN, typed confirm word, required reason, change log (2026-08-14, same day)

Follow-up to the danger zone shipped earlier today. Oliver, after being
asked to think through a Floor-Manager-approval design (deferred to
backlog, see PROGRESS/memory note below): "let's save it to the
backlog for now... small restaurant might have one manager do a lot
of things and pin might not be the answer... but changelog is one
thing we should do... and the idea of long type 'i'm sure to nuke it'
phase kinda thing works to as a friction but not catching cheat."
Then, when asked to confirm dropping PIN for a typed word instead:
"drop the pin but make a log and also ask for a reason for delete
what is already published."

Shipped exactly that:
- `clearDay`/`deleteWeek` (`lib/actions/schedule.ts`) no longer check
  a PIN. Instead require typing the literal word CLEAR / DELETE
  (case-insensitive) to submit -- friction against a misclick,
  explicitly not meant to authenticate identity.
- A `reason` field is now REQUIRED only when the day/week being
  touched was already published; optional (omitted) for drafts, since
  nobody outside management has seen a draft yet.
- New table `schedule_change_log` (migration `0007_married_marauders.sql`,
  additive only, NOT yet applied to production Turso -- run
  `npm run db:migrate`) -- append-only record of every clear/delete:
  who, when, what was removed (JSON snapshot with readable names, not
  just ids), whether it was published, and the reason if given.
  Deliberately no FK from weekId to scheduleWeeks.id (a whole-week
  delete removes that row in the same breath the log entry is
  written -- a hard FK would cascade-delete the log too, defeating
  the point).
- New `lib/schedule/loadRecentScheduleChanges.ts` -- flattens the log
  down to just the entries affecting one employee, defaults to
  PUBLISHED-only (a caught-before-shipping bug: this filter originally
  lived only in the page component, so a future caller could have
  leaked draft changes to staff by forgetting to filter; moved into
  the loader itself with an `includeDraftChanges` opt-in instead).
- `/me/schedule` now has a "Recent changes to your schedule" section
  showing shifts removed after publish, with who/when/why.

**Verified:** direct-DB script (`verify_schedule_changelog.ts`,
deleted after use per project convention) against a freshly-migrated
throwaway SQLite file -- 6 checks: published clear logs + reaches the
staff view; draft clear logs raw but does NOT leak to staff (this one
failed on the first pass, caught the loader-vs-page filter bug above,
fixed, re-ran, passed); whole-week delete removes the week row while
the change-log row survives (no FK cascade); a whole-week delete
correctly surfaces every affected shift (not just one) to the staff
view. All 71 existing unit tests pass unchanged, `next build` clean.

## Fix: danger zone crashed to a blank error page instead of showing a message (2026-08-14, same day)

Oliver hit "This page couldn't load / A server error occurred" right
after using "Delete this week" on the live deployed app. Root cause,
almost certainly: v35 shipped a new `schedule_change_log` table via
migration `0007`, and the delete action writes to it -- if
`npm run db:migrate` hadn't been run yet on the production Turso DB
before testing, that insert fails with "no such table," and neither
`clearDay` nor `deleteWeek` had a try/catch around their body, so the
thrown error crashed straight to Next.js's generic error screen
instead of showing anything useful.

Fixed defensively regardless of the exact cause: both actions are now
wrapped in try/catch (matching `addPlannedAssignment`'s existing
pattern elsewhere in this same file), returning `{ error: message }`
into the form instead of throwing uncaught. Any future failure here
(missing table, a dropped connection, anything) now shows an inline
message instead of taking down the whole page.

Also addressed Oliver's explicit UX ask -- "it should direct back to
weekly view": `deleteWeek` now calls `redirect(`/schedule/plan?week=...`)`
after a successful delete (same pattern as login/logout in
lib/actions/auth.ts), rather than relying on the implicit client
refresh a plain useActionState return triggers. Deliberately placed
OUTSIDE the try/catch, since `redirect()` throws internally by design
and must never be swallowed by the new error handling.

**Before testing this again: run `npm run db:migrate` first if you
haven't.** All 71 tests pass, `next build` clean.

## Better error diagnostics + delete-week redirect target fixed (2026-08-14, same day)

Two follow-ups after the crash fix above. First, Oliver's next attempt
surfaced a caught-but-unhelpful error (`Failed query: insert into
"schedule_change_log"...` with no actual reason) -- a known lossy-detail
pattern with `@libsql/client` over Turso's HTTP protocol, where `.message`
alone omits the real cause. `describeScheduleActionError()` now also
pulls `.code` and `.cause`. Also delivered `verify_schedule_change_log_table.ts`
in the repo root for Oliver to run himself against his own production DB
(introspects the table via `PRAGMA table_info`, attempts a test insert
with full error detail, cleans up after itself) -- Claude has no
production DB access and must not have any.

Second, Oliver asked to change the post-delete redirect target: "let's
change redirect page after delete from weekly plan to weeks page."
`deleteWeek` now calls `redirect("/schedule/weeks")` instead of
redirecting back to the just-deleted week's own (now-empty) plan page.

## Change-log gap closed + published-week edit gate + My Schedule reorder (2026-08-14, same day)

Three fixes from Oliver's live-testing follow-up, after he confirmed via
screenshot that the change-log feature itself was working correctly on
Nancy's My Schedule:

1. **My Schedule reorder**: "Recent changes to your schedule" moved above
   the calendar, with a "No changes to schedule" empty state instead of
   the section just disappearing when there's nothing to show.

2. **Logging gap**: "why i manually delete schedule of nancy on tuesday
   but no log sent to nancy" -- diagnosed as the ordinary grid "x" remove
   button (`removePlannedAssignment`) predating the whole change-log
   system and never being wired into it, unlike the newer bulk
   `clearDay`/`deleteWeek` danger-zone actions. Fixed: `removePlannedAssignment`
   now fetches the assignment before deleting it and, if its week is
   already published, writes a `REMOVED_ASSIGNMENT` log entry
   automatically -- no PIN/typed-confirm/reason, since this is a routine
   single-person edit, not a bulk destructive one. Extended
   `scheduleChangeLog.action`'s enum (no new migration needed, the column
   is unconstrained TEXT). Verified against a fresh local DB: published-
   week removal logs and shows up via `loadRecentScheduleChanges`; draft-
   week removal does not log at all (4/4 checks).

3. **Published-week edit gate**: new `PublishedEditGate.tsx` hides the
   ordinary add/remove grid controls behind an explicit "Edit published
   schedule" button once a week is published -- staff can already see
   that week on My Schedule, so editing it should be a deliberate act.
   Draft weeks skip the gate entirely. Client-side toggle, resets on page
   load -- friction, not a hard security lock, matching the danger zone's
   typed-word-confirmation philosophy rather than adding another PIN gate.

`npx tsc --noEmit` clean, `npm run build` clean, all 71 tests pass.

## Nav: circular initials avatar "me menu" (2026-08-14, same day)

Oliver's ask: "circle shape like with initial of each staff as me menu
and has my pay and my schedule show as option after click." Replaced
the plain name text + separate "My Pay" link + "Sign out" button on the
right of the nav bar with one circular avatar (employee's initials),
click opens a dropdown: name/role header, My Schedule, My Pay, Sign
out. Closes on outside click or route change. Also removed the old
STAFF-only "My Schedule" link from the left nav -- it now lives in this
same menu instead of being split across two spots. MANAGER/ADMIN's
left nav (Shifts/Employees/etc) is unchanged; only the right-side
personal menu changed, for everyone. `npx tsc --noEmit` clean,
`npm run build` clean, 71/71 tests pass.

## Staff day-preview (click calendar) + Template Assignments inline grid (2026-08-14, same day)

Two features from Oliver's follow-up ask.

**Staff calendar day-preview.** "each staff should be able to click
calendar to see staff view like in a preview stage who work on that
day. but option on setting to allow who see who is for admin to
override permission as usual. foh see foh or see all." Any published
day on My Schedule's calendar is now clickable -> `/me/schedule/day?date=...`,
a Lunch/Dinner list of who's scheduled. New loader
`lib/schedule/loadScheduleDayPreview.ts` reuses the existing
`getVisibleRosterEntries` (lib/roster/visibility.ts) + the
`rosterRestrictFOHToOwnCategory`/`BOH` and
`rosterShowCoworkerListFOH`/`BOH` restaurant settings, rather than a
second parallel permission system -- those category-restriction
settings were literally built ahead of time for this ("Not yet used by
a live staff view" was the old settings-page copy). Reads from
`plannedShiftAssignments` (the plan), not `shiftRosterEntries` (day-of
actuals) -- previewing a future day needs the plan, which exists long
before any real Shift row for that date. Draft weeks return null, same
rule as My Schedule. No money fields included, ever. Settings page copy
updated to note both toggles now also gate this preview. Verified
against a fresh DB: 6/6 checks (draft->null, FOH restriction, MANAGER
sees all, coworker-list-off leaves only self).

**Template Assignments inline grid.** "in template assignment worth ui
upgrade to work easier. please display day in a week start with mon -
sun. each day has 2 rows. first is checkbox for lunch. another row for
dinner inline with first column which is name on the left. the most
right is edit button." Redesigned `PositionTemplateGrid.tsx`: Mon-Sun
columns, two rows per assigned person (Lunch then Dinner), name in a
rowSpan'd left column, an "Edit" button (replacing the old "⋮" icon,
same Mark-vacating/Retire menu underneath) in a rowSpan'd right column.
Checkboxes are live/inline now and auto-save via the existing
`syncEmployeePositionTemplate` action on each click -- no more click-a-
name-to-open-a-separate-editor-below step from the 2026-08-12 version.
Adding a brand-new person still goes through the "+ Add" picker, shown
immediately as a blank editable row; their first checkbox click is what
actually persists them (the table only ever stores checked cells, so
there's no "empty" row to load on refresh until then).

`npx tsc --noEmit` clean, `npm run build` clean, 71/71 tests pass.

## Template Assignments: checkboxes disabled by default, unlock via Edit (2026-08-14, same day)

Oliver's follow-up on the inline grid shipped earlier today: "i would
like template assignment checkbox on each day to be disable state
first. and be able to edit via edit button." Checkboxes now render
`disabled` by default; clicking a row's Edit button (label flips to
"Done") unlocks that person's checkboxes for the rest of the page
session. Mark vacating/Clear vacancy/Retire folded into the same
`editing` state -- previously a dropdown behind an always-clickable
button independent of checkbox lock state, now shown as small inline
links under Edit/Done only while that row is unlocked. `npx tsc
--noEmit` clean, `npm run build` clean, 71/71 tests pass.

## Ledger v1: vendor directory + Petty Cash with auto-pulled reconciliation (2026-08-14)

First round of the new Ledger feature. Design conversation with Oliver
(picked over building the shift-swap system next, see project memory)
confirmed scope: v1 = vendor directory + Petty Cash only (Supplier Check,
photo attachment, PDF export, and Card's weekly-batch-against-statement
flow are later rounds). Built from re-studying Soothr's real
" 2026 - C.xlsx" DNA file (Petty Cash Soothr / Supplier Check / Card /
Dropdown / Supplier Address / Export sheets) with fresh eyes rather than
trusting a 2-day-old memory summary.

Schema (migration 0008, additive): `ledgerVendors`, `ledgerCategories`
(both admin-managed, retire-not-delete, restaurant-configurable --
Bar/Food/Mis/PAYROLL BOH/PAYROLL FOH/Fixed expenses/Car/SHM seeded as a
starting point, not hardcoded), `pettyCashEntries` (vendorId nullable --
Soothr's real data has plenty of vendor-less cash handoffs like "Pay out
to Tommy: flowers"), `dailyCashReconciliations` (one row per date:
beginning balance, other cash, the manager's physical count, draft/
finalized status). Sales cash and Tip cash are deliberately NOT stored
columns -- `lib/ledger/loadPettyCashDay.ts` computes them live from that
date's `shiftSales` rows (finalized shifts only), so the number can never
independently drift from the Closing Report's own figures. Oliver's own
reasoning for the dependency: "you supposed not to close daily expenses
without knowing what cash we would get from register anyway" --
`finalizePettyCashDay` in `lib/actions/ledger.ts` enforces this by
refusing to finalize while any Shift for that date is still draft.

UI is mobile-first per an explicit Oliver requirement ("this back office
must be able to use with mobile") -- `/ledger` is a single day's petty
cash view: quick-add form, card list of entries (not a table), and a
reconciliation panel with the auto-pulled Sales/Tip cash shown read-only
next to editable Beginning Balance/Other/Counted Amount, plus a live
match/mismatch indicator against the computed expected total.
`/ledger/vendors` and `/ledger/categories` are simple retire-not-delete
admin lists, same shape as Positions.

Seeded 8 categories + 27 real vendor names from Soothr's actual
spreadsheet data -- Oliver confirmed seeding from Soothr "for testing
sake," with the expectation Youk Thai replaces these with its own real
vendors before going live.

Explicitly deferred, not forgotten: Supplier Check (next natural
extension of this same vendor/category infra), receipt/invoice photo
attachment (`photoUrl` column already reserved on `pettyCashEntries` so
this doesn't need a later migration -- needs Oliver to provision storage
credentials, e.g. Vercel Blob, before it can be built), a consolidated
daily PDF/image report for the on-duty manager to send to Aey/Oliver
(replaces the LINE-group report habit for now, in-app owner notification
is a further-future step), invoice/receipt generation for no-receipt
expenses like buying flowers from a local florist (explicitly a "future"
ask, not v1), and the cam-scanner/OCR auto-read of a receipt photo
(explicitly skipped for now, but the schema doesn't close the door on it
-- see [[project-atlas-ledger]] memory for the full reasoning on why
each of these was sequenced where it was).

Verified: `npx tsc --noEmit` clean, `npm run build` clean, all 71
existing tests pass unchanged, plus a new 8/8-check direct-DB
verification against the real seeded shift data (auto-pull sums match a
direct query over shiftSales, finalize is blocked while a shift is
unfinalized, a zero-shift day is still finalizable, the expected-balance
formula matches the loader's own math).

## Petty Cash week/month report, folded into the existing /reports page (2026-08-14)

Oliver's ask: "i would like to get weekly view and monthly view on
petty cash page, then we can click on date to see report detail of
that day. and we already got report page, we should utilize that page
to show different report." Rather than a second calendar UI under
`/ledger`, `/reports` now has a report-type tab (Sales & Tax / Petty
Cash) sharing the page's existing date-range picker (This week/month/
year presets + custom range) via a `?report=` query param -- both
report types live on the same page/picker, Sales & Tax's own behavior
and .xlsx export untouched. New `lib/reports/loadPettyCashReport.ts`
bulk-fetches entries/reconciliation/finalized-shiftSales for the whole
range in three queries (not a per-day loop) and computes each day's
status (no data/draft/finalized) plus, for finalized days, whether the
counted amount matched the expected total -- same formula
`loadPettyCashDay.ts` uses for one day, applied across a range. Each
date links to `/ledger?date=...`. `npx tsc --noEmit` clean, `npm run
build` clean, 71/71 tests pass, plus a new 9/9-check direct-DB
verification.

## Supplier Check: invoice-based vendor payments (2026-08-14)

Oliver clarified the real workflow mid-conversation: most vendors are
NOT cash-on-delivery (that stays in Petty Cash, unchanged) -- they drop
an invoice at delivery and get paid later by check, often at their next
delivery, when a new invoice arrives just as the previous one gets
settled. His words: "supplier that need cash on delivery will be in
petty cash categories. but most of the time supplier/vendor just drop
invoices and wait for check next time they come." Confirmed no due-date
field is needed, and that one printed check can reconcile multiple
pending invoices from the same vendor at once (matches the real DNA
export sheet's own K.D. Market example, two invoice numbers batched
under one check).

Two-stage lifecycle: `logSupplierInvoice` logs an invoice as "pending"
when it arrives (vendor, category, invoice number, description/nature,
amount, date received). `recordSupplierPayment` lets a manager select
one or more pending invoices from the SAME vendor and settle them
together under one check payment (paid date, optional check number) --
validates every selected invoice still belongs to that vendor and is
still pending before committing, so a stale form can't double-pay or
cross-vendor-pay. `deletePendingInvoice` removes an invoice logged in
error; blocked once paid.

Schema (migration 0009, additive): `supplier_invoices`,
`supplier_check_payments`. UI at `/ledger/supplier-check`: invoice-
logging form, pending invoices grouped by vendor with checkbox
multi-select feeding a per-vendor payment form (shows a running
selected-total), and recent payment history showing which invoice
numbers each check settled. Linked from the main `/ledger` page's nav
row alongside Vendors/Categories.

Verified with a new 14-check direct-DB script: vendor grouping and
pending totals, batch-paying multiple invoices under one payment with
the correct summed total, rejecting a re-paid invoice, rejecting an
invoice submitted under the wrong vendor's id, payment-history invoice-
number attachment, delete blocked on paid/succeeding on pending.
`npx tsc --noEmit` clean, `npm run build` clean, 71/71 existing tests
pass unchanged.

## Supplier Check follow-ups + Petty Cash floor manager column (2026-08-14)

Three quick follow-ups from Oliver after the Supplier Check round shipped:

1. **Recent payments are now click-to-expand.** `/ledger/supplier-check`'s
   payment history was a flat list showing just a joined invoice-number
   string; `loadRecentSupplierPayments` now returns full per-invoice line
   items (category, description, amount, received date) and
   `PaymentHistory.tsx` is a client component -- click a payment row to
   expand its settled invoices.

2. **New "Supplier Check" report tab + .xlsx export.** Third tab on
   `/reports` (Sales & Tax / Petty Cash / Supplier Check), sharing the
   same date-range picker. Before building, re-opened the real DNA
   source file (`" 2026 - C.xlsx"`'s "Export" sheet) directly rather than
   trusting the 2-day-old memory summary -- confirmed its exact columns:
   Pay / Amount / Memo / PayeeName / PayeeAddress (street + city/state/
   zip on separate lines), with Memo holding the comma-joined invoice
   numbers one check settled (matches K.D. Market's real
   "142675, 142676" example). New `lib/reports/loadSupplierCheckReport.ts`
   (one row per check payment in range) and
   `lib/reports/buildSupplierCheckWorkbook.ts` (same ExcelJS pattern as
   the Sales & Tax export, two extra columns prepended -- Paid Date,
   Check # -- for an audit trail the original pre-check DNA sheet didn't
   need). Also backfilled real payee addresses for 4 more seeded vendors
   (Asia Market Corp, Best Metropolitan, K.D. Market, The Haisein
   Company) straight from that same Export sheet, so the exported
   check-print columns have real data for the vendors most likely to
   actually get paid by check.

3. **Petty Cash report: added a Floor Manager column.** Shows who
   finalized each day's cash reconciliation
   (`dailyCashReconciliations.finalizedByEmployeeId`, left-joined to
   `employees`) -- null for draft/no-data days, not a stale leftover
   name.

Verified with a new 11-check direct-DB script (payment detail line items
sum to the payment total, report aggregation and date-range filtering,
DNA-sourced vendor address flows through to the report row, finalized
day shows the correct manager name, draft day shows null). `npx tsc
--noEmit` clean, `npm run build` clean, 71/71 existing tests pass
unchanged. No schema change, no new migration.

## Ledger restructure: month-list landing, /ledger/day, admin edit override (2026-08-14)

Oliver's ask: "after enter ledger page shows petty cash and supplier
tabs. then when click petty cash show list of date in month first. then
you can click each day to work on." Follow-up clarified the edit rule:
"no after it finalized only. and let use admin as authorized to edit
passed day or finalized item."

`/ledger` is now a landing page with two tabs -- Petty Cash and Supplier
(new `LedgerTabs.tsx`, same "separate routes, not client tab state"
pattern as `/reports`' own tabs). Petty Cash shows a month calendar of
days (new `MonthList.tsx`, reusing `loadPettyCashReport` -- the exact
same loader already powering the `/reports` Petty Cash tab) with
prev/next month navigation. The day-level work that used to live
directly on `/ledger` -- add expense, entries list, cash-drawer
reconciliation -- moved to `/ledger/day?date=...`, reached by clicking a
date in the month list. Supplier tab is the existing
`/ledger/supplier-check` route, now sharing the same tab header.

Two rules confirmed and enforced: a day in the future can't be logged or
reconciled at all (shown but not clickable in the month list; `/ledger/day`
itself shows a "hasn't happened yet" placeholder if landed on directly) --
and a FINALIZED day is locked for ordinary MANAGER accounts exactly as
before, but an ADMIN-role account can still edit its entries and
reconciliation directly. Admin edits do NOT unfinalize the day -- the
record stays `status: "finalized"`, this is a direct correction, not a
reopen-then-refinalize flow, with a blue "Editing as admin" banner in the
UI. Both rules are enforced in `lib/actions/ledger.ts` (the real guard),
not just hidden in the UI.

Updated the one cross-link that needed it: `/reports`' Petty Cash table
now links each day to `/ledger/day?date=...` instead of the old bare
`/ledger?date=...`. The NavBar's "Ledger" link needed no change --
already points at bare `/ledger`, which is now the tab landing.

Verified with a new 10-check direct-DB script mirroring the exact
validation logic in `addPettyCashEntry`/`saveDailyReconciliationDraft`
(those call `getCurrentStaffSession()`, which needs real request
context unavailable in a standalone script -- same limitation hit
earlier for `finalizePettyCashDay`/`deletePendingInvoice`): future-day
blocked for everyone including admin, MANAGER blocked from editing a
finalized day, ADMIN can edit a finalized day's entries and
reconciliation without unfinalizing it, month report data still
correct. `npx tsc --noEmit` clean, `npm run build` clean (new
`/ledger/day` route present), 71/71 tests pass. No schema change, no
new migration.

## Supplier Check: Printed/Paid check lifecycle, always-combine-by-vendor, holistic table (2026-08-14)

Oliver talked to Aey about the real workflow and came back with two
concrete facts that changed the design: "all invoices always get export
to check format at the end of the week. but we also got supplier like
maintenance that instantly need a check after service. so i think we
should be able to group and combine check for the same supplier who
always come as routine. and also be able to 'export this invoice to
print check' instantly." Confirmed: combining is now automatic (not a
manual checkbox choice), and a check has its own lifecycle separate from
the invoices it settles -- Printed (the check has been generated) then
Paid (it's actually been handed to the supplier).

Schema (migration 0010, additive): `supplier_check_payments` gained
`status` (printed/paid, default printed), `delivered_at`,
`delivered_by_employee_id`. `supplier_invoices.status` widened to
pending -> printed -> paid (a plain TEXT column with no CHECK
constraint, confirmed by inspecting migration 0009's SQL -- no migration
needed for the widening itself).

`lib/actions/supplierCheck.ts` replaced the old checkbox-driven
`recordSupplierPayment` with three actions: `printSupplierCheck(vendorId,
checkNumber)` always combines every currently-pending invoice for that
vendor into one check (captures the exact invoice ids before the update,
so a brand-new invoice logged in the split second between the select and
the update can't sneak into the total); `printAllPendingChecks()` is the
weekly batch -- finds every vendor with something pending and prints one
check each; `markSupplierCheckPaid(paymentId)` moves Printed -> Paid and
cascades the check's invoices to `status: "paid"` too. `logSupplierInvoice`
now redirects to `/ledger/supplier-check` on success, matching its own
new dedicated `/ledger/supplier-check/new` page (same pattern as
Vendors/Positions).

UI restructure: "+ Add item" link replaces the old always-open logging
form; an "Export week's checks" button runs the weekly batch and
auto-downloads the combined .xlsx; a "Not yet checked" section groups
pending invoices by vendor with a "Print check now" button per vendor
(the instant/urgent path -- e.g. a maintenance vendor -- downloads that
one check immediately); and a holistic `ChecksTable` (replaces
"Recent payments") lists every check ever printed with a status badge,
expandable invoice detail, and a "Mark as paid / delivered" action for
Printed checks. New `lib/reports/loadSupplierCheckReportByIds` (shares
an invoice-attach helper with the existing date-range loader) powers a
new `/ledger/supplier-check/export?paymentIds=...` route for the
instant/batch download, reusing `buildSupplierCheckWorkbook` (now with a
Status column). The `/reports` Supplier Check tab also gained a Status
column.

Verified with a new 18-check direct-DB script: same-vendor invoices
combine into one check with the correct summed total, printing a check
for a vendor with nothing pending is rejected, a new invoice logged
right after printing does NOT get swept into the already-created check,
the weekly batch prints exactly one check per vendor with pending
invoices, marking paid cascades to invoices and is a safe no-op on a
second call, and both loaders return correct status/detail. `npx tsc
--noEmit` clean, `npm run build` clean (both new routes present), 71/71
tests pass.

## Supplier Check: reprint, flexible multi-vendor Print Checks popup (2026-08-14)

Two follow-ups from Oliver right after the Printed/Paid restructure:

1. "even i hit print check now or not it does not mean i actually print
   it. so the button should be remained. or should change to 'reprint'."
   Every check row in the holistic table (Printed OR Paid) now has a
   Reprint link that re-downloads that exact check's .xlsx via the
   existing `/ledger/supplier-check/export` route -- no mutation, safe
   to click any number of times, so a failed physical print or a lost
   file is never a dead end.

2. "when i wanna print, should show popup and allow me to choose which
   vendor i need to print as well because i want a flexibility to print
   some but not all or print all." Replaced the separate per-vendor
   "Print check now" buttons and the all-or-nothing "Export week's
   checks" button with one "Print Checks" button (`PrintChecksButton.tsx`)
   that opens a popup listing every vendor with pending invoices as
   checkboxes (plus an optional check # per selected vendor), with
   Select all/Clear shortcuts. Confirming prints a check for exactly the
   selected vendors -- each still auto-combines all of that vendor's
   pending invoices -- and downloads one combined .xlsx of what was just
   printed. Checking exactly one vendor covers the urgent/instant case
   (a maintenance vendor needing a check right after service); checking
   all of them covers the weekly batch. Same popup, same action either
   way -- `lib/actions/supplierCheck.ts`'s `printAllPendingChecks` was
   replaced by `printChecksForVendors(selections)`, an explicit
   vendor+checkNumber list instead of unconditionally sweeping every
   pending vendor. `PendingByVendor.tsx` is now read-only (view + delete
   a mis-logged invoice) since printing is centralized in the popup.

Verified with a new 9-check direct-DB script: empty selection rejected,
a partial selection (2 of 3 vendors) leaves the unselected vendor's
invoices untouched and still pending, each selected vendor keeps its own
independent check number, selecting the last remaining pending vendor
clears the rest, and reprinting (re-loading the same payment ids twice)
is confirmed idempotent -- identical totals, status unchanged. `npx tsc
--noEmit` clean, `npm run build` clean, 71/71 tests pass. No schema
change, no new migration.

## Accessibility fix: hamburger nav + scrollable weekly plan grid (2026-08-15)

Fixed the two "easy" gaps flagged by X's UI/UX accessibility audit that
don't require the full Monday design pass (flags #2 and #5 of 6 in
`project_atlas_target_users_accessibility` memory):

1. **`NavBarClient.tsx`** -- the manager nav (`MANAGER_NAV_ITEMS`, 7 text
   links: Shifts/Employees/Positions/Schedule/Ledger/Reports/Settings)
   was a flat unwrapped `flex gap-4` row with no wrap or scroll
   fallback -- would overflow off-screen unreachably on a phone. Below
   the `sm` breakpoint the inline row is now hidden and replaced with a
   hamburger button (left of the "Atlas" logo) that toggles a stacked,
   full-width link list below the header bar. `sm:` and above is
   unchanged -- same inline row as before. Both the account menu and the
   new mobile nav close automatically on navigation.

2. **`WeeklyPlanGrid.tsx`** -- each period's Position x 7-day-x-2-slot
   table had no `overflow-x-auto` wrapper and would squeeze unreadably
   on a narrow screen. Wrapped each `<table>` in a horizontally
   scrollable container with a `min-w-[640px]` floor, so the table
   scrolls instead of squishing -- matches the existing pattern used
   elsewhere for wide tabular content rather than inventing a new one.

Neither fix touches the two remaining audit flags that need the full
design pass (#1 decimal-rate inputs, #3 Schedule landing hierarchy,
#4 dup Sign-out buttons -- flag #2 renumbered here, see memory for exact
numbering -- and #6 no shared design system).

Verified: `next build` clean, 71/71 unit tests pass. `tsc --noEmit` and
`eslint` both show one pre-existing unrelated finding each
(`app/layout.tsx` LayoutProps type-gen artifact, and a pre-existing
`react-hooks/set-state-in-effect` lint warning on `NavBarClient.tsx`'s
close-on-navigate effect) -- confirmed via `git stash` that both exist
identically on the pre-change file, so neither was introduced by this
round. No schema change, no migration, no new dependencies.

## Settings: sales tax rate now takes/shows a percent, not a raw fraction (2026-08-15)

Fixed flag #1 from X's UI/UX accessibility audit (the highest-stakes item
on the list -- it silently affects every computed dollar figure). Oliver's
own ask: "i want it to be input as 8.875% by default but can be changed
later as nyc tax right now."

- `SettingsForm.tsx`'s "Default sales tax rate" field now shows a `%`
  suffix and takes/displays the value as a percent (`8.875`) instead of a
  raw fraction (`0.08875`) -- typing "8.5" instead of "0.085" was a
  completely natural mistake with nothing to catch it before.
- `lib/actions/settings.ts` converts the percent input to a fraction
  (`/100`) before storing, validated 0-100 on the way in. Every downstream
  consumer (Closing Report auto-fill, Sales Tax report) still reads/writes
  the fraction exactly as before -- the conversion is contained entirely
  to the Settings form/action, nothing else changed.
- The seeded restaurant row already has the real NYC rate (`0.08875` --
  `db/seed.ts`), so the field now shows `8.875` out of the box, matching
  Oliver's ask, with no schema change needed for that. `loadRestaurantSettings
  .ts`'s "row somehow doesn't exist" fallback (should never happen
  post-seed) was also bumped from `0` to `0.08875` for the same reason.
  Deliberately did NOT change the `restaurant_settings.default_sales_tax_rate`
  DB column default -- `drizzle-kit generate` wanted to emit a libSQL
  `ALTER COLUMN` plus an unrelated drop/recreate of 16 indexes across other
  tables to do it, which is exactly the kind of hosted-DB migration risk
  worth avoiding for a default that's never actually hit in practice (a
  restaurant_settings row always exists post-seed).

The CC tip deduction rate field has the identical underlying issue (also
flagged in the audit) but wasn't touched this round -- Oliver's ask was
specifically about the tax rate.

Verified with a 7-check direct-DB script: seeded rate surfaces correctly,
percent-to-fraction conversion is exact both directions, an out-of-range
percent (>100) is rejected, round-trips cleanly through the loader.
`eslint` clean on all 4 touched files, `next build` clean, 71/71 tests
pass. No schema change, no migration.

## Staffing Targets rework: combined Lunch/Dinner grid + master row stepper (2026-08-15)

Oliver's ask: "each position has 2 rows one is lunch another is dinner"
plus "a -/+ button that change the whole row like a master button so you
dont have to manaually change each and every single one. more like game
ui." Confirmed via AskUserQuestion before building: the master button
bumps every day in a row by 1 relative to whatever's already there
(not a reset-all-to-the-same-number), so any day-to-day variation
already set (e.g. Friday dinner staffed higher than Monday) survives a
click.

- `TargetsForm.tsx` rebuilt from two entirely separate Lunch/Dinner
  tables into ONE table -- every position now gets exactly two rows
  (Lunch, Dinner) next to each other, with the position name/category
  spanning both via `rowSpan`. Category breaks (FOH/BOH divider) still
  apply the same border treatment as before.
- New "All days" column: a chunky rounded +/- pair (`MasterStepper`) per
  row that bumps every one of that row's 7 day values by 1, clamped at
  0. The existing per-day steppers are unchanged and still work for
  fine-tuning a single cell -- the master control is purely additive.
- `TargetStepper` changed from owning its own local state to being
  controlled by the parent (`PositionTargetRows`), which now holds each
  position's Lunch/Dinner 7-value arrays -- necessary so the master
  button can update every cell in a row in one state change.
- Field names (`target_<positionId>_<day>_<period>`) and the whole-grid
  resubmit-and-resync server action (`updateStaffingTargets`) are
  completely unchanged -- this was a client-side layout/state rework
  only, zero backend changes.
- Table wrapped in `overflow-x-auto` (matches the WeeklyPlanGrid/v50
  pattern) since it's now wider (added Period + All-days columns).

Verified with a 9-check static-render script (`renderToStaticMarkup`)
confirming both rows render per position, master stepper count and
per-day input count are correct, and seeded values land in the right
cells. `eslint` clean, `next build` clean, 71/71 tests pass.

## Weekly Plan: "Auto-fill understaffed slots" button (2026-08-15)

Oliver's ask: "auto fill button on to fill up understaff positions on
weekly plan. now no criteria or rules but i will add it up later after
i sure how to do it we will disscuss about that later. only one rule
right now is it cannot be same person in a day." Confirmed 4 design
decisions via AskUserQuestion before building (eligible pool, scope,
tie-break order, how to report unfillable slots) -- all recommended
options accepted.

- New server action `autoFillWeek(weekId)` in `lib/actions/schedule.ts`.
  For every position/date/period slot in the week below its staffing
  target, picks people to fill the shortfall:
  - **Eligible pool first** (employees linked to that position via
    Employee admin / primaryPositionId -- same group the manual
    quick-add dropdown treats as "usually works this role"), **falls
    back to any other active employee** not already used that day if
    eligible is exhausted, rather than leaving a slot empty.
  - **Never the same person twice in one calendar day** -- across BOTH
    periods and every position, counting existing assignments AND
    whatever auto-fill has already placed earlier in the same run.
  - Among multiple free/eligible candidates, **picks whoever has the
    fewest shifts so far this week** (ties broken alphabetically) so
    hours spread out reasonably with zero real rules yet.
  - Never touches an existing assignment, only adds new rows for the
    shortfall. A slot that still can't be fully filled is left under
    target and reported back rather than silently dropped.
  - New rows tagged `sourceType: "AUTO_FILL"` (schema enum widened from
    2 to 3 values -- plain TEXT column, no CHECK constraint, confirmed
    via `drizzle-kit generate` -> "No schema changes, nothing to
    migrate" -- no migration needed).
- New `AutoFillWeekButton.tsx`, one button + result banner ("Filled 11
  slots. 3 slots still need someone" + a per-slot breakdown when
  something couldn't be filled). Lives inside `PublishedEditGate`'s
  unlocked view, next to "Add to a slot" -- it's another way of adding
  assignments, so it sits behind the same "you're editing a published
  schedule" awareness rather than bypassing it.

Verified with a 12-check direct-DB script against fresh seeded data:
confirms no employee is ever double-booked the same date, eligible pool
is preferred over fallback, the fewest-shifts tie-break actually skips
someone with a head-start, an intentionally impossible target is
reported in the skip summary instead of silently dropped, re-running
auto-fill on an already-filled week adds nothing extra (idempotent), and
every new row is tagged AUTO_FILL. `eslint` clean, `next build` clean,
71/71 tests pass. No migration.

## Auto-fill fix: primary position first, then multi-position, never an unsuitable person (2026-08-15)

Oliver caught a real bug from live testing: "i saw gunner as a head
chef which it is not possible. gunner can do a packer not chef." His
rule for the fix: "fill only primary position first and then fill with
people who can do multi position. never add a person auto fill person
who is not suitable to positions."

Root cause: v53's `autoFillWeek` had a single merged "eligible" pool
(primary + cross-trained) and, when even that was exhausted, fell back
to ANY active employee not already used that day -- which is exactly
how Gunner (primary Bag Handler, zero link to Head Chef at all) ended
up filled into a Head Chef slot once Bomb (the only real Head Chef)
was already used elsewhere that date.

Fixed in `lib/actions/schedule.ts`: replaced the single eligible set
with two ordered, non-overlapping tiers, tried in order per slot --
  1. Primary -- employees whose `primaryPositionId` is this position.
  2. Multi-position -- employees cross-trained for it via Employee
     admin (`employeePositions`) but it isn't their primary.
There is no third tier anymore. If neither has anyone free that date,
the slot is left unfilled and reported in the skip summary -- it will
never place someone with zero link to that position, no matter how
short-staffed the day is. The fewest-shifts-this-week tie-break still
applies WITHIN a tier, but tier order now always wins over it (a
primary match with more hours already still gets picked before a
0-hour secondary match, matching Oliver's "primary first" wording
literally).

`AutoFillWeekButton.tsx`'s on-screen description updated to match.

Verified with a 10-check direct-DB script: an unfillable Head Chef slot
(sole primary person already used, no secondary at all) is left empty
and reported, never handed to an unrelated person like Gunner; Bag
Handler correctly prefers Gunner (primary) the moment he's free; a
primary match with a pre-existing shift still gets used before an
otherwise-idle secondary match, once primary options run out;
same-day exclusion and skip-reporting from v53 both still hold.
`eslint` clean, `next build` clean, 71/71 tests pass. No schema change,
no migration.

## Supplier Check invoice editing + Financial auditor code (2026-08-15)

Oliver: "i want to be able to edit the check in case of typo of put
wrong amount." Real-world security model, confirmed: "in real senario
it is admin and Aey. after hit edit might need a prompt to enter aey
secret code for security. like manager code in bank. as Aey will be a
financial audit for Youk."

Previously there was no way to fix a typo or wrong amount once an
invoice existed -- a Pending one could only be deleted and re-entered
from scratch, and a Printed/Paid one couldn't be touched at all.

- New `employees.isFinancialAuditor` boolean (schema + additive
  migration, no data loss) -- who's allowed to edit an already Printed/
  Paid invoice, and whose existing staff-login PIN doubles as the
  confirmation code required on every such edit. Independent of
  systemRole on purpose: Aey is seeded as MANAGER, not ADMIN, but still
  needs this specific power. Toggle lives on the Employee admin form
  ("Financial auditor" checkbox) -- **Oliver still needs to check this
  box on his REAL Aey employee record via /employees**, since seed data
  only sets it locally for testing, never touches production.
- `StaffSessionEmployee` (lib/auth/session.ts) extended with this flag
  so pages can gate UI visibility without an extra query.
- New `editSupplierInvoice` action (lib/actions/supplierCheck.ts):
  invoice number / description / amount are editable (vendor/category
  are not -- out of scope for "typo or wrong amount"). Two gates by
  status:
    - PENDING: open to any manager who reached the page, no code --
      nothing's locked in yet.
    - PRINTED or PAID: only an ADMIN account or the flagged auditor may
      even attempt it, AND -- regardless of who's editing, even Aey
      herself -- the flagged auditor's own PIN must be re-entered and
      verified. This is deliberately "the auditor approved this
      specific change," not just "prove you're an admin," matching "a
      prompt to enter aey secret code ... like manager code in bank."
  Editing an invoice on an already-printed check also recomputes the
  parent check's denormalized `totalAmount` immediately. No new export
  logic needed -- the existing Reprint link already regenerates the
  .xlsx from current data on demand, so it naturally reflects the fix.
- New shared `EditInvoiceForm.tsx`, used by both `PendingByVendor.tsx`
  (no code field) and `ChecksTable.tsx` (code field, Edit only shown to
  Admin/auditor sessions).

Verified with a 13-check direct-DB script: pending edits open to any
manager; a plain manager is blocked outright on a printed invoice
(never even reaches the code prompt); an Admin without a code, or with
the WRONG code, is rejected and nothing changes; an Admin WITH Aey's
correct code succeeds; the parent check's total recomputes correctly;
Aey herself (flagged auditor, not Admin) can also confirm with her own
code. `eslint`/`next build` clean, 71/71 tests pass.

## Supplier Check: audit log (who/what/when/why) + print-vs-audit export split (2026-08-15)

Two follow-ups from Oliver:

1. "as it concern money it should have a log who do what when with the
   check and why edit print check." New append-only
   `supplier_check_audit_log` table (additive migration), logging two
   actions so far -- **EDITED_INVOICE** (always requires a reason now,
   enforced in `editSupplierInvoice`; records before/after invoice #,
   description, amount) and **PRINTED_CHECK** (who printed, when, check
   #, total, which invoices -- no reason needed, it's a routine
   workflow step not a correction). `ChecksTable.tsx`'s expanded detail
   gained a collapsed "History" section listing every logged event for
   that check, most recent first, showing only the fields that actually
   changed on an edit plus the typed reason.
2. "check export file .xlsx dont need any payee address status check
   number because this file will be export to check printing software
   ... in another way it should be different report that still show
   check number and status for auditorial purposes." `buildSupplier
   CheckWorkbook.ts` now takes a `variant: "print" | "audit"` param
   instead of one fixed column set: **print** (used by
   `/ledger/supplier-check/export`, the file fed straight into
   check-printing software) is trimmed to Paid Date / Pay / Amount /
   Memo / PayeeName only; **audit** (used by `/reports/export-supplier-
   check`) keeps the full original layout plus Check #/Status for
   bookkeeping. Deliberately reused the app's EXISTING two separate
   export routes/buttons rather than building a column-picker UI --
   simpler and more foolproof than a configurable control nobody but
   Oliver would touch.

Verified with a 15-check script: audit rows created correctly for both
edit and print (who/reason/before-after captured), print variant has
exactly 5 columns with no PayeeAddress/Status/Check#, audit variant has
all 10 columns intact. `eslint`/`next build` clean, 71/71 tests pass.

## Supplier Check: Week/Month picker on the Ledger tab (2026-08-16)

Oliver: "supplier tab on ledger should be able to show by week or
month." `/ledger/supplier-check`'s "Checks" list used to be a flat
"most recent 200, ever" table with no way to scope it -- fine for a
brand-new restaurant, not for browsing history once Youk Thai has
months of checks. Added a Week/Month toggle with Prev/Next navigation,
same interaction pattern as the Petty Cash tab's existing month-of-days
picker on `/ledger` (Monday-start weeks, matching the rest of the app's
week convention from Schedule/Reports). Defaults to Week, since that's
the routine cadence Aey described ("all invoices always get export to
check format at the end of the week"); Month is the zoom-out option.
The list now also shows a period total ("N checks -- $X total").

`loadSupplierChecks(limit)` changed to `loadSupplierChecks({ from, to
})`, filtering by `paidDate` range instead of an arbitrary recent-N
cap -- a period is now always well-defined. Reused `lib/schedule/
weekMath.ts`'s existing week helpers (`weekStartFor`, `datesInWeek`,
`shiftWeek`) rather than reinventing week math a third time; month
helpers mirror `/ledger/page.tsx`'s own local ones (that file's
established pattern of each page owning its small date math).

This is scoped to the operational Ledger view specifically -- it's a
different concern from the Reports page's existing week/month/year
range picker for `supplier-check`, which is an accounting/export
summary, not a day-to-day browsing tool. Both now exist, for different
jobs.

Verified with a 6-check script spanning a week boundary (Jul 31 / Aug
3) and a month boundary (Jul/Aug): week view returns exactly the 3
checks in that Mon-Sun range with the right $ total, prev/next week
each isolate their single check correctly, month view returns all 5
August checks ($500) vs. July's 1 ($100), and an empty month (January)
correctly returns zero. `tsc --noEmit` clean, 71/71 tests pass. No
schema change, no migration needed.

## Tile home page (2026-08-16)

Oliver: "build home page as tiles contain a feature." The old "/" was a
leftover from the very first prototype -- three text-link buttons
(Shifts/Positions/Settings) plus a "playground calculator" link -- that
had drifted badly out of sync with the real feature set (missing
Employees, Schedule, Ledger, Reports entirely) and wasn't gated by
login at all.

Confirmed three scope questions with Oliver before building: (1) "/"
becomes where everyone lands after login (both `login()` in
`lib/actions/auth.ts` and the login page's own "already signed in"
check now redirect to "/" instead of "/me"), replacing the old
always-"/me" redirect; (2) all 7 manager nav items get a tile --
Shifts, Employees, Positions, Schedule, Ledger, Reports, Settings, not
split further; (3) STAFF accounts get their own small tile page too
(My Schedule, My Pay) rather than skipping straight to /me -- otherwise
the tile page nobody but managers ever sees.

`app/page.tsx` is now a server component: no session -> redirect to
`/login` (nothing useful to show an anonymous visitor); otherwise reads
`session.systemRole` and renders `MANAGER_TILES` (7) or `STAFF_TILES`
(2). Each tile is one large tap target (icon + label + one-line
description, not a bare text link) -- matches the phone+desktop,
low-computer-literacy-friendly bar from the accessibility audit
(`project_atlas_target_users_accessibility` memory) more closely than
the plain link row it replaced. Icons are small inline SVGs, no new
icon-library dependency.

Verified: `npx tsc --noEmit` shows only the pre-existing unrelated
`app/layout.tsx` LayoutProps finding (confirmed via `git stash` to
predate this change), `eslint` clean on all three touched files,
`next build` clean (`/` now correctly shows as a dynamic route, since
it reads the session cookie), 71/71 tests pass. Manually verified both
role views by creating a session directly via `createSession()` and
hitting `/` with that cookie against a `next start` server: MANAGER
(Aey) renders all 7 tiles, STAFF (Alesso) renders the 2 staff tiles,
and a request with no cookie 307s to `/login`. No schema change, no
migration.

## Card — third Ledger channel (2026-08-16)

Oliver: "let's start with card channel next." Card had been explicitly
deferred since Ledger v1 (project_atlas_ledger memory: "Card explicitly
NOT attempted yet -- Aey pulls Card transactions from the bank/credit-
card statement in a batch, weekly or more often once charges settle,
not in real time. That's a fundamentally different UI shape (reconcile
a statement period, not log-as-you-go) -- don't just copy the Petty
Cash pattern for it.") Re-opened the actual DNA file's "Card" sheet
directly before designing anything: a template-only sheet (Date/Card/
Pay/Memo/Amount columns) with zero real transaction rows -- no real
data to validate against, same situation Supplier Check was in before
its first build.

Confirmed four scope questions with Oliver via AskUserQuestion before
writing any code (all recommended options chosen): (1) manual entry,
one line at a time -- no CSV/bank import in v1; (2) a target-total
match IS required before a period can be marked reconciled, same
discipline as Petty Cash's drawer count, not the looser just-a-log
shape Supplier Check uses; (3) multiple named cards, admin-managed
list, retire-not-delete; (4) Card reuses the existing shared
ledgerCategories taxonomy, no separate category list.

**Model:** a statement period belongs to exactly ONE card (mirrors how
a real bank/card statement works) and carries its own `statementTotal`
as the reconciliation target -- transactions don't need their own card
field, it's implied by which period they're logged under. This is
simpler than putting a `Card` column on every transaction row the way
the DNA sheet's own layout suggested.

Schema (migration 0013, purely additive): `ledger_cards` (retire-not-
delete, same as ledger_vendors/ledger_categories), `card_statement_
periods` (cardId, periodStart/End, statementTotal, status draft/
reconciled, reconciledAt/reconciledByEmployeeId), `card_transactions`
(statementPeriodId, date, categoryId, memo, signed amount -- negative
for a credit/refund, unlike Petty Cash's always-positive payouts).
`lib/actions/card.ts`: card CRUD, `createStatementPeriod`,
`editStatementPeriod` (blocked once reconciled except for ADMIN, same
exception pattern as Petty Cash's finalized-day override),
`addCardTransaction`/`deleteCardTransaction` (same lock/admin-override
rule), `reconcileStatementPeriod` (blocked unless logged transactions
sum to the statement total within a cent, mirroring the Petty Cash
epsilon-match check).

UI: `/ledger/card` (flat list of every statement period across every
card, most recent first, same "holistic table" shape as Supplier
Check's Checks list rather than per-card sub-navigation -- most
restaurants only have a handful of cards/periods), `/ledger/card/new`
(pick card + statement dates + target total), `/ledger/card/period?id=`
(the actual work: add/remove transactions, edit the period's own header
fields, reconcile panel showing logged-vs-target with a live match/
mismatch banner and a disabled-until-matching "Mark reconciled"
button), `/ledger/cards` (card admin, mirrors the Categories page
exactly -- inline add form + retire toggle). `LedgerTabs.tsx` gained a
third "Card" tab alongside Petty Cash/Supplier, and a "Cards" link next
to Vendors/Categories. `seedLedgerOnly.ts` extended to also seed one
placeholder card ("House card (edit me)") so the flow is immediately
testable -- flagged in its own log line to rename/replace before going
live, same "DNA/seed data is a guideline" precedent as vendors.

Verified: `eslint` clean, `npx tsc --noEmit` clean, `next build` clean
(4 new routes: `/ledger/card`, `/ledger/card/new`, `/ledger/card/
period`, `/ledger/cards`), 71/71 existing tests pass unchanged, plus a
new 11-check direct-DB script (card creation, period creation as draft,
partial-total correctly fails the match check, signed amounts including
a refund landing exactly on the target, reconcile only succeeds once
matched, a second mismatched period correctly stays blocked, retiring a
card doesn't disturb its already-reconciled periods' history) --
deleted after use per this project's sandbox convention. Also manually
smoke-tested all four new routes against a running `next start` server
with a real MANAGER session cookie (200 OK, real data rendered, no
error content). No changes to Petty Cash or Supplier Check.

**Not built, deliberately deferred, same as everywhere else in Ledger:**
CSV/bank statement import (v1 is manual entry only, confirmed with
Oliver), photo attachment of statement pages, an audit log for Card
edits (Supplier Check's audit log came in a later round after being
asked for, not on first build -- same pattern here).

## Leave requests — Schedule Planner Phase D (2026-08-16)

Oliver picked this as the next feature after Card shipped, from a
menu of backlog options. Design for the core `leaveRequests` table was
already resolved on 2026-08-11 (see project_atlas_schedule_planner
memory); before building, confirmed with Oliver via AskUserQuestion
that it should be self-service with no approval step -- his framing:
by the time an employee logs one, they've usually already told the
manager informally ("Manager คะ หนูไปเที่ยวแล้วค่ะ"), so this isn't a
request that needs accept/deny, it's a way to push an already-agreed
absence into a log/calendar so the manager doesn't forget.

Schema (migration 0014, purely additive): `leave_requests`
(employeeId, startDate, endDate, optional note, loggedAt) -- no status
field, nothing to approve. Deliberately does NOT touch
`employee_schedule_templates` at all: a leave period is a temporary
interruption to someone's recurring pattern, not a change to it
(unlike RESIGNATION/PROMOTION, which really do change the template).
Instead, `loadWeeklyPlan.ts` now computes a DERIVED `onLeave` flag per
assignment at read time -- if an assignment's date falls inside any
leave request logged by that employee, it's flagged, with the leave's
own note surfaced in the tooltip. Nothing is mutated in the template
or the assignment row itself.

`lib/actions/leave.ts`: `submitLeaveRequest` (any signed-in employee,
for themselves only), `deleteLeaveRequest` (the owner, or any
manager/admin -- e.g. correcting an entry). No edit action -- a leave
whose dates changed gets cancelled and resubmitted, same lightweight
spirit as the rest of this table.

UI: `/me/schedule` gained a "My leave requests" section (collapsible
submit form + a list of the employee's own upcoming leave with a
Cancel button) -- placed above "Recent changes to your schedule".
`/schedule/leave` is the manager-facing inbox/log Oliver asked for
("a Notification / Log Box that tells the Manager a change is coming")
-- every leave request whose end date hasn't passed, soonest first, no
approve/deny controls since there's nothing to approve. Linked from
the Schedule hub. The Weekly Plan grid (`WeeklyPlanGrid.tsx`) gained a
purple ring + dot on any assignment pill that overlaps a logged leave
(same visual pattern as the existing red vacancy-soon ring, distinct
color so the two don't get confused -- a leave is temporary, a vacancy
is permanent) -- shown in both manager and read-only/staff preview
modes, same "not gated by hideDiagnostics" treatment vacatingSoon
already gets, since Oliver's original intent for that signal was that
staff should see it too, not just managers.

Verified: `eslint`/`tsc --noEmit` clean on every touched file (the
7 pre-existing findings in `schedule/page.tsx`, `me/schedule/page.tsx`,
and `PositionTemplateGrid.tsx` were confirmed via `git stash` to
predate this change, not introduced by it), `next build` clean (new
route `/schedule/leave`), 71/71 tests pass, plus a new 10-check
direct-DB script (submit, per-employee isolation between
loadMyLeaveRequests calls, the manager inbox correctly drops a request
once its end date has passed, the Weekly Plan overlap flag fires only
for the employee who's on leave and only for dates actually inside the
range -- confirmed a same-week assignment just outside the leave's end
date is correctly NOT flagged, deleting a request removes it from both
loaders) -- deleted after use. Also manually smoke-tested `/schedule/
leave`, the Schedule hub's new tile, and `/me/schedule`'s new panel
against a real `next start` server with both a MANAGER and a STAFF
session cookie.

**Not built:** the shift-swap portal (Phase E) -- Oliver wants a
dedicated design conversation on that before any code, same discipline
this whole feature area has followed from the start. Month overview
and Person schedule (the other two schedule views) don't show the
leave flag yet -- scoped out of this round to keep it shippable; only
the Weekly Plan grid (the view a manager actually builds/adjusts a
week from) got it.

## Red-pill notification badge — leave requests inbox (2026-08-16)

Oliver: "i want a red pill show as notification. we might need to
create inbox feature. for leave request, shift swapping, etc. please
review and tell me." Reviewed first (per the standing "never assume"
rule) rather than building straight away -- confirmed neither
`/schedule/leave` (manager leave inbox) nor `/me/schedule`'s "Recent
changes" log had any read/unread tracking anywhere in the schema, and
the shift-swap portal doesn't exist yet (still deferred to its own
design conversation). Presented the gap plus four design questions via
AskUserQuestion; Oliver picked the Recommended option on all four:
manager-only scope for now, real read-tracking (not a time-window
heuristic), badge on the existing "Schedule" nav item (no new nav
entry), build the leave-only pill now rather than waiting on the swap
design.

**Schema:** new `notificationSeen` table -- `employeeId` + `section`
(string key, e.g. `"leave_requests"`) + `lastSeenAt`, unique on
(employeeId, section). Deliberately generic/keyed by a string section
rather than leave-specific columns, so the shift-swap inbox can reuse
this same table later with a new section key and no further migration.
No row for an employee+section means "never visited" -- the loader
treats that as everything in that section being unseen, not zero.

**Read side:** `loadUnseenLeaveRequestCount(managerEmployeeId, todayIso)`
in `lib/schedule/loadLeaveRequests.ts` -- mirrors
`loadUpcomingLeaveRequests`'s own `endDate >= today` filter so the
badge count always matches what's actually visible on the page, then
compares each request's `loggedAt` against the manager's `lastSeenAt`
for the `"leave_requests"` section.

**Write side:** `markNotificationSeen(section)` in the new
`lib/actions/notifications.ts` -- upserts `lastSeenAt` for the
signed-in manager. Fired from a new client component,
`MarkSeenOnMount.tsx`, on mount when `/schedule/leave` renders, then
calls `router.refresh()` so the server-resolved nav badge (computed in
`NavBar.tsx`, passed down to `NavBarClient.tsx` as `unseenLeaveCount`)
updates without a full reload. Deliberately not done as a side effect
of the page's own server render -- a GET shouldn't mutate, and the
page component may be reused/cached.

**Nav:** `NavBarClient.tsx` renders a small red `UnseenBadge` (bare dot
with a number, "9+" past that) next to the "Schedule" label in both the
desktop nav row and the phone-width hamburger list. Staff sessions
never see it (`unseenLeaveCount` is only computed for MANAGER/ADMIN in
`NavBar.tsx`).

**Bug caught during verification, fixed before shipping:** first pass
wrote `lastSeenAt` with JS `new Date().toISOString()`
("2026-08-16T12:00:00.000Z"), but `leaveRequests.loggedAt` is written
by SQLite's own `current_timestamp` default ("2026-08-16 12:00:00") --
two different string shapes that don't compare correctly against each
other with a plain `>`, because `' '` sorts below `'T'` character-by-
character regardless of actual chronological order. This silently made
every leave request look "already seen." A 7-check direct-DB verify
script caught it (the "unseen=1 after a new request logged post-visit"
case failed); fixed by writing `lastSeenAt` via `sql\`(current_timestamp)\``
in the action instead of a JS-side date, so both columns share the
same clock/format. Worth remembering for any future column that gets
string-compared against an existing `current_timestamp`-default column
elsewhere in this codebase (a few other actions already write
`new Date().toISOString()` into their own timestamp columns, but none
of those are compared against a `current_timestamp`-default column
today, so this is the first time the mismatch actually mattered).

Verified: `eslint`/`tsc --noEmit` clean on every touched file (the
1 pre-existing `NavBarClient.tsx` finding -- `set-state-in-effect` on
the unrelated menu-close effect -- confirmed via `git stash` to predate
this change), `next build` clean, 71/71 tests pass, plus a 7-check
direct-DB verify script (deleted after use) covering: zero unseen with
nothing logged, unseen=1 on first request before any visit, unseen=0
right after a visit, a new request logged after a visit correctly
bumps back to 1 (not 2 -- the earlier one stays seen), the upsert never
creates a second row for the same employee+section, re-visiting
re-clears the count, and an already-expired request is excluded from
the count (matching what the inbox page itself shows). Also manually
smoke-tested against a real `next start` server: a MANAGER session
cookie with one upcoming leave request shows "1" on the Schedule nav
item on `/`, and a STAFF session cookie shows no badge at all.

**Not built / open for later:** shift-swap's own section
(`"swap_requests"` or similar) on the same `notificationSeen` table --
straightforward to add once the swap portal itself is designed, no
schema change needed. The staff-facing "Recent changes to your
schedule" log still has no badge (explicitly out of scope per Oliver's
"manager only" answer) -- would need its own decision if he wants to
revisit that later.

## Shift-swap portal — Schedule Planner Phase E (2026-08-16, same session)

Oliver's follow-up after the leave-requests red pill: "leave request
card show red pill noti as well. no need to ship right now. ship it
with what we gonna do next." Queued rather than shipped standalone (see
memory's schedule-planner topic file); then asked "what to build next,"
picked the shift-swap portal -- the one piece of the original
2026-08-11 Schedule Planner vision (flight-crew-style swaps: Employee A
requests -> B accepts/declines -> manager notified) that had stayed
undesigned this whole time, explicitly deferred by Oliver's own request
to a dedicated design conversation before any code.

**Design confirmed via two AskUserQuestion rounds before writing
anything**, all Recommended options except one custom answer:
- Open to any qualified coworker (not a named-only request).
- **Approval rule (Oliver's own words, not the suggested option):**
  "if it equal or less than 3 days before shift occur ... before that
  manager just got notified but no need approval." So a swap due more
  than 3 days out finalizes the instant a coworker accepts (manager
  just notified after the fact); a swap due 3 days or less out goes to
  `pending_manager_approval` and needs an explicit Approve/Decline.
- Eligibility system-enforced by position (via `employeePositions`,
  active only) -- not just self-selected like the paper process it
  replaces.
- Only published-week shifts are swappable (draft weeks aren't real
  commitments).
- A manager declining a pending swap reverts it to the original
  requester (nothing to undo -- the assignment was never actually
  reassigned during the pending state).
- The requester can cancel their own request while it's still `open`.
- The Weekly Plan grid shows a NEW distinct blue ring for
  `pending_manager_approval`, separate from the existing GREEN
  (completed swap) and unrelated YELLOW (extra-coverage-needed).

**Architecture finding surfaced before building, not asked as a
question (a correctness detail, not a product decision):**
`plannedShiftAssignments` (the plan) and `shiftRosterEntries` (the real
payroll/tip-affecting roster on an actual `shifts` row) are separate --
the roster only gets copied from the plan ONCE, at the moment a manager
creates the real shift for that date (`seedRosterFromPublishedPlan` in
`lib/actions/shift.ts`). So a swap completing after that point needs to
update BOTH rows to keep payroll correct, and must refuse entirely if
that real shift has already been finalized (payroll-locked) -- same
"finalize closes the door" rule as Card statement periods and the
Closing Report. Handled by `completeSwap()`, see below.

**Schema:** new `swapRequests` table (migration `0016`) --
`assignmentId` (FK to one specific `plannedShiftAssignments` row, not
the recurring template -- temporary like leave, not permanent),
`requestingEmployeeId`, `acceptingEmployeeId`, `status` enum (`open` ->
`completed` OR `pending_manager_approval` -> `completed`/`declined`;
`open` -> `cancelled`), `note`, `createdAt`, `respondedAt` (when
someone accepts), `decidedAt`/`decidedByEmployeeId` (only set if a
manager actually approved/declined).

**Read side (`lib/schedule/loadSwapRequests.ts`):**
`loadMySwappableAssignments` (own upcoming published shifts with no
live swap already on them -- the offer picklist), `loadAcceptableSwapRequests`
(open requests a given employee is eligible for: right position,
not their own, not yet passed), `loadMySwapRequests` (full history,
any status), `loadSwapRequestsForManager` (pending-approval first, then
open, then completed/declined, cancelled excluded), `loadUnseenSwapCount`
(same "no notificationSeen row = never visited = everything unseen"
convention as the leave badge, sharing that table's new `"swap_requests"`
section -- only counts requests that have been RESPONDED to, since an
untouched `open` request doesn't need a manager's attention yet),
`loadSwapStatusByAssignmentForWeek` (feeds the grid's blue/green ring,
same derived-at-read-time pattern as `onLeave`/`vacatingSoon` in
`loadWeeklyPlan.ts`).

**Write side (`lib/actions/swap.ts`):** `createSwapRequest`
(useActionState shape, re-validates ownership/publish-status/date
server-side rather than trusting the picklist), `cancelSwapRequest`,
`acceptSwapRequest` (re-checks position eligibility, same-day/period
double-booking, and leave overlap server-side; branches on the 3-day
threshold via a new `daysBetween()` helper in `weekMath.ts`),
`approveSwapRequest`/`declineSwapRequest` (managers only).
`completeSwap()` -- the actual plan+roster reassignment plus the
finalized-shift refusal -- lives in a separate, plain (non-`"use
server"`) module, `lib/schedule/completeSwap.ts`: exporting it from the
`"use server"` actions file would have made it a client-callable Server
Action with none of the authorization checks its callers do, so it's
kept as an ordinary importable function instead, reachable only through
`acceptSwapRequest`/`approveSwapRequest`.

**UI:** `/schedule/swaps` (manager inbox, mirrors `/schedule/leave`'s
shape, Approve/Decline buttons only on `pending_manager_approval` rows)
plus a new shared `MarkSeenOnMount.tsx` moved up to the `/schedule`
level (now used by both `/schedule/leave` and `/schedule/swaps`,
previously lived under `leave/` only). `/me/schedule` gained a "Shift
swaps" panel (offer form + open-requests-you-can-accept + your own
request history with Cancel). The Schedule hub picked up a "Shift
swaps" tile, and -- fulfilling the queued leave-card-badge ask from
earlier -- both the "Leave requests" and "Shift swaps" tiles now show
their own unseen-count badge, reusing the exact counts that already
power the nav pill. The nav's single red pill on "Schedule" now sums
leave + swap unseen counts (`unseenScheduleCount`, renamed from
`unseenLeaveCount`) rather than adding a second badge -- confirmed:
no new nav entry.

**Bug caught during verification, fixed before shipping (same bug
class as the leave-requests badge, in a new place):** `respondedAt`/
`decidedAt` were first written via JS `new Date().toISOString()`, but
`notificationSeen.lastSeenAt` is written via SQLite's own
`current_timestamp` (see `notifications.ts`). Comparing those two
string formats with `>` doesn't sort correctly -- this time in the
OTHER direction from the leave bug: since ISO always sorts above SQL
format lexicographically, the swap badge would never have cleared at
all, regardless of whether a manager visited. Fixed by writing
`respondedAt`/`decidedAt` via `sql\`(current_timestamp)\`` too, matching
`lastSeenAt`'s format.

Verified: `eslint`/`tsc --noEmit` clean (the same pre-existing findings
confirmed via `git stash` -- `NavBarClient.tsx`'s unrelated
`set-state-in-effect`, two unescaped-apostrophe findings that predate
this change), `next build` clean (new route `/schedule/swaps`), 71/71
tests pass, and a 22-check direct-DB verify script (deleted after use,
confirmed idempotent by re-running it) covering: the day-threshold math,
the swappable/acceptable eligibility filters (including the
position-mismatch and self-request exclusions), `completeSwap`'s
reassignment logic with and without a real shift present, the
finalized-shift refusal (and that it leaves `shiftRosterEntries`
untouched), the grid loader's pending/completed status + requester name,
decline-reverts-to-requester, the unseen-count round trip (unseen ->
visit clears it -> a new response after the visit brings it back), the
manager list's sort order and cancelled-exclusion, and full-history
retrieval for the requester. Also manually smoke-tested against a real
`next start` server: the Schedule hub showed both tiles' badges with
the right counts, the nav pill showed the correct combined total,
`/schedule/swaps` rendered the open request, and `/me/schedule` (staff
session) rendered its own posted request in the Shift swaps panel.

**Not built:** the manager-approval decision itself isn't tested via a
real signed-in POST to the server action in this round (Next.js Server
Actions aren't easily invokable from a plain script the way a page GET
is) -- covered instead by direct-DB tests of the exact same logic
`approveSwapRequest`/`declineSwapRequest` execute, plus rendering
smoke-tests. Photo/attachment support, a swap history report, and any
kind of "who swaps the most" stat (mentioned as a future idea in
[[project-atlas-future-features-backlog]] item 6) are all out of scope
for this round.

## Month Overview: click-a-date now goes to Preview, not straight into Edit (2026-08-16, same session)

Oliver's ask was terse -- "calendar in monthly overview card after click
date redirect to preview" -- so before touching anything I traced it to
the Schedule Planner's manager-facing "zoom out" calendar
(`/schedule/plan/month`, built 2026-08-11) and confirmed the read with
two quick `AskUserQuestion` checks rather than guessing at the edge
cases:

- A day whose week has already been generated (draft or published) now
  links to the existing read-only Preview page
  (`/schedule/plan/preview?week=...&view=manager`) instead of straight
  into the editable Weekly Plan grid. This matches a rule Oliver already
  set for the weekly grid's own Preview page on 2026-08-11: editing has
  to stay a clearly separate, deliberate action, never something that
  happens by accident while just looking around.
- A day that's still only "projected" (blue dot -- estimated live from
  the recurring template, nobody has clicked Generate on that week yet)
  keeps going straight to Weekly Plan, which shows the "Generate this
  week" button. Confirmed with Oliver: Preview has nothing real to show
  for a week that doesn't exist yet, so routing there first would just
  be a dead-end extra click back to the same place.
- Preview opens to Manager view by default when reached from the
  calendar (confirmed with Oliver) -- Month Overview is manager-only, so
  the diagnostics (understaffed/double-booked/vacancy warnings) are the
  useful default rather than the staff-facing view.

One file changed: `app/(protected)/schedule/plan/month/page.tsx` --
the day cell's `href` now branches on `day.weekStatus` instead of
always pointing at `/schedule/plan`.

Verified: `eslint`/`tsc --noEmit` clean, 71/71 tests pass, `next build`
clean, and a real `next start` smoke test (manager session) confirming
the rendered HTML links generated weeks to
`/schedule/plan/preview?week=...&view=manager` and projected weeks to
`/schedule/plan?week=...`, and that the Preview page itself renders
correctly when reached that way.

## Staff full-week schedule view (2026-08-16, same session)

Oliver: "staff should see all day in a week schedule view as well like
manager diagnose view. but no edit and no understaff sign and other but
can see ring color status so they know someone swap in to their week
and such." Confirmed scope via two quick `AskUserQuestion` checks:
reachable from a new "View full week" link on My Schedule (additive,
alongside the existing single-day click-through, not replacing it), and
following the same roster-visibility restriction already used by the
single-day preview (not a looser rule just because no money is ever
shown on a schedule grid).

New route `/me/schedule/week?week=YYYY-MM-DD` (defaults to the week
containing today, own prev/next-week nav). Renders the exact same
`WeeklyPlanGrid` component the manager's Weekly Plan and Preview pages
use, in `readOnly hideDiagnostics` mode -- the same mode Preview's own
"Staff view" toggle already uses. That mode hides the quick-add/remove
controls and the red under-target background + orange double-booking
badge, but the vacancy (red ring), leave (purple ring), and swap
(blue/green ring) indicators still render, since those were already
designed to be visible to staff, not manager-only diagnostics.

`WeeklyPlanGrid.tsx` moved from `app/(protected)/schedule/plan/` up to
`app/schedule/` (a plain folder, no `page.tsx`, so it adds no route) so
both the manager routes and this new staff route can import the same
component -- same "move it up when a second consumer needs it" pattern
already used for `MarkSeenOnMount.tsx` during the swap-portal work.

New loader `lib/schedule/loadStaffWeeklyPlan.ts` wraps `loadWeeklyPlan`
and filters its `assignments` through `getVisibleRosterEntries`
(`lib/roster/visibility.ts`) -- the same machinery the single-day
preview and My Pay's coworker list already use -- applied ONE DAY AT A
TIME so the existing shift-scoped `grantsManagerAccess` elevation rule
(a staff member covering Floor Manager gets elevated visibility only
for the day(s) they're actually working that position) still holds
correctly across a whole week instead of being computed once. A
standing MANAGER/ADMIN viewing their own `/me/schedule/week` sees
everything unfiltered, same as `getVisibleRosterEntries` itself. Only
published weeks are viewable -- same rule as every other staff-facing
schedule surface.

Position ROWS use a simpler rule than the strict per-day entry filter,
documented as a deliberate simplification in the loader's own comment:
a position stays visible as a grid row all week if it's the viewer's
own primary category, is flagged `alwaysVisibleInRoster`, or has at
least one assignment that survived the per-day filter on any day. No
individual entry is ever shown unless it passed the real per-day check.

Verified: eslint/tsc clean (only the two pre-existing unescaped-
apostrophe findings in `app/me/schedule/page.tsx`, confirmed via `git
stash`), `next build` clean (new route `/me/schedule/week`), 71/71
tests pass, a 19-check direct-DB verify script (deleted after use,
confirmed idempotent by running it twice) covering: null for a
nonexistent/draft week, default-settings category restriction (FOH
staff can't see a BOH-only Monday assignment), the swap ring surviving
the visibility filter on the viewer's own row, the per-day
`grantsManagerAccess` elevation (FOH staff covering Floor Manager on
Tuesday sees BOH that day but still not Monday), a standing MANAGER
seeing everything unfiltered, `showCoworkerListFOH` off restricting
Monday to the viewer's own row while Tuesday's elevation still
overrides it, and `restrictFOHToOwnCategory` off opening the whole
week up. Also a real `next start` smoke test (staff session) confirming
the rendered page has no quick-add/remove controls, no under-target
ratio badges, the ring-color legend, and that the "View full week" link
renders correctly on My Schedule. Commit `30a7496`.

**Not built:** no attempt to surface this same week grid inside the
existing single-day preview page or vice versa -- they stay two
separate, purpose-built views per Oliver's confirmed answer.

## Analytics / P&L, Phase 1 (2026-08-16/17, same session)

Oliver: "i want analytic feature and P&L feature. as you can see in
2026 - c.xlsx. it has chart page and report that summarize expenses and
revenue. like i said before after Youk open we might get basic api key
from toast to link real data. but now i want something that can pull
data on our app and process it." Inspected the referenced reference
workbook (`Atlas/DNA Closing report/2026 - C.xlsx`) via openpyxl -- its
"Chart" sheet shows revenue split Toast vs Online (doughnut) and
expense categories as a % of revenue (Bar/Food/Payroll BOH/Payroll
FOH); its "Report" sheet is a pivot-style category-totals table.
Confirmed scope via two `AskUserQuestion` rounds:

- Nav placement: a new top-level `/analytics` page (not a Reports tab).
- Payroll source: Atlas's own computed shift-wage data, not manual
  ledger entries -- avoids relying on someone re-typing payroll by hand
  and avoids drifting out of sync with what Shifts/Payroll already
  compute.
- Food cost basis: Oliver's answer rejected the two options actually
  offered and specified a three-way split instead, per Aey's explicit
  ask: "Aey want food to separate Food, drinks(soda, soft drink,
  regular drinks at every restaurant has) and bar programs(alcoholic,
  mocktail, bar work related)." Built as three-way, not the two
  originally-offered options.
- Labor cost basis: full employer cost -- base wage + extra pay +
  incentives - deductions, excluding tips (tips are customer
  pass-through, not restaurant spend).
- Phasing: single-period P&L + Analytics snapshot first (this round).
  Oliver's own framing ("at the end it will include year to date, month
  to date. compare month to month, year to year... like charts in
  stocks. have something like payroll vs sales. to find sweet spot...
  online order vs dine in vs takeout") is logged here as the explicitly
  deferred next round, not built now.
- Researched (Oliver's own ask -- "you can do research which metric or
  indicator impact or affect restaurant") industry KPI benchmarks via
  WebSearch/WebFetch to ground this round's "sweet spot" indicators:
  food cost 28-35%, labor cost 25-36%, prime cost 55-65%, net margin
  3-8%, delivery commission 15-30% (source: WhippleWood CPAs Restaurant
  Financial Benchmarks 2026, cross-checked against NOVA Platform, Rezku,
  and owner.com). Bar/alcohol cost is shown as its own line but
  deliberately WITHOUT a benchmark band -- no liquor-specific range was
  part of this round's research, and showing a fabricated band would be
  worse than showing none.

**Schema**: `ledgerCategories.pnlGroup` (new column, enum FOOD /
BEVERAGE_NONALC / BEVERAGE_ALC / OTHER_EXPENSE / EXCLUDED, default
OTHER_EXPENSE) -- a restaurant-configurable classification tag on
categories, following the same design precedent as
`positions.category`/`alwaysVisibleInRoster`/`grantsManagerAccess`,
rather than code that pattern-matches on category name strings (robust
to renaming). The existing PAYROLL BOH/PAYROLL FOH ledger categories
are tagged EXCLUDED -- they're legacy manual entries that would
double-count against the computed shift-wage payroll line, so they're
kept out of the P&L total but their sum still surfaces as
`excludedTotal` on the Analytics page (linking to Expense categories to
re-tag), rather than silently vanishing. A new "Drinks" category was
added (BEVERAGE_NONALC) to support the three-way split. Migration
`0017_unknown_prodigy.sql` (drizzle-kit generate + hand-added backfill
UPDATEs/INSERT, same pattern as `0015_massive_guardian.sql`) --
verified the backfill via a temporary script before deleting it. New
server action `setLedgerCategoryPnlGroup` (`lib/actions/ledger.ts`) plus
a `<select>` per row on `/ledger/categories`
(`SetCategoryPnlGroupSelect.tsx`) and on the add-category form.

**Loaders** (`lib/analytics/`): `loadRevenueBreakdown.ts` is a thin
reshape of the existing `loadSalesTaxReport` (net sales by channel,
Toast + each online platform) rather than a second query, so the two
reports can't drift apart. `loadExpenseBreakdown.ts` is the first
loader in the codebase to sum Petty Cash + Supplier Check + Card
together by category for a date range (each channel's own report only
ever summed by date/payment before this) -- reuses each channel's own
established date-range rule (Petty Cash: logged date; Supplier Check:
payment's `paidDate`, cash basis; Card: statement charge date).
`loadPayrollCost.ts` sums `employeePayouts` (flatWageAmount +
extraPayAmount + incentiveAmount - deductionAmount, excluding
tipPoolShare/hostUpsellTipShare) for finalized shifts in range, split
FOH/BOH via the same "representative position per (shift, employee)"
heuristic `loadSummaryData.ts` already uses. `loadPnL.ts` composes all
three into a full Revenue -> COGS (Food/Drinks/Bar) -> Gross profit ->
Payroll -> Other opex -> Net profit statement, plus 5 benchmarked KPIs
(food cost %, labor cost %, prime cost %, net margin %, bar cost % --
the last unbenchmarked, `status: "not_applicable"`).

**UI** (`app/(protected)/analytics/`): consulted the `dataviz` skill
before writing any chart code, which was explicit that a horizontal bar
(not a donut) is the right form for named-category part-to-whole data
-- a disclosed, deliberate deviation from the reference workbook's
donut style, documented in `BreakdownBarChart.tsx`'s own header. Every
bar carries a direct text label (name + $ + %) rather than relying on
color alone (also mitigates the palette validator's contrast WARN on 3
slots), plus a `<details>` "View as table" fallback, no client JS
needed. `KpiMeterCard.tsx` renders each benchmark as a Meter (skill
guidance: "a single ratio against a limit" is a meter, not a chart) --
a faint band marks the healthy range on the track, status ships as
icon + label + color together, never color alone. `palette.ts` uses the
dataviz skill's documented default palette, colors assigned in fixed
order (never cycled/reassigned by value) so a channel/category means
the same color across page loads; validated via
`scripts/validate_palette.js`. The page itself
(`app/(protected)/analytics/page.tsx`) has This week/month/year presets
plus a custom date range, the 5 KPI meter cards, the two breakdown
charts side by side, the excluded-payroll note, and the full P&L
statement table. Nav entry added to `MANAGER_NAV_ITEMS`
(`NavBarClient.tsx`, between Reports and Settings) and a matching 8th
tile on the role-aware home page (`app/page.tsx`).

Verified: `eslint`/`tsc --noEmit` clean project-wide (fixed two
unescaped-quote findings introduced by this round's own new JSX; the
one pre-existing `NavBarClient.tsx` setState-in-effect warning and the
pre-existing `db/seed.ts` unused-var warning both predate this round,
confirmed via `git diff`), 71/71 tests pass (unchanged), `next build`
clean with `/analytics` registered as a route. A 16-check direct-DB
verify script (deleted after use) confirmed: `loadRevenueBreakdown`'s
total matches `loadSalesTaxReport`'s own net total for the same range;
EXCLUDED categories never appear in the expense breakdown and
`total + excludedTotal` accounts for the full raw sum across all three
channels; expense category shares sum to ~1; payroll FOH + BOH equals
payroll total and matches an independent direct-SQL recomputation;
the full P&L arithmetic (cogs total, gross profit, net profit) holds
exactly; `barCostPct` always reads `not_applicable`; and the KPI
status-band boundary logic (below/at-low-edge/at-high-edge/above)
classifies correctly. Also a real `next start` smoke test using a
session token minted directly for a seeded manager account (deleted
after use): `/analytics` returns 200 and its HTML contains all 5 KPI
cards and both breakdown charts, `/ledger/categories` returns 200 and
shows the new P&L dropdown with Drinks/FOOD/BEVERAGE_NONALC/
BEVERAGE_ALC/EXCLUDED all present, and the home page's rendered HTML
contains the new `/analytics` tile and nav link. Commit `eb7d895`.

**Not built (explicitly deferred, per Oliver's own framing):**
month-to-date/year-to-date figures, period-over-period (MoM/YoY)
trend charts "like stock charts," a payroll-vs-sales "sweet spot"
indicator, and channel-level profitability (online order vs dine-in vs
takeout). Also not built: any Toast/POS API integration -- this phase
is 100% Atlas's own already-captured data, matching what Oliver said
("now i want something that can pull data on our app and process it,"
with the Toast API link explicitly framed as a later step).

## Settings — CC tip deduction rate now a percent, drink bonus gets a $ sign (2026-08-17)

Oliver: "in setting, change cc tip deduction to match tax style. allow
input it as actual %. not as a fraction and also add % sign and drink
tip add $ sign." This was the exact gap v51 (2026-08-15) flagged and
deliberately left untouched ("CC tip deduction rate has the identical
issue but wasn't touched — Oliver's ask was specifically the tax
rate"). Applied the same fix now, plus the drink bonus's $ affordance.

`SettingsForm.tsx`: "CC tip deduction rate" input now takes/shows a
percent (e.g. `4.5`) with a trailing `%` suffix inside the field,
mirroring "Default sales tax rate"'s existing pattern exactly (same
`relative` wrapper, same `pl-3 pr-6`/absolute-positioned unit span).
"Host drink bonus, $/drink" gets a leading `$` inside the field the
same way. `lib/actions/settings.ts`: reads the new
`ccTipDeductionRatePercent` form field, validates it's 0-100, divides
by 100 before writing to `restaurantSettings.ccTipDeductionRate` —
storage/schema and every downstream consumer (`finalizeShift.ts`,
`computeFinalizationPreview.ts`) untouched, they still read the
fraction. Host drink bonus is unchanged numerically (still stored/read
as a raw dollar amount), only the input's visual $ prefix changed.

No schema change, no migration. Verified: `eslint`/`tsc --noEmit`
clean (only the pre-existing unrelated `app/layout.tsx` `LayoutProps`
finding, predates this change), `next build` clean, 71/71 tests pass
(unchanged — no test covered this form's specific field names).

## Payroll — weekly payroll register, export, and sign-off (2026-08-17)

Oliver: "i wanna built staff payroll." Scoped via 3 rounds of
AskUserQuestion before building (per this project's "never assume"
rule, doubly so for anything money-related): a pay-period register +
export (not tax/withholding calc, which is a payroll-processor job, not
Atlas's), weekly cadence reusing Atlas's own already-computed wage/tip
numbers, finalized-shifts-only data source, a lock/mark-as-paid step,
and a 3-sheet export. Opened the real payroll DNA file (" 2026.xlsx",
in Atlas's DNA Closing report folder) directly rather than trusting the
2-day-old memory summary — confirmed its PAYROLL/OUTSIDE/Export/
MyExport/SIGN FORM sheets are exactly a weekly Payee/Amount/Memo
register plus a bilingual wage-acknowledgment form.

**One flag raised and resolved before building:** Oliver's first answer
described the acknowledgment form's original purpose as being "to
trick" undocumented workers — paused and asked for clarification rather
than building that. Turned out to be a typo for "to prevent [the]
restaurant [from] be[ing] tricked" (i.e. a standard wage-receipt,
protecting the employer from later false wage-theft claims) — confirmed
and proceeded. See project_atlas_payroll memory for the full exchange;
worth remembering this kind of ambiguity is worth a pause, not an
assumption in either direction.

**Data model** (migration `0018_mean_expediter.sql`, purely additive):
`payrollPeriods` (weekStartDate/weekEndDate, status draft/paid, paidAt/
paidByEmployeeId, unique on weekStartDate) + `payrollPeriodEmployeeTotals`
(the locked snapshot — one row per employee per paid week, mirrors
employeePayouts' own column shape). A DRAFT week is always computed live
from `employeePayouts` (never stale while still being decided); marking
a week PAID snapshots the exact live numbers at that moment — the same
"compute vs. write" separation as `computeFinalizationPreview.ts`, so
the preview and the locked record can never drift apart. Blocked
entirely unless every shift that exists that week is already finalized
(same rule Ledger/Card already enforce) and there's at least one
employee to pay. An ADMIN can revert a paid week back to draft to
correct it (same override exception as Ledger/Card/Supplier Check),
which deletes the snapshot rows.

**What "payroll" actually is, deliberately**: no new payroll math
anywhere — every dollar comes from `employeePayouts.totalCorePayout`
(wage + extra + incentive − deduction + tip), summed per employee across
a Monday-Sunday week of *finalized* shifts only. Same "don't duplicate
the source of truth" precedent as `loadPayrollCost.ts` (Analytics) and
My Pay — Payroll and Analytics now read the same underlying numbers
through two different lenses (Analytics: FOH/BOH cost, excludes tips;
Payroll: per-employee total including tips, since that's what's actually
paid to the person).

**UI**: `/payroll?week=YYYY-MM-DD` — one page, Prev/Next week nav (same
`weekMath.ts` helpers as Supplier Check's picker), a status pill (Draft
— live numbers / Paid — by X on date), an amber banner naming exactly
how many shifts still need finalizing if the week isn't fully locked
yet, the per-employee table (Wage/Extra/Incentive/Deduction/Tip/Total),
"Mark this week paid" (disabled until every shift is finalized), Admin-
only "Revert to draft" on a paid week, and a Download .xlsx link. Nav
entry added to `MANAGER_NAV_ITEMS` (between Analytics and Settings) and
a matching 9th tile on the home page.

**Export** (`lib/payroll/buildPayrollWorkbook.ts`, ExcelJS, one .xlsx,
3 sheets): "Check Export" (plain Payee/Amount/Memo, one row per
employee, ready for check-printing software — matches the DNA file's
own Export/MyExport shape); "Pay Stub Detail" (one block per employee:
wage/extra/incentive/deduction/tip pool share/host drink bonus/total,
meant to be printed and clipped to the physical check); "Wage
Acknowledgment" (bilingual English/Spanish receipt per employee,
reflecting the real computed amount and week-ending date, with a
signature line). Deliberately dropped the DNA form's meal-break
certification clause — Atlas doesn't track breaks at all, so having
someone sign a certification about something the system never observed
would be putting an unverifiable claim in writing; only the
wage-received certification (which Atlas *can* back with real numbers)
made it in.

**Verified**: `eslint`/`tsc --noEmit`/`next build` all clean on every
new/touched file (the pre-existing NavBarClient.tsx setState-in-effect
warning and 7 other pre-existing findings elsewhere confirmed via `git
stash` to predate this change), 71/71 existing tests pass unchanged
(none of this feature's logic was a good fit for the existing pure-
function test file — it's inherently DB-shaped). Two-part verification
instead: a 9-check pure-DB script (deleted after use) confirmed the live
register total matches an independent SQL sum, an empty week is
correctly empty/unpayable, and a week with an unfinalized shift reports
the right blocking count — and, since `markPayrollPeriodPaid`/
`revertPayrollPeriodToDraft` need a real request-scoped session
(`next/headers`' `cookies()` doesn't work in a standalone script), a
13-check real `next start` smoke test using session tokens minted
directly for a seeded MANAGER (Aey) and ADMIN (Oliver) account (temp
verification route deleted after use) confirmed: blocked-when-
unfinalized, successful mark-paid, snapshot-matches-live-at-lock-time,
blocked double-pay, a non-Admin can't revert, Admin revert clears the
snapshot, and the export workbook builds. Also manually confirmed the
real `/payroll` page renders (status pill, table, Mark paid button,
Download link) against the seeded week.

**Not built (explicitly out of scope this round, per Oliver's own
answer)**: tax/withholding calculation — that's a payroll-processor job
(Gusto/ADP/etc.), not something to build in-house. Also not built:
biweekly/semi-monthly cadence (weekly only, matching the real DNA
process), CSV/direct-deposit-file export (the .xlsx is meant for
check-printing software or a bookkeeper, same as Supplier Check's own
export), and any UI for correcting an individual employee's numbers
within a payroll week (a correction goes through fixing the underlying
shift, then re-finalizing, same as everywhere else money is computed
in this app).
