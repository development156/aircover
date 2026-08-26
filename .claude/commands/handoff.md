---
description: Save this lane — write a durable handoff keyed to owner and lane.
argument-hint: owner:<name> , branch:<wt-branch>
---

Arguments: `$ARGUMENTS` — for example `owner:girija , branch: wt-girija2`.

## 1 · Establish owner and lane

```bash
OWNER=$(git config sahoda.owner)     # or from owner: in the arguments
LANE=$(git config sahoda.lane)       # or from branch: in the arguments
echo "$OWNER / $LANE"
```

Arguments win over git config. **If you cannot get both, stop and ask.** Do not
fall back to the branch name — the harness may have put you on a `claude/...`
branch, and filing this session under that id makes it unfindable by the person
who owns the lane.

```bash
date +%F        # do not guess the date
git branch --show-current
git log --oneline -12
git status --short
```

## 2 · Verify before you claim

Run the gate legs that apply and record their **real output**.

- **Never report an unrun suite as passed.** A leg that did not run is UNRUN.
- **A leg under one second is a cache replay** and verified nothing. Force it.
- **Never pipe the gate** — a pipe returns the pipe's exit code.
- **Group failures by error message, never count them.** Six unrelated suites
  red at once is an environment; one is a diff.
- `@sahoda/db` talks to one shared live database. Two overlapping runs strand
  fixtures and the next run trips on them — that is a collision, not a defect.

## 3 · Write it

**`docs/workflow/handoffs/<owner>-<lane>-<YYYY-MM-DD>.md`**

The lane is in the filename because one person runs three of them.
`girija-research-<date>.md` is the same file for `wt-girija`, `wt-girija2` and
`wt-girija3` — three lanes overwriting one record. That already happened: two
sessions both wrote `girija-research-2026-08-26.md` on 26 August.

If that exact file exists and is a real handoff, append `## Session <n>` rather
than overwriting. If it is an `AUTOMATIC SKELETON`, replace it.

Required sections, all of them, by name:

```markdown
# Handoff — <owner> — <lane> — <YYYY-MM-DD>

**Branch** `<actual branch>` at `<sha>`. Lane `<lane>`. Pushed: yes/no.

## What shipped

One row per item: what it is, the file:line or SHA that proves it, the named
test that covers it.

## What was NOT done, and why

State your own boundaries. "I did not run Playwright — it needs keys this
sandbox lacks, so this is UNRUN, not passed" is a session worth trusting.

## Shared surfaces touched

Every shared primitive, type, fixture, token or config another lane consumes.
A required field breaks constructors, not readers — say which. Write "none" if
none; do not omit the section. Lanes have broken each other four times through
exactly this omission.

## Contract, migration or money

Anything touching `packages/shared`, a price, a migration, or the ledger. You
may do these freely — but whoever merges must know.

## Guards written, and the mutation that proved each

The mutation you applied, and that you WATCHED it go red. A guard never shown
to fail is not a guard.

## Anything retracted

With the measurement that justifies it. State what you MEASURED, never what you
inferred.

## What the next session in THIS lane should pick up

The one section your future self reads first.

## Gate

Each leg named, real output, PASS / FAIL / UNRUN.
```

Mark every claim **MEASURED** or **INFERRED**. A "done" claim needs a
`file:line`, a named passing test, a git SHA, or a live URL.

## 4 · Commit and push

```bash
git add docs/workflow/handoffs/
git commit -m "handoff(<owner>/<lane>): <one line>"

node scripts/lane-sync.mjs push
```

`lane-sync push` refuses a dirty tree, takes `wt-core` **first** so you never
hand over a lane that has not seen the trunk, pushes your lane, and then prints
the gate you must run before `wt-core` takes it.

**It does not push to `wt-core` for you.** That is deliberate: `wt-core` is what
reaches `wt-web`, and an ungated push into it turns every other lane's next pull
red for a reason they did not cause. Run the gate, then:

```bash
git push origin HEAD:wt-core
```

If the working tree holds files that are not yours, leave them and say so in the
handoff rather than committing them under an unrelated message.

## 5 · Then tell me

Print the same content here, and give me the path, the branch and the SHA.
