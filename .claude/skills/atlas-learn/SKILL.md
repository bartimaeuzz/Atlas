---
name: atlas-learn
description: "MANDATORY — run this automatically immediately after every scrutinize pass on Atlas finishes, whether it came back clean or found blockers, before the task is marked done. Closes the learning loop: extracts durable lessons from what scrutinize just found, saves them to project memory, and — when the same class of mistake has now recurred a second time — proposes promoting it to a permanent rule in introduction.md or into scrutinize's own checklist so it gets caught automatically next time instead of rediscovered from zero. Also trigger on /atlas-learn, 'capture lessons', 'update the learning loop', 'what have we learned', or when Oliver asks what's been learned recently. This is not optional bookkeeping — skipping it silently breaks the loop and the same bug class comes back next session."
---

# Atlas Learn

The third stage of a three-stage loop: **Build → Scrutinize → Learn.** Scrutinize catches problems in the artifact in front of you. This skill catches problems in *the process that produced it* — so the next session starts one bug-class smarter than this one did, instead of starting from zero every time.

Pairs with `scrutinize` (this skill's raw material is scrutinize's finding list) and `post-mortem` (same underlying idea — durable lesson over one-off fix — applied to debugging instead of review).

## When to invoke

- **Automatically**, right after any `scrutinize` pass finishes on Atlas — pass or fail, blockers found or not — before the containing task is marked done. Don't wait to be asked.
- `/atlas-learn`
- Oliver asks "what did we learn", "capture lessons", "update the learning loop", "has this happened before"

## When NOT to invoke

- Scrutinize is still mid-review. This runs on a *finished* finding list, not a partial one.
- The pass came back completely clean **and** nothing about the trace surprised you. A boring, uneventful pass with zero surprises doesn't need a memory write — don't manufacture a lesson to look thorough (same rule `post-mortem` applies to action items).

## Workflow

### 1. Collect

Pull the just-finished scrutinize pass's findings: each one's summary, severity, and disposition (fixed inline / deferred as a business call / rejected as a non-issue). Include anything the trace step flagged as a surprise even if it didn't become a formal finding — surprises are exactly the raw material this skill wants.

### 2. Filter — durable vs one-off

For each item, ask one question: **if this exact mistake happened again, would it show up in a different file or feature, or is it really scoped to this one line?**

- Durable: a bug *class* (e.g. "server action shipped with zero auth check"), a process gap (e.g. "design doc had two sections that quietly contradicted each other"), a doc/reality mismatch, a missing category of test.
- One-off: a typo, a single misnamed variable, a style nit with no pattern behind it.

Keep only the durable ones. Discard the rest — they don't earn a memory entry.

### 3. Check for recurrence before writing anything

Search existing project memory topic files (`feedback_*.md`, relevant `project_*.md`) for the same class of issue — matching keywords, not exact wording (e.g. "auth check missing", "server action", the specific setting name). This is the step that turns isolated notes into an actual trend line, so don't skip it even when step 4 feels like a fresh problem.

- **No match found** → first occurrence. Go to step 4, save it, stop there. One occurrence is a data point, not yet a pattern — don't propose a rule change off a sample size of one.
- **Match found** → this is the 2nd+ occurrence of the same class. Update the existing file (don't fork a duplicate); note the new occurrence and bump an explicit recurrence count in the file. Then continue to step 5 — this is now the case for hardening the process itself, not just re-logging it.

### 4. Save to memory

Write or update a `feedback`-type project memory file, following this project's memory conventions: the rule stated plainly, then `Why:` and `How to apply:` lines. Update `MEMORY.md`'s index with one line under ~150 chars. Do this automatically, without asking for sign-off — this is a reversible, low-stakes local memory write, exactly the kind the project's memory instructions mean by "write early, write often."

### 5. Propose promotion (recurrence hit only)

A lesson that's recurred has outgrown a memory note — logging it a second time doesn't stop a third. Propose baking it into something that gets checked automatically. Pick whichever fits:

- A new line under `introduction.md`'s non-negotiable operating rules (device folder file — the operating charter).
- A new named trigger/check in `scrutinize`'s own "Atlas project notes" section, so future scrutinize passes look for this class of bug on their own.
- A checklist item wherever the relevant findings get reviewed.

**This step requires Oliver's explicit sign-off before anything gets edited.** `introduction.md` and skill files are shared operating documents, not scratch memory — present the exact proposed wording and where it would go, then wait. (Note: this session can edit `introduction.md` directly via the device bridge once Oliver agrees; it cannot edit a skill file directly — a changed skill has to be repackaged as a `.skill` file and delivered via `SendUserFile` for Oliver to save, same as this skill itself was.)

### 6. Report

Fold the outcome into the same message that closes out the scrutinize pass — don't make this a separate ceremony. One line if nothing durable came out ("no new lessons this pass"). A short paragraph if something was saved. An explicit flag-and-wait if step 5 triggered.

## Output flow

1. Steps 1–4 run automatically, silently, as part of closing out the scrutinize pass.
2. If step 5 triggers, surface the proposal explicitly and stop — do not edit `introduction.md` or repackage a skill without Oliver's go-ahead.
3. Otherwise, the one-line or short-paragraph report from step 6 rides along with whatever message already reports the scrutinize outcome.

## Why this exists

Atlas already does this by hand, inconsistently — `feedback_atlas_session_start_protocol.md` and `feedback_atlas_role_ux_ui_principal.md` both exist because a problem got noticed once, wasn't systematically checked for recurrence, and had to be rediscovered before it got written down. The clearest example of the exact failure mode this skill targets: a missing-auth-check bug was found and fixed once in `tipPools.ts`/`payroll.ts` (commit `b16e606`), then the *same class* of bug — `publishWeek` with zero auth check — turned up again during the Permission System scrutinize pass. Step 3 (recurrence check) is built specifically to catch that on the first re-occurrence instead of the second.
