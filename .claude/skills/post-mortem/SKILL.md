---
name: post-mortem
description: Write the canonical engineering record of a fixed bug — root cause, mechanism, fix, validation, and how it slipped through. Engineer-audience, code identifiers welcome. Use after a debug session lands a fix, before closing it out. Trigger on /post-mortem, when the user says "write the post-mortem / postmortem / RCA / root cause analysis", "document this fix", "write up the root cause", "close out this bug with a writeup", or hands you a fixed-and-validated bug and asks for the writeup.
---

# Post-mortem

The canonical engineering record of a bug fix. Written **after** debugging lands a real fix, **for** other engineers (and future-you, who will have forgotten everything in 6 months). Code identifiers are welcome here — this is the artifact that lets the next person recover the mental model fast.

Pairs with `debug-mantra`: that skill's breadcrumb ledger (step 4) is this skill's raw material.

## When to invoke

- "/post-mortem"
- "write the post-mortem / postmortem / RCA / root-cause analysis"
- "document this fix" / "write up the root cause" / "close out this bug with a writeup"
- After a debug session has clearly landed a fix, proactively offer to draft one.

## When NOT to use

- **Bug not fixed yet, or fix not validated.** A post-mortem of a hypothesis is misleading. Refuse and tell the user what's missing.
- **Customer/production-visible incident with money impact** (wrong payout already sent, wrong tip pool already finalized). Those need Oliver's direct sign-off on remediation before any writeup — flag and confirm scope before producing one.
- **Trivial fix** (typo, obvious one-liner). A one-line note is the record. Don't manufacture ceremony.

## Required inputs — refuse to draft without these

Before writing a single line, confirm all four. If any are missing, list what's missing and stop:

- [ ] **Reliable repro** exists (not "happens sometimes" — a deterministic or high-rate-flake repro the next person can run).
- [ ] **Root cause is known** (the mechanism is identified, not a hypothesis).
- [ ] **Fix is identified** (file/commit pointer, or the delivered zip version it shipped in).
- [ ] **Fix is validated** (the original repro now passes; `npm test` + `npm run build` clean; a direct-DB check if the change touched money/data, per introduction.md rule #2).

## Structure

Use these blocks in this order. **Summary, Root cause, Fix, and Validation are mandatory.** The rest are conditional but usually present.

### 1. Summary _(mandatory)_
One paragraph. What broke, in user/workload terms. What fixed it, in one sentence. Version tag (e.g. v59), owner. A reader who stops here should have the right answer.

### 2. Symptom
What was actually observed. Oliver's bug report in his own words if that's the source, plus any error message, log line, or screenshot. Concrete identifiers — don't paraphrase the failure mode.

### 3. Root cause _(mandatory)_
The actual bug mechanism. **Code identifiers welcome and expected** — function names, file paths, route names, schema fields, branch conditions, commit SHAs. Walk the cause chain end-to-end. This is the most expensive section and the reason the post-mortem exists at all.

### 4. Why it produced the symptom
Link the root cause to the symptom. Often non-obvious. Walk the chain so a reader who only knows the symptom can connect it back to the cause without re-deriving it.

### 5. Fix _(mandatory)_
What changed and **why this change addresses the root cause** rather than hiding the symptom. Reference file paths / commit. If a previous fix attempt papered over the symptom, name it and explain what was wrong with it — that history is part of the cause.

### 6. How it was found
Short. The debugging path: what repro made it deterministic, what cracked it (debugger, source tracing, instrumentation — `debug-mantra` step 2 cascade), hypotheses tried and rejected with the one-line reason each, the single experiment that confirmed the cause.

### 7. Why it slipped through
What allowed this bug to reach `main` / the delivered zip / production. Pick the real reason: no test exercises this path, latent code broken by a later unrelated change, a real workload/data shape never hit before, an incomplete prior fix, a review miss. If the honest answer is "no good reason — should have caught this," say so. **Blameless** — describe the gap, not who wrote it.

### 8. Validation _(mandatory)_
How we know the fix works, concretely: which test now passes, `npm run build` result, direct-DB check performed (and on what — seed data vs. a manually constructed edge case), which version/zip it shipped in. State validation coverage honestly — if only one scenario was tested, say so.

### 9. Action items / follow-ups
Concrete next-steps that aren't in the fix itself: regression test added, related code path to audit, doc/memory update needed. If none, write *"None — the fix is sufficient and no class-of-bug follow-up is warranted."* Don't manufacture action items to look thorough.

## Tone

- **Code identifiers are first-class.** Keep function/route/schema names, file paths, commit SHAs — they're the index for grepping back to the change.
- **Mechanism over narrative.** Don't soften into "a calculation issue" — say which function used which field under which condition.
- **Active voice, concrete subjects, short paragraphs.**
- **No hedging.** "We believe" / "appears to" / "may have" — drop. State it or don't write it.
- **Blameless.** Describe the bug, the gap, and the fix. Never "X should have caught this."
- **No advocacy.** A post-mortem records what happened and what's next. A refactor pitch is a separate proposal, linked from action items.

## Output flow

1. **Confirm all four required inputs are satisfied.** If any are missing, list them and stop. Do not draft.
2. **Confirm where it goes.** For Atlas, default destination is a project-memory topic file (feedback/project type per this project's memory conventions) — HANDOFF.md's §7 mistake log entries are one-line summaries, not full post-mortems, so a full writeup belongs in memory with a one-line pointer added to the mistake log, not pasted into HANDOFF.md in full. Ask Oliver if he wants it in HANDOFF.md instead for a given bug.
3. **Produce the draft** as a single chat block.
4. **Sign-off before saving.** Wait for Oliver's explicit go-ahead before writing it to memory or HANDOFF.md.

## Rules

- **Refuse to draft without all four required inputs.** A post-mortem of a hypothesis is worse than no post-mortem.
- **Never invent root cause, validation runs, or action items.** If a section's facts aren't there, ask. Don't fill the gap with plausible prose.
- **Never strip code identifiers.** They are the index.
- **Blameless.** Describe gaps and bugs, never people.
- **State validation coverage honestly.** Implying broader coverage than you actually checked is the failure mode that breeds repeat regressions — especially costly here given Atlas's money-math mistake history.
- **Get sign-off before saving to memory or HANDOFF.md.**
- **One iteration is normal, three is a smell.** If still revising on the third pass, ask what specific section is wrong.

## Atlas project notes

Source: thananon/9arm-skills (`skills/engineering/post-mortem`), adapted for Atlas — original targets JIRA-comment output; here the destination is project memory (+ optional HANDOFF.md pointer) since Atlas has no ticket tracker. Reserve this for the bugs worth a full record: anything in the money-math or roster-permission mistake categories, or anything that took real debugging effort to nail down. A one-line HANDOFF.md mistake-log entry is still enough for small, obvious fixes — don't over-formalize those.
