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

## Not started yet

- Full Incentive Rules evaluation engine (conditions/targets/weights/reward dispatch) — host drink bonus (above) uses the engine's storage tables directly with hardcoded reward logic, not a generic evaluator yet
- Auth (systemRole field exists on Employee, no actual login system yet)
- Deploy to Vercel
- Validation against real Youk Thai numbers (`2026 - R.xlsx` not yet provided)
