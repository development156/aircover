# Moving to a different Claude Code account

For **Divas**. Local and cloud. About 40 minutes, most of it waiting.

There are three scripts. Run them in order and the last one tells you whether
you are actually done, rather than leaving you to hope.

```bash
bash scripts/account-export.sh   # in the OLD account, once
bash scripts/account-import.sh   # in the NEW account, after cloning
bash scripts/account-verify.sh   # proves it, exits non-zero if not
```

---

## What travels by itself, and what does not

**Arrives with `git clone` — you rebuild none of it:**

| | count |
| --- | --- |
| `.claude/commands` (`/kickoff` `/go` `/goat` `/handoff` `/advisor` …) | 20 |
| `.claude/agents` | 26 |
| `.claude/skills` | 22 |
| `.githooks` (`pre-commit`, `pre-push`) | 2 |
| `.claude/settings.json`, `.mcp.json` | tracked |

**Does NOT travel. This is the part that gets lost:**

| | why |
| --- | --- |
| `~/.claude/rules/ecc/**` — **21 files** | Personal, and there were **zero copies in the repo**. `account-export.sh` now captures them. |
| Installed plugins + your private `divas-personal` marketplace | Per account. Exported as a **list to re-install**, not as data. |
| `~/.claude/settings.json` | Personal harness settings. |
| MCP authorisations | Per account. Must be re-done. |
| `apps/web/.env`, `apps/web/.env.local` | Never in git, never will be. **Move by hand.** |

---

## Step 1 — in the OLD account, before you switch

### Push every cloud session's work first

This is the only step that loses data if skipped. **Unpushed work in a cloud
session dies with the account.** On 2026-08-28 three commits — the only copy of
a fix — sat unpushed in one session for hours.

In each running cloud session: `/handoff owner:<name> , branch:<lane>`

Then check from anywhere:

```bash
git fetch origin --prune && git branch -r | grep claude/
```

### Export the account-scoped assets

```bash
bash scripts/account-export.sh
```

Writes `ops/account-transfer/` — the 21 rule files, the plugin and marketplace
list, your settings with any credential block stripped, and an `INVENTORY.json`
the verify step checks against.

**It refuses to run if a credential-shaped string is anywhere in what it wrote.**
That refusal is tested: planting a fake service-role key makes it exit 1 and
commit nothing.

Commit and push that folder.

### Copy the env files somewhere safe

`apps/web/.env` and `apps/web/.env.local`. Not to git. A password manager or a
USB stick. Nothing else in this process can replace them.

---

## Step 2 — in the NEW account

```bash
claude                       # sign in as the new account
git clone https://github.com/development156/sahodalabs.git
cd sahodalabs
git checkout wt-core
pnpm install
bash scripts/account-import.sh
```

`account-import.sh` restores the rules and **merges** settings — anything the new
account already set (theme, model) wins, and whatever it replaces is backed up
first. It then prints the four things a script cannot do for you.

### The four manual ones

1. **`git config core.hooksPath .githooks`**
   Without it the QA-scratch guard **and Karunesh's push block are both off**,
   so his lane could write straight to `wt-core`. This was found **unset in a
   live worktree** on 2026-08-28 by the verify script — the guard had been built,
   tested and then silently not armed.
2. **Put the two `.env` files back.** Nothing works without them.
3. **`/mcp`** and re-authorise. GitHub needs a pasted bearer token; Vercel,
   Supabase, Sentry and Resend are OAuth pop-ups.
4. **Re-install the plugins** the import script lists, and re-add the
   `divas-personal` marketplace.

### Then prove it

```bash
bash scripts/account-verify.sh
```

It checks the clone is complete, the hooks are armed, the rules are restored,
the env files exist, the toolchain runs, and the browser probe reaches a verdict.
**It exits non-zero if any of that is false**, and prints the exact command to
fix each one. Finish with the real gate:

