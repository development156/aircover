# Handoff — research — 2026-08-26

**Owner** girija · **Branch** `claude/lead-research-kickoff-qexr94` at `cd8cbdf`,
cut from `wt-core` (`7ae5c37`). Pushed: yes. **PR #7**, draft, into `wt-core`.

This is the **first research handoff that exists**. There is no earlier one on
any branch — only `design-2026-08-25.md`, `jiban-design-2026-08-26.md` and
`divas-advisor-2026-08-26.md`. A first session, not a lost one.

**No research task was ever given.** The founder's arguments were
`owner:girija , branch: wt-girija2 , /lead-research` and nothing more. This
session did kickoff, found the format gate red on an untouched tree, cleared
it, and stopped. Everything below is that, plus what kickoff turned up.

---

## On the identity, because it contradicts the docs

`docs/workflow/08_ROLES.md` says **Girija is design and Jiban is research.** The
arguments put girija in the research lane. I took the arguments as authoritative
over the doc, set `git config sahoda.owner girija`, and the branch resolves to
`research` by substring. **If that is backwards, this file is misfiled and the
config in this lane is wrong** — it is one command to correct.

The arguments also named `branch: wt-girija2`. That branch exists on origin and
points at *exactly* this commit (`git rev-list --left-right --count` → `0 0`
against `origin/wt-core`, `origin/wt-girija2` and `origin/wt-girija3` alike).
The harness pins this session's pushes to `claude/lead-research-kickoff-qexr94`,
so per `08_ROLES` — "do not fight the harness over branch names" — the work is
here and the branch is named. Jiban hit the same thing with `wt-jiban` and made
the same call.

---

## What shipped

| # | what | proof | covered by |
|---|---|---|---|
| 1 | `scripts/auto-handoff.mjs` formatted; the format gate unblocked for every lane cut from `wt-core` | `cd8cbdf` | `prettier --check .` exit 0, unpiped |
| 2 | The lane exists on the remote and carries a draft PR | PR #7 | n/a |
| 3 | The owner is declared | `git config sahoda.owner` → `girija` | none — a config value |
| 4 | This handoff, replacing the machine-written stub | this file | n/a |

**Item 1 was nobody's fault and blocked everybody.** `prettier --check .` was red
on a **clean tree** at `wt-core`'s HEAD. The file arrived from `wt-web` via
`d21bac3` unformatted, and because it is a Stop hook that runs in every session
in every lane, every branch cut from `wt-core` inherits the red. Two other lanes
already hit it and fixed it *on their own branches*; neither fix is in `wt-core`,
so it was still there for me.

---

## What was NOT done, and why

- **No research.** None was assigned and none was invented.
- **The advisor's semantic fix was NOT taken.** `claude/advisor-qvz5wn` carries
  `884eacf` (180 lines), which repairs the live defect where the hook's marker
  string appearing in handoff *prose* makes it overwrite a real handoff — jiban
  measured 343 lines reduced to 38. I took formatting only. Choosing between two
  versions of a hook that runs in every lane is a merge decision, and it is
  still open. **Whoever integrates should take `884eacf`, not mine.**
- **The Playwright smoke leg is UNRUN, not passed.** Two independent blockers
  here, both already recorded: Chromium cannot complete any outbound HTTPS
  request in this sandbox (REQUESTS §25), and `@playwright/test` wants chromium
  1228 against 1194 on disk (jiban). The `smoke` job on `gate.yml` is the place
  to run it.
- **The root `vitest` leg was not run and would be red if it were.** Two
  `mutation-harness` tests `chmod` a directory to `0500` and assert a refusal;
  this container is uid 0 and root bypasses the bits (REQUESTS §26). Red here,
  green on CI's unprivileged runner. Not a defect and not mine.
- **No `pnpm gate` was run in full.** Only the format leg, which is the one this
  commit touches. CI runs the rest.

---

## Shared surfaces touched

**One, and the machine said "none detected", which is the more useful finding.**

`scripts/auto-handoff.mjs` is a **Stop hook that runs in every session in every
lane**. Formatting only — semantically identical, blob-identical to the version
already on `claude/lead-design-7m7ios`. Nothing in `packages/*`, no migration, no
token, no dependency, no fixture.

**The skeleton this file replaced reported `_none detected_` for that same
commit.** Its detector filters on `packages/shared/`, `/migrations/`, and a
regex over `pricing.config|turbo.json|vercel.json|middleware.ts|tokens.css|
.gitignore`. **`scripts/` is in none of them** — so the one file guaranteed to
execute inside every other lane's session is invisible to the shared-surface
detector, and it is invisible *in the hook's own source file*. That is
`05_TRAPS`'s "a detector inherits the blind spot of the code it audits", found
by the detector auditing itself.

I am recording it rather than fixing it: it is the same file the advisor is
already rewriting, and a third lane editing it is how the collision gets worse.

---

## Guards written, and the mutation that proved each

**None written.** Nothing here earns one — the diff is whitespace and quote
style. Claiming a guard for it would be the comfort blanket the doctrine warns
about.

What was *proved by measurement* instead:

| claim | how it was shown |
|---|---|
| The fix is not a third variant of the file | `prettier --write` on `wt-core`'s version, run **inside the repo**, produces blob `8738c8ef32f4955fc18093c012a3caa882184156` — byte-identical to the design lane's. Compared by hash, not by eye. |
| The format gate is genuinely clear | `prettier --check .` at the root, **unpiped**, exit read from `$?`: `All matched files use Prettier code style!`, exit 0 |
| The file still parses | `node --check scripts/auto-handoff.mjs` |

