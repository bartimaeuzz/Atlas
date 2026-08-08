# Atlas Track 2 — Progress

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

## Known gap — not wired in yet

The host cocktail/mocktail drink bonus (qualifying-drink-count × $/drink,
pulled off the top of Pool 1) exists in `lib/calc/tipPool.ts` and the
playground calculator, but is **not yet captured anywhere in the persisted
closing-report flow** — `finalizeShift` always passes an empty bonus list.
No schema field currently holds "qualifying drink count" for a real saved
shift. Needs a decision on where that count gets entered/stored before it's
wired into `finalize`.

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
- Generic Metrics + Incentive Rules engine (schema exists, no logic/UI yet)
- Host drink bonus persistence (see "Known gap" above)
- Auth (systemRole field exists on Employee, no actual login system yet)
- Deploy to Vercel
- Validation against real Youk Thai numbers (`2026 - R.xlsx` not yet provided)
