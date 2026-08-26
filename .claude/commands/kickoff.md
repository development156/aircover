---
description: Start a lane — pin owner and branch, restore that lane's own memory.
argument-hint: owner:<name> , branch:<wt-branch>
---

Arguments: `$ARGUMENTS` — for example
`owner:girija , branch: wt-girija2` followed by the role command you want.

## 0 · Pin who and where, before anything else

Parse `owner:` and `branch:` out of the arguments. **If either is missing, stop
and ask.** Do not guess and do not fall back to the branch name — with nine
lanes and three people, a wrong guess files this session's memory under someone
else's lane and nothing will ever say so.

```bash
OWNER=<from owner:>        # girija | jiban | divas
LANE=<from branch:>        # wt-girija | wt-girija2 | wt-jiban3 | ...

git config sahoda.owner "$OWNER"
git config sahoda.lane  "$LANE"
git config sahoda.owner && git config sahoda.lane      # VERIFY both stuck
```

**These two are the whole identity of this session.** Every commit here is
authored `SAHODALABS`, so git can never tell you whose work this is or which of
that person's three lanes it belongs to. `sahoda.owner` and `sahoda.lane` are
the only record.

## 1 · Get onto the lane

```bash
git fetch --all --prune
git checkout "$LANE" 2>/dev/null || git checkout -b "$LANE" "origin/$LANE"
git branch --show-current                 # VERIFY — never assume a checkout worked
git pull --ff-only origin "$LANE"
```

If `--ff-only` refuses, this lane diverged from the remote. **Say so and stop.**
Someone else pushed into it, and merging past that on a guess is how work gets
lost.

If the harness has put you on a `claude/...` branch it created and will not let
you leave it, **say that plainly and carry on there** — but keep
`sahoda.lane` set to the lane you were given, because that is what the handoff
must be filed under. Never abandon a branch another session or a PR is tracking.

```bash
find apps/web/src/app -name page.tsx | wc -l    # 59 = the product. ~12 or ~20 = a stale base.
cat .sahoda-setup-status 2>/dev/null            # OK, or INCOMPLETE naming what is missing
```

## 2 · Restore THIS lane's memory

Handoffs are `<owner>-<lane>-<date>.md`. The lane is in the name because one
person runs three of them, and `girija-research-<date>.md` would be the same
file for `wt-girija`, `wt-girija2` and `wt-girija3` — three lanes overwriting
one record. That already happened once.

```bash
ls -t docs/workflow/handoffs/${OWNER}-${LANE}-*.md 2>/dev/null | head -1
```

Read the newest. **That is where you left off in this lane** — what shipped,
what was deliberately not done, what was owed. Resume from it rather than
starting cold. If there is none, say so; a first session is a first session,
not a lost one.

## 3 · Read what the other lanes did

```bash
ls -t docs/workflow/handoffs/*.md | head -10
```

Read the newest from each **other** lane — especially the other two run by the
same person, because those are the ones most likely to be in your ground.

Then read the tail of `apps/web/REQUESTS.md` for scope anyone has declared.

**Report in four lines before planning:** where you left off · what the others
changed · what you propose · anything you found that contradicts an assumption.

## 4 · Then the role command

The founder passes it with the arguments — `/lead-research`, `/lead-design` or
`/advisor`. **The role is whatever they ask for, not whatever the branch name
suggests.** `wt-girija` running `/lead-research` is correct and normal.

## 5 · Plan

State, before touching anything: what you will do and what must remain true ·
which files · **for each fix, the mutation that would reveal its absence** ·
which traps from `05_TRAPS.md` this task meets · what you will not be able to
verify, and why.

Declare scope in `apps/web/REQUESTS.md` before the first edit if you are working
outside your usual ground. With nine lanes that is not politeness — two lanes
editing the same _file_ is a conflict git shows you; two lanes editing the same
_concept_ is two designs of one thing where only one survives, silently.