---

## Anything retracted

**One, mine, and it nearly changed the decision.**

I told the founder that running prettier here would produce a **fourth** version
of `auto-handoff.mjs`, conflicting with both other lanes, and recommended against
it on that basis. **That was wrong.** I ran the probe in the scratchpad, which is
*outside* the repository, so prettier fell back to its own defaults — double
quotes, semicolons, 80 columns — instead of this project's `.prettierrc`. The
diff I read was my own harness's output, not the repository's.

Re-run inside the repo, the result is byte-identical to a version that already
exists on another lane. **What I MEASURED:** blob `8738c8e…` from both paths,
compared by `git hash-object`.

This is the fifth wrong-harness result across three lanes in one day — the
advisor logged three in a single session and called it out; jiban logged one.
The shape is always the same: the instrument was wrong and the reading was
confident.

---

## Anything that changes an assumption

1. **`prettier --check .` is red on a clean `wt-core` checkout.** Until `cd8cbdf`
   or an equivalent reaches `wt-core`, every lane cut from it starts with a red
   format leg it did not cause. Two lanes have burned time on this
   independently. **The fix belongs in `wt-core`, not in three lanes.**

2. **A fresh cloud session does NOT inherit the git author.** This one came up as
   `Claude <noreply@anthropic.com>`. `08_ROLES` and `09_CLOUD_SESSIONS` both say
   Vercel **blocks** a deployment whose HEAD is not `SAHODALABS
   <development@sahodalabs.com>`, and a lane's preview is gated on its own HEAD.
   Set it before your first commit or you lose your only visual channel:
   `git config user.name SAHODALABS && git config user.email development@sahodalabs.com`

3. **`scripts/cloud-setup.sh` did not run in this session.** No
   `.sahoda-setup-status`, no `.env`, no `apps/web/.env.local` — only
   `.env.example`. So Supabase and Clerk are unreachable, every database-backed
   suite reports skipped, and **skipped reads as passing**. `CLAUDE.md` says the
   sandbox now gets a `.env`; it did not get one here. Whether that is a settings
   problem or an intermittent boot failure, I could not tell from inside.

4. **The session's own Stop hook is broken in two ways**, and it is not this
   repository's file — it is `~/.claude/`:
   - `--filter="...[origin/main]"`. Every `main` here is 692 commits behind a
     59-route product, so that filter selects packages against a 20-route
     skeleton. Both `CLAUDE.md` and `09_CLOUD_SESSIONS` say never to touch
     `main`; the hook does it on every stop.
   - `echo $INPUT | jq` is **unquoted**, so `jq` dies on control characters in
     the transcript and `stop_hook_active` never evaluates. The re-entry guard
     does not work, which is why it fired twice identically on the same red.

5. **The gate still fires twice per head.** Runs `32947025698` and
   `32947068796`, both `in_progress` on `cd8cbdf` at 08:18Z. The advisor
   documented this — `push` and `pull_request` both trigger and the branch-keyed
   concurrency group is not deduping across event types. Wasteful, not harmful,
   still unfixed.

6. **`find apps/web/src/app -name page.tsx | wc -l` now returns 59, not 58.**
   `09_CLOUD_SESSIONS` and `CLAUDE.md` both use 58 as the tell that you are not
   on a stale `main`. The check still works — 59 is nowhere near 20 — but anyone
   asserting equality against 58 will misread a correct tree.

---

## Gate

Run on `cd8cbdf`, clean tree, from the repo root. **Nothing piped.** Exit codes
read from `$?` on the command itself.

| leg | result | real output |
|---|---|---|
| `prettier --check .` (root) | **PASS** | `All matched files use Prettier code style!`, exit 0 |
| `node --check scripts/auto-handoff.mjs` | **PASS** | parses |
| `turbo run typecheck test` | **NOT RUN BY ME** | the Stop hook ran it with a `...[origin/main]` filter and it reported no failures, but that filter resolves against a 20-route skeleton, so I am not claiming it as a leg |
| root `vitest` (`scripts/`) | **UNRUN** | would be red here for the uid-0 reason above, green on CI |
| `test:smoke` (Playwright) | **UNRUN** | **UNRUN, not passed.** Two blockers, both environmental |
| `next build` | **UNRUN** | not invoked |
| CI `typecheck · lint · test · format` on `cd8cbdf` | **NOT YET REPORTED** | `in_progress` at 08:18:26Z. Not passed, not failed. Read the check-**runs** API by name — Vercel's suites also complete and are not the gate |

**A one-file whitespace commit does not justify claiming a green gate**, and this
lane is not claiming one. The leg that covers the change is green; the rest are
named UNRUN on purpose.

---

## Owed to whoever picks this lane up

1. **Take the advisor's `884eacf` into `wt-core`, not my `cd8cbdf`.** Mine clears
   the red; theirs clears the red *and* fixes the defect, with mutation tests.
   Mine should lose.
2. **Confirm the girija/research pairing** or this file is misfiled.
3. **The research task itself was never given.** My reading of the open items,
   in the order I would take them: the **233 skipped tests nobody has checked**
   (the advisor named it and it is this repo's signature failure mode, though a
   credential-less sandbox is the worst place to tell a closed gate from a broken
   one); **CLAUDE.md's figures have no guard**, measured by jiban; the Marketing
   Brain migration is written and unapplied; Radar has never run.
