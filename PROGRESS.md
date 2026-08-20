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
