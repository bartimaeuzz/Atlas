---
name: visual-audit
description: "Live, cross-viewport UX/UI audit of the deployed Atlas app (atlas-zeta-sandy.vercel.app) via Playwright — screenshots real rendered screens at desktop and mobile widths and checks them against Atlas's own accessibility/design standards. The live-render counterpart to scrutinize's code-level review: a change can pass tsc/eslint/build/scrutinize and still render wrong (PublishedEditGate.tsx, 2026-08-18 — caught only by a live screenshot). ASK-FIRST since 2026-08-19: Oliver paused the automatic post-deploy run because it is slow and token-heavy, so never launch it unprompted — offer it and wait. Invoke when Oliver asks for a UX/UI check, a design review of the live app, 'does this look right on the real site', or says go on a pending audit; or when a session's task touches UI and project memory shows open visual-audit findings. After a UI-touching deploy the audit is still required before that work is called done — surface it as pending, never skip it silently."
---

# Visual Audit

Screenshot the real, deployed screen — not the code, not a mockup — and check it against Atlas's standing design/accessibility bar. This exists because code-level checks (tsc, eslint, `npm run build`, `scrutinize`) verify that a change compiles and traces correctly; none of them verify that it *renders* correctly. `PublishedEditGate.tsx` hiding an entire schedule table behind an edit-lock passed every one of those checks and was only caught when Oliver looked at a live screenshot.

## Operating stance

- **Outsider, live render only.** Don't read the component source before auditing — look at what actually renders, the way a real user (low computer literacy, on a shared restaurant terminal, phone or desktop) would encounter it cold.
- **Cross-viewport, always both.** Every audited screen gets checked at desktop (1440×900) and mobile (390×844) — Atlas is phone+desktop by hard requirement (`project_atlas_target_users_accessibility.md`), not "responsive as a nice-to-have."
- **Evidence-based, not taste-based.** Every finding cites a specific standard (WCAG success criterion, a cited usability principle, or an explicit prior Atlas decision) — never "this looks off to me."
- **Report shape matches `scrutinize`**, deliberately, for cross-skill consistency — same Finding / Why it matters / Evidence / Suggested change structure, same blocker → major → nit severity order.

## Workflow

### 1. Scope

State in one sentence what's being audited and why (a specific page/flow after a deploy, or a session-start sweep of previously-flagged open findings). If auditing after a deploy, confirm with Oliver (or project memory's Current State block) that the change is actually live before starting — auditing a not-yet-deployed page produces findings against the wrong version.

### 2. Reach the screen

Use the Playwright MCP tools (`mcp__remote-devices__playwright__*` — proxied through the device bridge; confirmed reachable from Cowork sessions as of 2026-08-18, no `claude-in-chrome` fallback needed) against the live URL: **`atlas-zeta-sandy.vercel.app`**. For authenticated flows, use the seed test accounts: **test admin / test manager / test staff, all PIN `0000`** (seed/test data only, same caveat as every other Atlas seed account). Navigate at both viewport sizes; take a screenshot at each before evaluating.

### 3. Complete UI States checklist

Don't just check the screen in whatever state it happens to load in — a real gap nothing else in Atlas's process forces today. Where applicable to the screen being audited, check:

- **Empty** — no data yet (the seed test accounts currently have no shifts/leave/swaps, so this is the state you'll hit most often; note explicitly in the report if a state below couldn't be exercised for this reason)
- **Loading** — the moment between action and result (submit → redirect, save → confirmation)
- **Populated** — real/representative data, not just one row
- **Error** — a failed submission, a validation failure, a network hiccup
- **Disabled / locked** — a control that's intentionally inert (e.g. a published-week field, a visible-but-disabled Settings item)
- **Interactive states** — hover, focus, active — especially focus: keyboard-only navigation must show a visible focus ring on every interactive element

### 4. Check against Atlas's standing bar

Pull these from `project_atlas_target_users_accessibility.md` and `project_atlas_ui_design.md` rather than restating generic heuristics — Atlas already has specific, cited standards:

