---
description: Start a session — read the other roles' handoffs, then plan.
---

Do not plan anything until steps 1 and 2 are done.

## 0 · Pull. Always. Before anything else.

```bash
git fetch --all --prune
git pull --ff-only origin "$(git branch --show-current)"
```

**This is the rule that comes before every other rule.** Three lanes and an
integration branch move independently; a session that starts from a stale
checkout writes changes against code that no longer exists.

`--ff-only` on purpose: if it refuses, your lane and the remote have diverged
and you must look at why rather than let a merge happen by accident. Say so and
stop.

Then confirm you are where you think you are:

```bash
git branch --show-current
find apps/web/src/app -name page.tsx | wc -l   # 58 = the product. ~20 or ~11 = a stale main.
```

## 1 · Read the canon

- `CLAUDE.md`
- `docs/workflow/00_START_HERE.md`
- `docs/workflow/08_ROLES.md` — find **your** card, and read the other two
- `docs/workflow/05_TRAPS.md` — the ones your task will actually meet
- In a cloud session: `docs/workflow/09_CLOUD_SESSIONS.md`

If any of those files is missing, **stop and say so** rather than proceeding
without them. Their absence is the failure, not a detail. `docs/workflow/` was
missing from every branch until 24 August 2026 while `/kickoff` instructed
every session to read it — so this check is not hypothetical.

## 2 · Restore your own context

Your role comes from your branch: `wt-design` is `design`, `wt-research` is
`research`, anything else is `advisor`.

```bash
git fetch --all
ls docs/workflow/handoffs/<role>-*.md 2>/dev/null | tail -1
```

Read your own newest handoff **first**. It is where you left off: what you
shipped, what you deliberately did not, and what you said was owed. Resume from
it rather than starting cold.

If there is none, say so — a first session is a first session, not a lost one.

## 3 · Read what the other roles did

```bash
git fetch --all
ls docs/workflow/handoffs/
```

Read the **newest handoff from each role that is not yours**, on its own
branch if it is not on yours yet:

```bash
git log --oneline -3 origin/wt-design  origin/wt-research  origin/wt-web
git show origin/wt-design:docs/workflow/handoffs/<newest>
```

Then read the tail of `apps/web/REQUESTS.md` — the cross-lane request log —
for anything addressed to your role, and any scope another role has declared.

**Report to me what you learned before planning**, in three lines: what the
others shipped, what they said they did not do, and every shared surface they
touched that your task will meet.

## 4 · Establish where you are

```bash
git branch --show-current      # verify — never assume a checkout succeeded
git status --short
git log --oneline -5
```

**Confirm your base is right.** Branches are cut from `origin/wt-web`, never
from `main` — every `main` in this project is 690+ commits behind and carries
a 20-route skeleton of a 58-route product.

If the working tree has uncommitted changes that are not yours, say so and
leave them alone.

## 5 · Plan

State, before touching anything:

- What you are going to do, and what must remain true when you are finished
- Which files you will touch, and whether any belongs to another role
- **For each fix, the mutation that would reveal its absence** — the weakest
  plans say _fix X_; the strongest say _fix X, and prove it by breaking it_
- Which traps from `05_TRAPS.md` this task will meet
- What you will not be able to verify, and why

Then wait for my confirmation before modifying code.

## 6 · If your scope overlaps another role

Declare it in `apps/web/REQUESTS.md` before your first edit, and say so here.
Two lanes editing the same _file_ is a conflict git will show you. Two lanes
editing the same _concept_ is two designs of the same thing where only one
survives, and git shows you nothing.
