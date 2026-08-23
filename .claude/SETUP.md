# Claude Code setup for Atlas

Everything here is already in place once these files are in the repo. This is the
short list of what *you* still have to do, and what changed.

## 1. Start read-only

Open the Claude desktop app → **Code** tab → **Select folder** → this repo.
Press **Shift+Tab** until the mode reads **Plan**. In Plan mode it can read and
explain but cannot write or run anything.

Good first prompt: *"Walk me through the three-step Ledger day flow."*

Nothing can go wrong in Plan mode. Stay there until the interface feels familiar.

## 2. What is already configured

| File | What it does |
|---|---|
| `CLAUDE.md` | Loaded automatically every session — role, the nine rules, stack gotchas |
| `docs/atlas/introduction.md` | The long-form charter, plus an appendix on what changes in Claude Code |
| `.claude/settings.json` | Permission allow/deny rules — see below |
| `.claude/skills/` | Six skills: `atlas-start`, `scrutinize`, `visual-audit`, `atlas-learn`, `debug-mantra`, `post-mortem` |

Invoke a skill by typing `/scrutinize`, `/visual-audit`, and so on. They also load
on their own when relevant.

## 3. The deny list is the important part

Your Turso credentials are in `~/.zshrc`. A shell running in this repo inherits
them, so **it can reach `atlas-prod`**. The old cloud sandbox physically could not.

`.claude/settings.json` blocks the commands that would do real damage:

- `npm run db:push` — runs `drizzle-kit push` against the hosted DB
- `npm run setup` — chains `db:push` **and** `db:seed`
- `npm run db:seed` — would overwrite real data
- `npm run db:migrate` — you run migrations, not Claude
- `rm -rf`, force pushes, `git reset --hard`, `git clean -fd`
- reading or editing `.env*` and `~/.zshrc`

Two of these are one keystroke from a payroll database, and they are real scripts
that exist in `package.json` right now. Do not relax them casually. If a denial ever
blocks legitimate work, the answer is to ask — not to widen the rule.

`git reset --hard` is on the list because it destroyed work once before. If you find
it too strict for normal use, remove that one line and keep the rest.

## 4. MCP servers — your call

`.mcp.json.example` has Playwright, Turso and Vercel sketched out.

Two options:

- **Easier:** add them through the desktop app's **Connectors UI**.
- **Or:** `cp .mcp.json.example .mcp.json` and fill in the env values. Do not commit
  real tokens — add `.mcp.json` to `.gitignore` if you put anything sensitive in it.

Test **one** server first — Turso, read-only — before trusting the rest. I could not
verify from here that MCP behaves identically in the desktop app and the CLI.

## 5. What did NOT come across

- **Project memory.** `MEMORY.md`, `ARCHIVE.md` and 67 topic files still live in
  Cowork. They are the record of what shipped, what is open, and why. `CLAUDE.md`
  carries the load-bearing parts; the rest is exportable into `docs/atlas/` whenever
  you want it — ask, and it can be generated.
- **Session history.** Cowork and Claude Code keep separate histories. Config is
  shared; conversations are not.

You can keep using Cowork alongside this. They are tabs in the same app.

## 6. A good first real task

Two known open items, both small and both visual — exactly what the diff review is
good at:

1. **Finding 1.** On the Ledger day page, step 3, a negative "Expected in drawer"
   renders in `--ink-900`, identical to any ordinary figure, while the paid-out row
   correctly uses danger red. A drawer cannot hold negative money. Suggested fix:
   `--danger-700` plus a plain explanatory line.
2. **The account button in the nav rail.** `navItemSizeClasses` in
   `app/NavBarClient.tsx` uses `sm:w-auto`; a `<button>` on `width:auto`
   shrink-wraps, so its hover pill is 114.75px against every other row's 199px.
   Change it to `sm:w-full`. That file is the only user of that constant.

Ask for one of them in Plan mode first and read the plan before letting it write.