- **Touch targets — three-tier standard, not a single number.** WCAG 2.5.8's 24×24 CSS px is the legal floor (a control below this is a blocker, full stop). Apple's 44×44pt and Google's 48×48dp are comfort recommendations, not legal minimums — a control between 24 and 44px is a major/nit judgment call depending on how central the action is, not automatically a blocker. Measure the actual clickable/tappable area, not just the visible glyph — a small icon inside a larger padded button often passes even when the icon itself looks tiny.
- **Error prevention over error messages** (Nielsen's 5th heuristic, poka-yoke). Prefer: disabled submit until required fields are filled, inline validation before submit, typed-word/PIN confirmation before anything that locks or deletes a record. A validation message that only names *one* of several empty required fields is a real defect (found and still open on `/login`, 2026-08-18) — check that every error message accounts for every actual problem, not just the first one checked.
- **Low computer literacy / foolproof wording.** Plain language over technical terms ("PIN," "Reconciliation," "Finalize," "Danger Zone" are worth a second look, not assumed fine because a developer understands them). One obviously-correct next action per screen. Minimize free typing where a pick-from-a-list or tap-a-button pattern would do.
- **Design-system-v2 token adoption.** Flag raw hardcoded colors/spacing, ad hoc modals, or a bare `window.confirm()`/`window.alert()` where the design system's `Button`/`Card`/`Banner` primitives exist and should be used instead — these are real, previously-found bug classes (`PayrollActions.tsx`, `PublishWeekButton.tsx` before its fix), not hypothetical.
- **Never color-alone.** Status/warning/danger states need a text or icon signal alongside color, not color as the only carrier of meaning.
- **Keyboard/dismiss basics.** Menus and modals should close on Escape and not overlap or trap content at narrow widths — a real, found-and-still-open gap (account menu at 390px, 2026-08-18).

### 5. Report

One tight section per finding, ordered blocker → major → nit — identical shape to `scrutinize`:

- **Finding** — one sentence, specific. Name the exact control/screen and the viewport(s) it reproduces at.
- **Why it matters** — the consequence for the actual target user (low computer literacy, on a shared terminal, phone or desktop), not just "this violates rule X."
- **Evidence** — the cited standard (WCAG SC number, named heuristic, or prior Atlas decision) plus what the screenshot/interaction showed.
- **Suggested change** — concrete, minimal, and consistent with the existing design-system tokens/components rather than inventing new ones.

Close with a one-line verdict (ship / fix-then-ship / rework) and note explicitly which UI states (step 3) could and couldn't be exercised, so a future audit knows what's still unverified rather than assuming full coverage.

## Atlas project notes

Sibling to `scrutinize`, not merged into it — different modality (live browser/screenshot vs. code trace) and different report inputs, though the output shape is kept identical on purpose. Points at the one live deployment, `atlas-zeta-sandy.vercel.app` — there is no separate staging URL.

**When to run, two triggers, not one:**

1. **Reactive, ask-first (introduction.md rule #8, revised 2026-08-19):** any UI-touching change, once Oliver confirms it's pushed and live, needs a `visual-audit` pass on the affected page/flow before that work is called done — but **he starts it, you don't.** Say the audit is pending, offer to run it, and wait. The requirement did not go away; only the automatic launch did (slow, token-heavy — see `feedback_atlas_visual_audit_on_demand.md`). Two failure modes to avoid, in both directions: silently skipping the audit and calling UI work done, or burning a long Playwright run he didn't ask for.
2. **Proactive, at session start:** if today's task touches UI at all, check `project_atlas_visual_audit_skill.md` (and any newer audit-record memory files) for findings still marked open, and either fix/re-verify them or explicitly carry them forward — don't let a fresh session silently forget a known live bug just because it wasn't the thing being worked on. This is what closes the gap `atlas-start` alone doesn't cover: `atlas-start` re-establishes *code/deploy* ground truth every session, this is the equivalent for *rendered* ground truth.

**Open findings live in project memory, never in this file.**

Read `project_atlas_visual_audit_skill.md` — plus any dated audit-record
file such as `project_atlas_visual_audit_2026-08-21_ledger_analytics.md`
— for the current open list. Do that at the start of every audit, and
write new findings back there when one finishes.

This section used to hard-code a findings list. It was removed
2026-08-21 after Oliver spotted it, and the reason is worth keeping: a
findings list is *mutable state*, and a skill file is a *frozen
artifact* that only changes when someone repackages and re-saves it. The
two drift apart immediately and silently. By the time it was removed, the
embedded 2026-08-18 list had three of its four entries already fixed —
`/login`'s Forgot PIN tap target (fixed the same day it was written,
`TAP_TARGET_PAD` in `LoginForm.tsx`), the account menu's Escape handling
(`NavBarClient.tsx`), and the login empty-form validation (both fields
now use native `required`) — while three later audit rounds' worth of
real findings were absent entirely. A fresh session reading it would have
re-investigated fixed bugs and missed live ones.

The general rule, which applies to every skill here: **a skill encodes
method, not state.** Standards, thresholds, and procedure belong in the
skill; anything that changes as work gets done — open bugs, current
commit, what shipped last — belongs in project memory, and the skill
should point at it rather than copy it.

**Coverage gap, standing caveat:** the seed test accounts have no shifts/leave/swaps data, so every audit run so far has only exercised empty states — see step 3 above and `project_atlas_qa_seed_data.md`. Don't report "populated state: fine" unless it was actually exercised with real data.

**Availability check, standing caveat (added after this skill went missing from the active skill list once already):** this skill has to actually be saved to run at all. If asked to run a visual audit and this skill doesn't appear to be active, say so plainly rather than attempting the audit some other way — flag it as its own finding ("visual-audit itself isn't currently installed") rather than silently skipping the check.

[[project-atlas-scrutinize-skill]] [[project-atlas-target-users-accessibility]] [[project-atlas-ui-design]] [[project-atlas-visual-audit-skill]] [[project-atlas-qa-seed-data]]
