---
name: scrutinize
description: Outsider-perspective end-to-end review of a plan, PR, or code change. First questions intent and whether a simpler/more elegant approach would achieve the same goal, then traces the actual code path (not just the diff) to verify the change does what it claims. Output is concise, actionable, and every call carries its rationale. Trigger on /scrutinize and proactively whenever the user asks to review, audit, sanity-check, or get a second opinion on a plan, PR, diff, design doc, or proposed code change.
---

# Scrutinize

Stand outside the change and ask whether it should exist at all, then verify it actually does what it claims end-to-end.

## Operating stance

- **Outsider.** Forget who wrote it and why they think it's right. Read the artifact cold.
- **End-to-end, not diff-local.** The diff is the entry point, not the scope. Follow the call graph through real code paths.
- **Actionable, concise, with rationale.** Every finding states *what to change*, *why*, and *what evidence* led you there. No filler, no restating the diff back.

## Workflow

Run these in order. Do not skip ahead.

### 1. Intent — what is this actually trying to do?

- State the goal in one sentence, in your own words. If you cannot, the artifact is underspecified — say so and stop.
- Ask: **is there a simpler, smaller, or more elegant way to achieve the same goal?** Consider:
  - Doing nothing (is the problem real / load-bearing?).
  - Using something that already exists in the codebase instead of adding new surface.
  - A smaller change that solves 90% of the goal with 10% of the risk.
  - Solving it at a different layer (config vs code, framework vs app, build vs runtime).
- If a better alternative exists, name it explicitly with rationale. This is the most valuable thing you can output — surface it before the line-by-line review.

### 2. Trace — walk the actual code path

- For each behavior the change claims, trace the path end-to-end through the real code, not just the lines in the diff:
  - Entry point → call sites → branches taken → state mutated → exit / return / side effect.
  - Include the unchanged code on either side of the diff. Bugs hide at the seams.