```bash
pnpm turbo run typecheck lint test --concurrency=2
pnpm format:check
```

`format:check` is separate on purpose — it sits outside turbo and catches things
turbo cannot.

---

## Cloud sessions in the new account

Put **`bash setup.sh`** in the environment's **Setup script** field — the
repo-root wrapper, never `scripts/cloud-setup.sh` directly. A branch without that
script makes bash exit 127, and the harness then refuses to start the session at
all; `setup.sh` delegates when it can and always exits 0, so a misconfigured
environment boots and says what is wrong instead of dying. It does the browser
install and `core.hooksPath`. You paste the env values into the cloud session's
environment settings once, and `SAHODA_LANE_OWNER` is one of them — without it
the push block that keeps a karunesh lane out of `wt-core` and `wt-web` is off.

Each person then starts with:

```
/kickoff owner:divas    , branch: wt-divas    , /advisor
/kickoff owner:jiban    , branch: wt-jiban    , /lead-design
/kickoff owner:girija   , branch: wt-girija   , /lead-research
/kickoff owner:karunesh , branch: wt-karunesh , /lead-expert
/kickoff owner:karunesh , branch: wt-karunesh2 , /lead-expert
/kickoff owner:karunesh , branch: wt-karunesh3 , /lead-expert
```

`/kickoff` **restores context and stops.** It does not start work — deliberately,
because it used to, and once set nine sessions working on things nobody asked
for. Work then happens with `/go <task>`, or `/goat <task>` for Karunesh, which
is the same rigour with no technical language at all.

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

## The five rules that must survive the move

1. **No lane writes `wt-web` or `main`** — enforced since 30 August 2026 by
   `.githooks/pre-push`, for every owner and for an unset one. That is the live
   product. Only a proven `wt-core` is promoted, and it costs a typed
   acknowledgement: `SAHODA_PROMOTE=wt-web git push origin wt-core:wt-web`.
2. **Never run `supabase db push`.** Production is `rloztdhzfliyvpvxsgjl` and
   there is no staging.
3. **Never execute a publish.** It posts to a real customer's feed.
4. **The browser suite writes to production.** It once created 12,196 accounts.
   It refuses without an explicit acknowledgement — leave that in place.
5. **Both migrations this rule used to hold back are now APPLIED.** Corrected
   2026-09-03; the sentence below replaces "two migrations are deliberately
   unapplied", which had stopped being true.
   - The **plan reprice** was applied on 29 August as version `20260829105627`,
     not by this session. Production charges starter ₹1999 today
     (`plans.updated_at = 2026-08-29T10:56:27Z`) and the live subscriber the old
     note warned about is on that row. Nobody has confirmed what they are billed.
   - **`clerk_id_remap`** was applied 2026-09-03 as part of clearing the backlog,
     BEFORE this note was read. It is inert rather than harmful, and that was
     verified rather than assumed: `clerk_id_map` holds 0 rows and
     `verify_clerk_remap()` returns 0, which is what its own header promises
     ("applying this to production is harmless and does nothing on its own").
     It creates one empty table and two functions. The rollback is in the file
     if you want it gone.

   The wider lesson for whoever reads this next: 27 repo migrations were absent
   from production BY VERSION, but 18 of them were already applied through the
   dashboard under DIFFERENT timestamps with the same `name`. An audit that
   matches on version alone reports 27 false absences. Match on `name` too.

---

## Open items, so the new account does not rediscover them

| Item | State |
| --- | --- |
| `wt-core` → `wt-web` promotion | Never done. ~200 commits ahead, includes the pricing change. |
| Browser tests on cloud lanes | The blocker (no browser was ever installed) is fixed. **UNRUN, not passing** — nobody has watched one go green there. |
| Six `.env` deny rules | Present in `wt-core`, absent from the primary worktree's copy. |
| GitHub branch protection | Not configured. The push guard is a hook; a determined person can bypass it. |
