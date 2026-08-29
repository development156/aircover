# The first prompt

Paste this into a **fresh Claude Code session** — local terminal or a cloud
session at claude.ai/code. It works from an empty folder or an existing clone.

Everything it needs lives on the **`wt-core`** branch. Not `main`, not `wt-web`.

---

## The prompt — copy everything in the box

```
Set up this project from scratch. Do not build anything yet.

REPO:   https://github.com/development156/sahodalabs
BRANCH: wt-core        (never `main` — it is 800+ commits stale, a 12-route
                        skeleton, and is NOT the product)

1. Get onto the right code.

   If there is no git repo in this folder:
     git clone https://github.com/development156/sahodalabs.git
     cd sahodalabs
     git checkout wt-core

   If a repo is already here (cloud sessions usually start this way):
     git fetch origin
     git checkout wt-core || git checkout -b wt-core origin/wt-core
     git pull --ff-only origin wt-core

   Confirm before continuing:
     git branch --show-current      # must print wt-core
     ls docs/workflow/              # must list 90_, 91_ and 92_ files

2. Run the setup script and show me its output verbatim:

     bash scripts/bootstrap.sh

   It installs dependencies, arms the git guards, restores my personal rules,
   installs the browser Playwright needs, then verifies itself and exits
   non-zero if anything is still missing. Safe to run twice. It never touches
   a .env file.

3. Read these two files IN FULL before you say anything else:

     docs/workflow/90_CONTEXT_FOR_CLAUDE.md
     docs/workflow/91_ACCOUNT_MIGRATION.md

   The first is the whole operating picture: the branch map, the four people
   and their commands, the non-negotiables, the verification doctrine, and the
   traps that have each cost hours. The second is the account-transfer process.

4. Then report back, in this shape and nothing longer:

     - what the setup script verified as OK
     - what it reported MISSING, and the exact command or action for each
     - the four things no script can do, quoted from its own output
     - one line on what this project is and which branch I am on

5. Stop there and wait. Do not start work, do not plan a feature, do not
   "prepare" by opening files. I will tell you the task next.

Two things to hold on to while you read:

  - A guard never shown to fail is not a guard. When you later claim something
    works, break it on purpose first and watch the check go red.
  - Never report a test suite as passing if it did not run. Say PASS, FAIL, or
    UNRUN — never a fourth thing.
```

---

## Where everything lives

All paths are **relative to the repo root**, on branch `wt-core`.

| File | What it is |
| --- | --- |
| `docs/workflow/90_CONTEXT_FOR_CLAUDE.md` | For Claude — the whole operating picture |
| `docs/workflow/91_ACCOUNT_MIGRATION.md` | For you — the account switch |
| `docs/workflow/92_FIRST_PROMPT.md` | This file |
| `scripts/bootstrap.sh` | What the prompt runs |
| `scripts/account-export.sh` | OLD account — packs up what git does not carry |
| `scripts/account-import.sh` | NEW account — unpacks it |
| `scripts/account-verify.sh` | Proves the setup; **fails** if incomplete |
| `ops/account-transfer/` | The 21 rule files, plugin list, sanitised settings |

### On this laptop

```
/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-core/
```

So the prompt file itself is:

```
/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/wt-core/docs/workflow/92_FIRST_PROMPT.md
```

Other worktrees on this machine sit beside it under
`/home/divas/Documents/GitHub/sahodalabs/.claude/worktrees/`. The folder at
`/home/divas/Documents/GitHub/sahodalabs` itself is on `squashed-root`, which
is **not** the app — do not work there.

### On a new machine

Wherever you cloned, e.g. `~/sahodalabs/docs/workflow/92_FIRST_PROMPT.md`.

### In a cloud session

The harness clones for you; the repo root is the working directory. Paths are
just `docs/workflow/92_FIRST_PROMPT.md` and `scripts/bootstrap.sh`.

### On GitHub

```
https://github.com/development156/sahodalabs/blob/wt-core/docs/workflow/92_FIRST_PROMPT.md
https://github.com/development156/sahodalabs/blob/wt-core/docs/workflow/90_CONTEXT_FOR_CLAUDE.md
https://github.com/development156/sahodalabs/blob/wt-core/docs/workflow/91_ACCOUNT_MIGRATION.md
```