- For a plan or design doc: trace the proposed flow against the existing system. Where does it touch reality? What does it assume that isn't true?
- Note every place the trace surprises you (unexpected branch, dead code reached, state you didn't know existed). Surprises are signal.

### 3. Verify — does it actually do what it claims?

For each claim the change/plan makes, answer:

- **Does the code path you just traced actually produce that behavior?** Walk it explicitly. "It claims X. Path: A → B → C. At C, [observation]. Therefore [holds / doesn't hold]."
- **What inputs / states would break it?** Edge cases, concurrent callers, error paths, partial failures, retries, empty/null/unicode/huge inputs, ordering assumptions.
- **What does it silently change?** Performance, error semantics, observability, contract for other callers, on-disk / on-wire format.
- **How is it tested?** Do the tests actually exercise the traced path, or do they pass while skipping it (mocks that hide the bug, asserts on intermediate state, happy path only)?

### 4. Report

Output one tight section per finding. Order by severity (blocker → major → nit). For each:

- **Finding** — one sentence, specific. Cite `file:line` when applicable.
- **Why it matters** — the consequence, not the principle.
- **Evidence** — the trace step or input that exposes it.
- **Suggested change** — concrete, minimal.

Close with a one-line verdict: ship / fix-then-ship / rework / reject — with the single biggest reason.

## Operating rules

- **No rubber-stamps.** "LGTM" is not an output. If you genuinely find nothing, say what you traced and what you checked, so the user can judge whether your review covered the surface they cared about.
- **Cite or it didn't happen.** Every claim about the code references a specific path, file, or line. No vague "this might break under load."
- **Distinguish claim from verification.** "The PR says X" and "I traced X and confirmed / refuted it" are different — keep them separate in the output.
- **One simpler-alternative pass is mandatory.** Even on small changes, spend one breath asking if the whole thing is necessary. Skip only if the user explicitly says "don't question scope."
- **Don't pad with style nits when there's a structural problem.** If step 1 or step 2 surfaces a real issue, lead with it; defer nits or drop them.
- **No flattery, no hedging.** "This is a great PR but..." adds nothing. State the finding.

## Atlas project notes

Source: thananon/9arm-skills (`skills/engineering/scrutinize`), adopted for Atlas Track 2 code review. This slots into the project's existing "confirm before building, then verify before shipping" rule (introduction.md §Non-negotiable operating rules #2) as the *verify* half — it does not replace `npm test` + `npm run build` + direct-DB checks, it runs alongside them, before a delivery zip goes to Oliver.

Trigger this explicitly (not just on request) for:

- Any change to tip pool splits, wage calculation, or anything that becomes a locked/finalized payroll record — these are the costliest-mistake category per `LESSONS.md` (Money, data, database) and the archived HANDOFF mistake log, and step 3's "what inputs/states would break it" pass is exactly the kind of scrutiny that category needs.
- Any change to roster-visibility or permission logic (`rosterRestrictFOHToOwnCategory`/`BOH`, `rosterShowCoworkerListFOH`/`BOH` and similar settings) — these have a history of subtle scope bugs (see `LESSONS.md` and the archived HANDOFF mistake log entries on vacancy-cascade scope, ring-date comparisons).
- Before zipping and handing off any non-trivial feature, as a last pass distinct from the test/build check — scrutinize catches "does this do what it claims," which passing tests don't guarantee if the tests themselves only exercise the happy path.
- On any plan/design doc before it's confirmed with Oliver, per rule #1 ("never assume") — running the Intent step surfaces scope assumptions before they get built and become rework.

Do not use it to replace asking Oliver when something is a business/product call, not a technical one — scrutinize's "simpler alternative" pass is about implementation approach, not about deciding scope on Oliver's behalf.

### Read LESSONS.md first (added 2026-09-04)

Before reviewing, open `LESSONS.md` in the Atlas project memory and read the section matching the change (money/data, permissions, screens, forms, process). Every line there is a mistake class we already paid for; check the diff against them before anything else.

### Standing checks for prose a future session will trust (added 2026-08-18 for design/plan docs; widened 2026-08-24 to handoffs and memory state notes — see `feedback_atlas_verify_against_live_code.md` and `feedback_atlas_granularity_scope_creep.md` in project memory)

Run both of these explicitly whenever the artifact under review is prose rather than a code diff — a plan, a design doc, a session handoff, or a memory/state note. Anything a future session will read and act on counts; they've each caused real fixes repeatedly, which is what promoted them from one-off findings to standing checks:

- **Live-code verification.** Prose reviewed from memory alone is not verified — only checked for internal consistency. Before it can be marked CONFIRMED, every checkable claim (line numbers, "X is still unwired", counts, DB state) must be checked against the actual current repo/database. This class of gap has already cost one full corrective pass (2026-08-16, the `design-system-v2` foundation check found 5 real gaps invisible from memory alone: a raw `window.confirm()`, a duplicated ad hoc modal, inconsistent `<select>` styling, hardcoded colors outside the token system), recurred 2026-08-18 (UI Design's tier-2 additions), and recurred again 2026-08-24 on a session HANDOFF: a scrutinize loop over the end-of-day state note found a wrong commit count, line references one day stale, and a "still unwired" claim about `FA_SUPPLIER_CHECK_EDIT_LOCKED` that the code had already fixed — a future session would have re-investigated a closed item and trusted dead line numbers. Handoffs rot exactly as fast as design docs. If the reviewing session genuinely has no repo access, say so explicitly and mark the artifact DESIGNED-NOT-CONFIRMED rather than shipping it as verified.
- **Granularity/scope-creep boundary.** Any new pattern that introduces per-item, per-account, or per-action configurability or annotation (permission flags, per-item expiry, inline disclosure text, etc.) must state an explicit, bounded rule for exactly which cases it applies to. An open-ended "this could reasonably apply almost anywhere" design is a defect to flag, not a style choice to let slide — treat "could this apply to everything?" as a required question during the Intent step. This exact failure mode has already required a fix twice in one week (Permission System capability granularity, UI Design's tier-2 consequence-disclosure).

### Standing check for permission / access-control changes (added 2026-08-21)

- **Gate the data, not the page.** Whenever the artifact under review adds, moves, or relaxes a permission gate, do not stop at the surface the change is about — enumerate every door onto the same data and check each one. Five that have actually been missed on this codebase, all in one review: **(1) Route handlers.** `find app -name route.ts`. Next.js layouts wrap page renders only, so a `route.ts` under `app/(protected)/` is NOT protected by that folder's guard — Atlas shipped four `.xlsx` export endpoints with zero authentication this way, including `/payroll/export`, live for four days. Note `requireManager()` is also wrong there: it `redirect()`s, and a download client follows the redirect and saves the login page as a `.xlsx`. **(2) Second readers** — grep the *loader function name*, not the page name, to find every page rendering the same data (`/reports` served the Ledger data `/ledger` had just been gated on). **(3) Second writers** — grep the *table name* in `lib/actions/` (`/positions/[id]/edit` still rewrote `positionTipPools` behind a coarse gate, bypassing a read-only board). **(4) Derivable values** — if A and B stay on screen and A×B reconstructs the hidden number, the gate is cosmetic; say so rather than letting it pass (hiding a P&L table while showing revenue and prime-cost %). **(5) Non-form controls** — `<fieldset disabled>` only disables form-associated elements; drag-and-drop on a `<div>`, click handlers on non-inputs, and anchor links all survive it. Promoted on a *first* occurrence rather than the usual second, at Oliver's call, because the cost of the miss (payroll data publicly downloadable) is out of proportion to the cost of the check. See `feedback_atlas_gate_the_data_not_the_page.md`.

### Standing checks added 2026-08-25 (Oliver's wrap-up sign-off)

- **Indicator coverage over the full enum.** When the artifact adds or touches status indicators, list the state machine's full enum from the schema and check every state is rendered — or the omission is written down as deliberate. Promoted after two same-day misses: open swap offers were invisible on the Weekly Plan (only pending/completed had indicators), and REASSIGNED shipped without the box ring/tooltip every sibling status had. See `feedback-indicator-coverage-over-full-enum` in project memory.
- **Scripted edits must assert every site.** If the change was produced by scripted find/replace, verify each replacement asserted its match count and grep-count the touched prop/function's call sites against the expectation — an unasserted replace that matched nothing shipped a feature present on phone and silently absent on desktop the same day. See `feedback-scripted-edits-must-assert-every-site`.
- **New calendar/grid surfaces check against the design-conventions note.** `project-atlas-design-conventions-2026-08-25` in project memory is the locked visual language (fills vs badges, today marker, card shells, cell stacking, quick-add gates); a schedule surface that deviates is a finding, not taste.

### Standing check added 2026-08-27 (Oliver's sign-off, second occurrence)

- **Run any new match/grouping/validation rule against existing prod rows before shipping.** When the artifact introduces or reshapes a rule that classifies existing data — what counts as "matched", which group a row files under, what "valid" means — query the live DB read-only for the rows the rule will actually see, and count the ones that flip status or fall through to a default branch. Migrate them, handle the fallthrough in code, or name them in the ship note with the manual fix. Tests, tsc, build, and a live click-through of NEW data are all structurally blind to this class. Promoted after two occurrences: the Card two-sided reconcile stranded 2 of 4 prod periods typed as net totals (2026-08-25), and the person-picker grouping filed Pop — Floor Manager assigned, primary NULL — mid-FOH with no role line (2026-08-27, caught post-ship by visual audit instead of pre-ship by this check). See `rule-shape-changes-strand-legacy-rows` in project memory.

### Standing check added 2026-09-04 (Oliver's sign-off, second occurrence)

- **A new surface copies the tier its data already has.** Before accepting the capability chosen for a screen that displays existing data, grep for where that data is *already* shown, read the gate on that page, and check the new screen mirrors it — **per field, not per feature**. A tier reasoned out from first principles is a second opinion competing with a decision somebody already made carefully, and when the two disagree the new screen wins silently, because it is the one nobody audits. Promoted after the second occurrence of the same family: the first (2026-08-21) was a gate relaxed with four doors left open around it; the second (2026-09-04) was its mirror — the schedule's per-day labor figure correctly took `VIEW_ANALYTICS` for the *percentage* and would have shipped the day's *net sales in dollars* at the same tier, while `app/(protected)/analytics/page.tsx` withholds revenue dollars below `VIEW_PNL` (`showAmounts={canSeePnL}`) precisely because revenue × the still-visible prime-cost ratio reconstructs the bottom line. Seven daily sales figures are one week of revenue. Two numbers in one component belonged on opposite sides of the line. See `feedback_atlas_gate_the_data_not_the_page.md`.

### Standing check for prefilled form fields (added 2026-09-04, Oliver's sign-off, second occurrence)

- **A `defaultValue` is a write, not a view.** Any form field prefilled from stored data must post back exactly what is stored — never rounded, formatted, truncated, or locale-rendered. Format in the read-only text beside the box, not in the box. Trace the round trip on every such field: save untouched → what lands in the column → reload → is it the same value? Promoted after the second occurrence of one class, a form handing back something other than what it holds: the first (2026-08-31) was `shiftSales.salesTax`, whose null-means-auto contract died on the first save because the writer stored the prefilled suggestion as an explicit number — tax frozen at a stale value while Total sales moved, found by Aey from live screenshots. The second (2026-09-04, caught pre-ship on the sales-targets form) was its mirror: the reader rendered each stored target as `String(Math.round(value))`, so a $3,800.50 target became $3,801 the next time anybody saved the form for an unrelated reason. Both are invisible to tsc, eslint, tests and a first-visit click-through — the bug needs save → reload → save again, a sequence nobody scripts. Sweep signature: `grep -rn "defaultValue=" app components` and read each one for a transform between the stored value and the box. See `feedback-suggestion-fields-must-round-trip-null`.

### Standing check for UI-touching changes (added 2026-08-18, this session)

- **Visual-audit coverage.** When the artifact under review touches UI — new screen, restyle, layout change, anything a real user would see differently — check whether the `visual-audit` skill has run against the live change, or is explicitly planned before ship. Passing tsc/eslint/build and this skill's own code-path trace does not mean it renders correctly: `PublishedEditGate.tsx` (2026-08-18) passed every one of those checks and still hid an entire schedule table behind an edit-lock — only a live screenshot caught it. If `visual-audit` hasn't run and isn't currently an active/saved skill, flag that as a finding in its own right (a design bar the project holds itself to only works if the tool that enforces it actually exists) rather than silently proceeding without it.
