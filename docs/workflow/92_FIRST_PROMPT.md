# The first prompt

Paste this into a **fresh Claude Code session** on a new account. It works from
an empty folder or an existing clone, and it sets up local and explains cloud.

Copy everything inside the box.

---

```
Set up this project from scratch. Do not build anything yet.

1. If there is no git repo here, clone it and enter it:
     git clone https://github.com/development156/sahodalabs.git
     cd sahodalabs
   Then check out the working branch:
     git checkout wt-core
   Never use `main` — it is 800+ commits stale and is not the product.

2. Run the setup script and show me its output:
     bash scripts/bootstrap.sh
   It installs dependencies, arms the git guards, restores my personal rules,
   installs the browser Playwright needs, and then verifies itself. It is safe
   to run twice and it never touches a .env file.

3. Read these two files in full before you say anything else:
     docs/workflow/90_CONTEXT_FOR_CLAUDE.md
     docs/workflow/91_ACCOUNT_MIGRATION.md
   The first is the whole operating picture: the branch map, the four people
   and their commands, the non-negotiables, the verification doctrine, and the
   traps that have each cost hours. The second is the account-transfer process.

4. Then report back, in this shape and nothing longer:
     - what the setup script verified as OK
     - what it reported MISSING, and the exact command or action for each
     - the four things no script can do, from its own output
     - one line on what this project is and which branch I am on

5. Stop there and wait. Do not start work, do not plan a feature, do not
   "prepare" by opening files. I will tell you the task next.

Two things to hold on to while you read:

- A guard never shown to fail is not a guard. When you later claim something
  works, break it on purpose first and watch the check go red.
- Never report a test suite as passing if it did not run. Say PASS, FAIL, or
  UNRUN.
```

---

## What happens after you paste it

The script does five things and then proves them:

| | |
| --- | --- |
| 1 | Checks you are on a real branch, not `main` |
| 2 | `pnpm install` if needed |
| 3 | `git config core.hooksPath .githooks` — **the easiest thing to miss.** Without it the QA guard *and* the block keeping `wt-karunesh` out of `wt-core` are both silently off |
| 4 | Restores the 21 personal rule files and merges your settings (existing values win, replaced files are backed up) |
| 5 | Installs chromium — Playwright ships a downloader, not a browser, which is why the browser tests were unrun on every cloud lane for weeks |

Then `account-verify.sh` runs and **exits non-zero until the setup is genuinely
complete**, printing the exact fix for each gap.

## The four it will ask you for

Nothing works without the first two.

1. **`apps/web/.env` and `apps/web/.env.local`** — copy in by hand. Not in git,
   never will be.
2. **`/mcp`** to reconnect. GitHub needs a pasted token; Vercel, Supabase,
   Sentry and Resend are sign-in pop-ups.
3. **Re-install the plugins**, including the private `divas-personal`
   marketplace. `scripts/account-import.sh` prints the list.
4. **Cloud only:** paste the same secret values into the cloud session's
   environment settings once. `scripts/cloud-setup.sh` then runs by itself and
   handles the browser and the guards for you.

## For a cloud session

Same prompt. The cloud harness runs `scripts/cloud-setup.sh` at start, so steps
2, 3 and 5 are already done — `bootstrap.sh` will simply confirm them.

Then each person starts their lane:

```
/kickoff owner:divas    , branch: wt-divas    , /advisor
/kickoff owner:jiban    , branch: wt-jiban    , /lead-design
/kickoff owner:girija   , branch: wt-girija   , /lead-research
/kickoff owner:karunesh , branch: wt-karunesh , /lead-expert
```

`/kickoff` restores context and **stops**. Work happens with `/go <task>` — or
`/goat <task>` for Karunesh, which is the same rigour with no technical
language at all.