**These exist only on `wt-core`.** A clone that stays on `main` will not have
them — which is why checking out `wt-core` is step 1.

---

## The Setup script field

**The Setup script field does NOT run in the repository root.** MEASURED
2026-08-30 on wt-karunesh2: with `setup.sh` present on every branch in this repo,
the field `bash setup.sh` still died with `bash: setup.sh: No such file or
directory`, exit 127 — the same failure the earlier `bash scripts/cloud-setup.sh`
gave. One cause explains both, and it is not the branch. Paste this instead:

```
bash -c 'set +e; R="$(git rev-parse --show-toplevel 2>/dev/null)"; for d in "$PWD" "$R"; do [ -n "$d" ] && [ -f "$d/setup.sh" ] && { bash "$d/setup.sh"; exit 0; }; done; F="$(find "$HOME" /workspace /repo /app /src -maxdepth 4 -name setup.sh -type f 2>/dev/null | head -1)"; [ -n "$F" ] && { echo "SAHODA: found $F"; bash "$F"; exit 0; }; echo "SAHODA: no setup.sh found. pwd=$PWD"; ls -la; exit 0'
```

It looks for the repo where it stands, then where git says the root is, then
under `$HOME` and the usual container roots, and **exits 0 whatever it finds** —
including when it finds nothing, where it prints `pwd` and a listing so the next
attempt is informed rather than another guess. Proven at exit 0 from the repo
root, from `$HOME`, from `/tmp`, from `/`, and with no `setup.sh` anywhere.

## What the script does

| | |
| --- | --- |
| 1 | Checks the branch, warns loudly on `main` |
| 2 | `pnpm install` if `node_modules` is absent |
| 3 | `git config core.hooksPath .githooks` — **the easiest thing to miss.** Skipping it silently disarms the QA guard *and* the block keeping `wt-karunesh` out of `wt-core` |
| 4 | Restores the 21 personal rule files; settings **merged**, existing values win, replaced files backed up |
| 5 | Installs chromium — Playwright ships a downloader, not a browser, which is why the browser tests were unrun on every cloud lane for weeks |
| 6 | Runs `account-verify.sh`, which **exits non-zero until it is genuinely complete** |

## The four things no script can do

Nothing works without the first two.

1. **`apps/web/.env` and `apps/web/.env.local`** — copy in by hand. Not in git,
   never will be.
2. **`/mcp`** to reconnect. GitHub needs a pasted token; Vercel, Supabase,
   Sentry and Resend are sign-in pop-ups.
3. **Re-install the plugins**, including the private `divas-personal`
   marketplace. `scripts/account-import.sh` prints the list.
4. **Cloud only:** set the environment's **Setup script** field to
   `bash setup.sh` (never `scripts/cloud-setup.sh` directly — a branch without
   that file exits 127 and the harness then refuses to start the session), set
   `SAHODA_LANE_OWNER`, and paste the same secret values into the environment
   settings once. It then runs on its own and handles the browser and the
   guards.

## Local vs cloud, in one line each

- **Local:** clone, `git checkout wt-core`, paste the prompt.
- **Cloud:** the harness clones and runs `scripts/cloud-setup.sh` at start, so
  steps 2, 3 and 5 are already done — `bootstrap.sh` confirms them. Paste the
  same prompt.

Then each person starts their lane:

```
/kickoff owner:divas    , branch: wt-divas    , /advisor
/kickoff owner:jiban    , branch: wt-jiban    , /lead-design
/kickoff owner:girija   , branch: wt-girija   , /lead-research
/kickoff owner:karunesh , branch: wt-karunesh , /lead-expert
/kickoff owner:karunesh , branch: wt-karunesh2 , /lead-expert
/kickoff owner:karunesh , branch: wt-karunesh3 , /lead-expert
```

`/kickoff` restores context and **stops**. Work happens with `/go <task>` — or
`/goat <task>` for Karunesh, same rigour, no technical language at all.
