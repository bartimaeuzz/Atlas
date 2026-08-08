# Atlas Track 2 — Progress

## Done so far (2026-08-08)

- Next.js + TypeScript scaffold (App Router, Tailwind, ESLint) — dropped
  next/font/google (blocked by the sandbox's network policy), uses system fonts
- Database: SQLite via Drizzle ORM (Prisma dropped earlier for the same reason)
- Full schema in `db/schema.ts` — 23 tables
- `db/seed.ts` — sample data: three-pool tip structure, roster visibility settings
- **Core tip-pool calculation engine** (`lib/calc/tipPool.ts`, `lib/calc/flatWage.ts`)
  — Pool 1 (dine-in), Pool 2 (takeout + platform-courier), Pool 3 (delivery,
  equal split). Exact-cent reconciliation. 13 unit tests.
- **Roster visibility engine** (`lib/roster/visibility.ts`) — STAFF/MANAGER/ADMIN
  roles, category-scoped visibility, leadership pay hard-hidden from staff.
  10 unit tests.
- **UI: `/shifts/[id]`** — plain/utility styling on purpose (logic first,
  cosmetics later). Shows the real roster grouped by pool with EDITABLE point
  values per row (play with "what if Erika were 0.2 instead of 1.0"), resolved
  flat wage per employee (shared FOH rate or individual BOH rate, counted once
  even for employees with two roster rows), a form for the shift's financial
  inputs and host drink bonus counts, a Calculate button that runs the exact
  same tested `calculateTwoPoolTips` function live in the browser, and a
  "Total estimated payout" rollup (tips + wage) per person. No auth or shift
  list/creation yet — just `/shifts/1`, the seeded Dinner shift.
  Verified end-to-end against the real seeded DB, not just isolated unit
  tests: Erika (Host) correctly shows up in both pools with wage counted once,
  Kris's 0.8 point value correctly changes her share, resolved wages sum to
  exactly 500 matching hand-calculation, both pools reconcile exactly to the cent.
- **23 unit tests total, all passing** (`npm test`)

## How to run

**First time only:**
```
npm run setup     # installs dependencies + creates db/atlas.db + loads sample data
npm run dev       # starts the app — open /shifts/1
```

**After that, day to day:** just `npm run dev` again. It keeps running and
hot-reloads as files change — you do NOT need to redo install/db:push/db:seed
every time. Only re-run `npm run setup` if this doc (or I) tells you the
schema or sample data changed, or if you want to reset the sample data back
to its starting point (safe to run repeatedly now — resets ids too, so
`/shifts/1` always stays valid).

```
npm test          # runs all calculation + permission tests, anytime
```

## Not started yet

- Shift list / create-new-shift UI (only the one seeded shift is reachable)
- Editing roster / master data through the UI (all still seed-only)
- Generic Metrics + Incentive Rules engine (schema exists, no logic/UI yet)
- Auth (systemRole field exists on Employee, no actual login system yet)
- Deploy to Vercel
- Validation against real Youk Thai numbers (`2026 - R.xlsx` not yet provided)
