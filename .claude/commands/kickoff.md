---
description: Restore a lane's context and STOP. Never starts work.
argument-hint: owner:<name> , branch:<wt-branch> , /<role>
---

Arguments: `$ARGUMENTS` — for example
`owner:girija , branch: wt-girija2 , /lead-research`.

# THIS COMMAND DOES NOT START WORK

**Read, report, stop. That is the whole job.**

You will see a role command in the arguments — `/lead-research`, `/lead-design`,
`/advisor`. **Note which one it is and do not run it.** It tells you which card
to read for context. It is not an instruction to begin.

You will find unfinished work in the handoffs. **Do not resume it.** Listing it
is the point; continuing it is not.

**Do not plan. Do not propose. Do not touch a file.** The founder tells you the
task after this report, and it may have nothing to do with what is unfinished.

This command exists because it used to end with "plan" and a role card that said
"do this immediately", so pressing it started nine sessions working on things
nobody had asked for.

---

## 1 · Pin who and where

Parse `owner:` and `branch:` from the arguments. **If either is missing, stop and
ask.** Do not guess — with nine lanes and three people a wrong guess files this
session's memory under someone else's lane and nothing ever says so.

```bash
OWNER=<from owner:>        # girija | jiban | divas
LANE=<from branch:>        # wt-girija | wt-girija2 | wt-jiban3 | ...

git config sahoda.owner "$OWNER"
git config sahoda.lane  "$LANE"
git config sahoda.owner && git config sahoda.lane      # VERIFY both stuck
```

Every commit here is authored `SAHODALABS`, so git can never say whose work this
is or which of that person's three lanes it belongs to. These two values are the
only record.

## 2 · Get onto the lane and take the trunk

```bash
git fetch --all --prune
git checkout "$LANE" 2>/dev/null || git checkout -b "$LANE" "origin/$LANE"
git branch --show-current                 # VERIFY — never assume a checkout worked
git pull --ff-only origin "$LANE"

node scripts/lane-sync.mjs pull           # take wt-core into this lane
```

`lane-sync pull` resolves only what it can prove is mechanical and **stops on
anything else**. If it stops, say so in your report and leave it. Resolving a
conflict is work, and this command does not do work.

If the harness has pinned you to a `claude/...` branch you cannot leave, say so
plainly and stay there — but keep `sahoda.lane` set to the lane you were given.
**Never abandon a branch another session or a PR is tracking.**

```bash
find apps/web/src/app -name page.tsx | wc -l    # 59 = the product
cat .sahoda-setup-status 2>/dev/null            # OK, or INCOMPLETE naming what is missing
```

## 3 · Read this lane's own memory

```bash
ls -t docs/workflow/handoffs/${OWNER}-${LANE}-*.md 2>/dev/null | head -1
```

Read the newest. If there is none, say so — a first session is a first session,
not a lost one.

## 4 · Read what the other lanes did

```bash
ls -t docs/workflow/handoffs/*.md | head -10
```

Read the newest from each **other** lane, especially the other two run by the
same person. Then the tail of `apps/web/REQUESTS.md` for declared scope.

## 5 · Read your role card, for context only

Whichever role appeared in the arguments: `.claude/commands/lead-design.md`,
`lead-research.md` or `advisor.md`. **Read it. Do not act on it.** Those cards
open with "do this immediately" — that instruction is for when the founder
invokes them directly, not now.

---

# 6 · Report, in exactly this shape, then STOP

```
LANE
  owner · lane · branch you are actually on · SHA · routes · setup status

DONE — what this lane already finished
  From your own newest handoff. What shipped, with the SHA or file:line.
  If there is no handoff: "no previous session in this lane".

NOT DONE — what this lane deliberately left
  From the same handoff's "what was NOT done" section, plus anything it said
  was owed. Say WHY each was left, not just that it was.

WHAT MOVED UNDER YOU
  What the other lanes changed since your last session here. Shared surfaces
  first — those are the ones that break you.

BLOCKED OR NEEDS A DECISION
  Anything lane-sync stopped on, any INCOMPLETE setup, any question the last
  session left open. One line each. "Nothing" if nothing.

READY.
What would you like me to work on?
```

**Then stop and wait.** Do not suggest a task. Do not say "I could start with".
Do not open a file to "prepare". The founder has a task in mind and it is
probably not the one you would have picked.

If the lane is genuinely clean and empty, the whole report is four lines and
"READY. What would you like me to work on?" — that is a good report, not a thin
one.
