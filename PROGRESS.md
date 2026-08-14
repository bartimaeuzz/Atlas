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
