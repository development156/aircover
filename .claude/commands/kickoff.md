---
description: Restore a lane's context and STOP. Never starts work.
argument-hint: owner:<name> , branch:<wt-branch> , /<role>
---

Arguments: `$ARGUMENTS` — for example
`owner:girija , branch: wt-girija2 , /lead-research`.

# THIS COMMAND DOES NOT START WORK

**Read, report, stop. That is the whole job.**

You will see a role command in the arguments — `/lead-research`, `/lead-design`,
`/advisor`, `/lead-expert`. **Note which one it is and do not run it.** It tells you which card
to read for context. It is not an instruction to begin.

You will find unfinished work in the handoffs. **Do not resume it.** Listing it
is the point; continuing it is not.

**Do not plan. Do not propose. Do not touch a file.** The founder tells you the
task after this report, and it may have nothing to do with what is unfinished.

This command exists because it used to end with "plan" and a role card that said
"do this immediately", so pressing it started nine sessions working on things
nobody had asked for.

---

## 0 · If the cloud Setup script never ran, run it here

**`bash setup.sh`** is what belongs in the cloud environment's **Setup script**
field — the repo-root wrapper, not `scripts/cloud-setup.sh` directly. Pointing
the field at the script itself kills any session whose branch does not carry it:
bash exits 127, the harness calls that "Setup script failed" and refuses to start
Claude Code at all. That happened on the wt-karunesh2 and wt-karunesh3
environments on 2026-08-30. `setup.sh` delegates when it can and always exits 0.

Leave that field empty and none of it happens: no `.env` files, no
`pnpm install`, no browser, `core.hooksPath` unset so **both git guards are
silently off**, and git authored as the personal account — which makes **Vercel
refuse the deployment**. Ten live sessions were created that way on 2026-08-29,
with the environment variables set and the Setup script field blank.

```bash
# BOTH conditions. The second one is not optional — see below.
if [ ! -f apps/web/.env.local ] && [ -n "${NEXT_PUBLIC_SUPABASE_URL:-}${CLERK_SECRET_KEY:-}" ]; then
  echo "setup never ran in this environment — running it now"
  bash scripts/cloud-setup.sh
fi
cat .sahoda-setup-status 2>/dev/null   # OK, or INCOMPLETE naming what is missing
```

It reads the variables already set on the environment, writes the three `.env`
files from them, installs dependencies and the browser, arms `core.hooksPath`
and sets the `SAHODALABS` identity. It holds no secret, always exits 0, and is
safe to run twice.

**Why both conditions, and why not the obvious guard.** `cloud-setup.sh`
truncates `.env`, `apps/web/.env` and `apps/web/.env.local` — `: > "$target"` —
before rewriting each from the environment. On a laptop those values live _in_
the files and not in the environment, so an unguarded run **blanks them**.
MEASURED in `wt-core` on 2026-08-29: `.sahoda-setup-status` is absent there too
and all three required variables are unset, so gating on that status file alone
— the guard you would reach for first — destroys **77 lines of real secrets**.
`.env.local` absent means there is nothing to lose; a required variable present
means there is something to write. Neither test is sufficient by itself.

**Say in your report whether you had to run it.** If you did, that environment
is still missing its Setup script field, and every future session started there
will need this too. Fixing the field is a person's job in the cloud settings —
this command heals the session, not the environment.

## 1 · Pin who and where

Parse `owner:` and `branch:` from the arguments. **If either is missing, stop and
ask.** Do not guess — with nine lanes and three people a wrong guess files this
session's memory under someone else's lane and nothing ever says so.

```bash
OWNER=<from owner:>        # girija | jiban | divas
LANE=<from branch:>        # wt-girija | wt-girija2 | wt-jiban3 | ...

# A per-worktree setting SHADOWS a plain `git config` write, silently. This
# repo has extensions.worktreeConfig on, so a plain write can read back as
# somebody else's name — which would also disarm the push guard that keeps
# wt-karunesh out of the shared branches.
if [ "$(git config extensions.worktreeConfig 2>/dev/null)" = "true" ]; then
  git config --worktree sahoda.owner "$OWNER"
  git config --worktree sahoda.lane  "$LANE"
else
  git config sahoda.owner "$OWNER"
  git config sahoda.lane  "$LANE"
fi
git config sahoda.owner && git config sahoda.lane      # VERIFY both READ BACK
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
```

## 2b · Install the browser, every session, before you probe

**Playwright ships a downloader, not a browser.** Install one here, on every
`/kickoff`, without checking first:

```bash
pnpm --filter @sahoda/web exec playwright install chromium
```

`cloud-setup.sh` already runs this at environment start — but its failure is
deliberately tolerated so a broken install cannot stop the session, and it never
runs at all for a session that started before it landed. That gap is why every
cloud lane reported `NO_BROWSER` for weeks and why "Playwright is UNRUN on all
nine lanes" was true rather than pessimistic. Running it again here closes it.

It is idempotent, and both halves are MEASURED (2026-08-29):

| cache                              | result                                                                                                                   |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| already has a browser              | **exit 0 in 2 seconds**, nothing re-downloaded                                                                           |
| empty, as a fresh cloud sandbox is | **100 seconds, 646 MB** — chromium, the headless shell and ffmpeg, ending in a real executable it names on the last line |

So it costs a warm box nothing, and you never have to decide whether this box is
cloud or local. Just run it — **including when `lane-sync pull` stopped on a
conflict and you are about to report and stop.** That is the session most likely
to need a browser next and least likely to have installed one.

Read the path off the last line of its output rather than assuming one. The
directory name moves between Playwright builds — `chrome-linux64` here,
`chrome-linux` in the sandbox at the same version — and that exact mismatch is
what made the probe report `NO_BROWSER` on a box that had a working browser.

**Not `npm init -y && npm install playwright`.** This is a pnpm workspace with 17
`workspace:*` dependencies and no `package-lock.json`; `npm` at the root rewrites
the tracked `package.json` and writes a second lockfile beside `pnpm-lock.yaml`,
in every worktree, on every kickoff. The line above installs the browser for the
`@playwright/test` version `apps/web` already pins, so the runner and the binary
cannot drift apart — which is its own failure mode, and reads as
"Executable doesn't exist".

If it fails, say so in your report and call the browser leg **UNRUN**. Do not
call it passing, and do not reach for `--ignore-certificate-errors`.

## 2c · Then measure what this box can actually do

```bash
node scripts/sandbox-probe.mjs                  # what CAN this box actually do?
```

The probe measures four things and prints a one-word verdict. **Carry it into
your report**, because it decides what "verified" can mean here:

- **`FULL`** — Chromium reaches https. The whole Playwright suite can run.
- **`LOCAL_ONLY`** — Chromium reaches `http://127.0.0.1` but every https URL is
  reset. Specs driving the local app over http can run; anything whose page
  loads a third-party https asset (Clerk sign-in) cannot. That failure looks
  like a broken selector and is not one.
- **`NO_BROWSER`** — Playwright browsers are not installed here.

When it is not `FULL`, the browser leg is **UNRUN, never passed**, and the way
to get a real answer is `node scripts/browser-run.mjs --remote`. Do not reach
for `--ignore-certificate-errors`: the connection is reset before a certificate
exists, and it is forbidden here.

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
`lead-research.md`, `advisor.md` or `lead-expert.md`. **Read it. Do not act on it.** Those cards
open with "do this immediately" — that instruction is for when the founder
invokes them directly, not now.

---

# 6 · Report, in exactly this shape, then STOP

```
LANE
  owner · lane · branch you are actually on · SHA · routes · setup status · browser verdict

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
