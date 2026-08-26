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

---

# Session 2

**Branch** `claude/lead-research-kickoff-qexr94` at `c288317`. Lane `wt-girija2`.
Pushed: **yes**. PR [#17](https://github.com/development156/sahodalabs/pull/17),
draft, into `wt-core`.

Session 1's PR #7 is **MERGED** (09:21Z, by IDIVASM), so this is fresh work
rather than a continuation of it. `/kickoff` ran first, `lane-sync pull` took
three commits from `wt-core` CLEAN, then the founder gave one task with two
screenshots: **fix the text readability issue in dark theme.**

## What shipped

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | Clerk's appearance variables renamed to the ones the installed SDK actually has: `colorText`→`colorForeground`, `colorTextSecondary`→`colorMutedForeground`, `colorInputBackground`→`colorInput`, `colorInputText`→`colorInputForeground` | `c288317`, `apps/web/src/lib/clerk-appearance.ts:52-79` | `apps/web/src/lib/design/clerk-dark-legibility.test.ts` |
| 2 | Three variables Clerk supplies light-card defaults for and this file never set: `colorNeutral: var(--ink)`, `colorBorder: var(--line)`, `colorPrimaryForeground: var(--pfg)` | same | same |
| 3 | The input fill moved `--s1` → `--s2` | `clerk-appearance.ts:74` | `the input well is distinguishable from the card`, both themes |
| 4 | `satisfies ClerkAppearance`, the type derived from `ClerkProvider`'s own prop rather than hand-written | `clerk-appearance.ts:9`, `:180` | `tsc --noEmit -p apps/web/tsconfig.json` |
| 5 | The runtime guard, 25 tests, resolving each variable through `tokens.css` and grading the PAIR | `clerk-dark-legibility.test.ts` | itself, four mutations below |

**MEASURED** on the `#171717` dark card, arithmetic on the tokens each variable resolves to:

| pair | before | after |
|---|---|---|
| secondary text | Clerk default `#747686` → **3.99:1**, under AA | `--muted` `#979797` → **6.14:1** |
| the `colorNeutral` alpha family (borders, dividers, quietest text) | black-derived; **opaque** black on that card is **1.17:1**, so no alpha in the family is readable | `--ink` `#ffffff` → **17.93:1** |
| input fill / its text | white box, black text | `--s2` `#212121` / `#ffffff` → **16.10:1** |

Light was also under AA and nobody had noticed: `#747686` on white is **4.49:1**.

## What was NOT done, and why

- **The fix has NOT been seen rendered.** Both guards are arithmetic on tokens;
  neither rasterises a Clerk component. Clerk's UI is fetched from Clerk's CDN
  and this sandbox cannot reach it. **The Vercel preview is Ready** at
  `sahodalabs-git-claude-lead-re-7c7482-development-4417s-projects.vercel.app`
  and is where a human confirms this by eye.
- **Two independent browser blockers here, both MEASURED this session**, and the
  second is NEW — it is not the outbound-HTTPS one REQUESTS §25 records:
  1. the MCP Playwright server wants Chrome at `/opt/google/chrome/chrome`, which
     is not installed;
  2. the repo's own `@playwright/test` refuses to launch — bundled-Chromium
     version mismatch, the one jiban recorded as 1228-wanted against 1194-on-disk.
- **`test:smoke` UNRUN, not passed.** Same cause.
- **Root `vitest` (`scripts/`) UNRUN**, and would be red here: two
  `mutation-harness` cases `chmod` to `0500` and assert refusal; this container
  is uid 0 and root bypasses the bits (REQUESTS §26). Green on CI's
  unprivileged runner. **This is the ONE gate leg CI covers that the local run
  did not** — if the gate ever executes and is red, look there first.
- **The `--pfg` element-level override on `formButtonPrimary` was NOT removed**
  even though `colorPrimaryForeground` now exists. It also pins `backgroundImage:
  none` to kill Clerk's gradient, which the variable cannot do.
- **Nothing was done about the stop hook's request to reauthor commits** to
  `noreply@anthropic.com`. Four files pin `SAHODALABS <development@sahodalabs.com>`
  and `08_ROLES.md:107` states Vercel BLOCKS a deployment without it. Complying
  would have cost this lane its only visual channel, and it wanted history
  rewritten on two merge commits, one of them already inside merged `wt-core`.

## Shared surfaces touched

**One, and it is a real one.**

`apps/web/src/lib/clerk-appearance.ts` is consumed by
`apps/web/src/app/layout.tsx:95` — the ROOT layout, so it themes every Clerk
surface in the product: `/sign-in`, `/sign-up`, the UserButton popover in the
topbar, and every Clerk modal.

**It is additive for readers and changes no existing key's meaning**, with one
exception worth naming: the input fill now resolves `--s2` where it used to
resolve `--s1`. That token was never reaching Clerk, so nothing regressed — but
a lane that has pinned Clerk's input colour in a screenshot test will see it
move, in BOTH themes.

Nothing in `packages/*`. No migration. No token added or edited. No dependency.
No fixture.

## Contract, migration or money

**None.** No `packages/shared` change, no price, no migration, no ledger path.

## Guards written, and the mutation that proved each

**Two, five mutations, every one WATCHED red and then restored.**

| guard | mutation applied | what happened |
|---|---|---|
| `satisfies ClerkAppearance` | re-added `colorText: 'var(--ink)'` | `tsc` **exit 1**: `clerk-appearance.ts(53,5): error TS2353: Object literal may only specify known properties, and 'colorText' does not exist in type 'Variables'.` Removed → **exit 0** |
| `clerk-dark-legibility.test.ts` | `colorMutedForeground` back to the dead `colorTextSecondary` | **4 red** — the dead-name check, the required-key check, and the secondary-text ratio in BOTH themes |
| same | `colorNeutral: 'var(--bg)'` (a card-coloured neutral, which is what black was) | **2 red**, both themes |
| same | `colorInput: 'var(--bg)'` (well flattened into the card) | **2 red**, both themes |
| same | restored | **25 pass** |

The runtime guard grades the **ratio between a text colour and what sits behind
it**, never a pinned hex, so a legitimate palette retune does not fail it. It
follows alias chains (`--muted` → `--ink-mute`) using the same reader
`dark-surface-ladder.test.ts` established.

## Anything retracted

**One, mine, and it changes what someone should act on.**

At 16:21Z I reported that **no runner had picked up any job**. That was
incomplete. Jobs ARE being assigned and then dying about two seconds in, before
`actions/checkout` finishes, with logs returning HTTP 404.

**What I MEASURED**, four attempts, one signature:

| run | attempt | job window |
|---|---|---|
| 32986696875 | 1 | 16:03:38 → 16:03:40 |
| 32988019578 | 1 | 16:22:29 → 16:22:31 |
| 32988112940 | 1 | ~16:23:3x |
| 32986696875 | **2** (my re-run) | 16:23:47 → 16:23:49 |

Also MEASURED: the Playwright job in attempt 2 reports `completed_at`
**16:03:38Z**, twenty minutes BEFORE its own `started_at` of 16:23:47Z.
Timestamps running backwards are not a test result.

The conclusion is unchanged — infrastructure, not this diff — but the diagnosis
moves from "no capacity" to "runners failing at startup", and those need
different people to look at them.

## Anything that changes an assumption

1. **`prettier --check .` is CLEAN on a fresh `wt-core` checkout now.** Session
   1's item 1 reached `wt-core` via merged PR #7. The red every lane inherited
   is gone. Session 1's assumption 1 is CLOSED.
2. **`wt-core` now carries the auto-handoff semantic fix AND its test**
   (`scripts/lib/auto-handoff.test.mjs`). Session 1's owed item 1 is CLOSED —
   nothing to port.
3. **`gate.yml` did not fire on the push for `c288317`.** Not new: `gate.yml:48-54`
   documents it and REQUESTS §27 records it. Manual `workflow_dispatch` with
   `ack_target` left EMPTY is the safe way to force it — checks only, no
   Playwright, no database write.
4. **Seven runs were queued at 16:21Z** across four branches and two workflows,
   the oldest since 15:09:29Z. Three other pull requests are blocked identically.
5. **The sandbox came up INCOMPLETE again.** No `.sahoda-setup-status`, no `.env`,
   no `apps/web/.env.local`, `core.hooksPath` UNSET so `.githooks/pre-commit` is
   DISARMED. `node_modules` present and the git author correct this time.
   13 tests report skipped, and skipped reads as passing.
6. **`/kickoff` was rewritten upstream** (`13f74a6`) and now restores context and
   STOPS. It does not plan and does not start work.

## What the next session in THIS lane should pick up

1. **Look at the Vercel preview and confirm the dark sign-in page by eye.** It is
   the one thing this session could not do and the only reason the fix is not
   fully proven. `/sign-in` in dark, then the UserButton popover.
2. **Watch PR #17 to green.** As of 16:23:49Z its head `c288317` is red for the
   infrastructure reason above, one standing-down comment is posted
   (`issuecomment-5427975068`), and the single permitted re-run is SPENT. Do not
   comment again for the same cause. **Do not push an empty commit.**
   `gate.yml`'s concurrency group cancels in progress on the branch, so any push
   kills a run in flight.
3. **If the gate finally executes and is red, root `vitest` is the first place to
   look** — the only leg CI covers that the local run did not.
4. **Still open from Session 1, none of it touched:** confirm the girija/research
   pairing against `08_ROLES.md`, which says Girija is design; the 233 skipped
   tests nobody has checked; CLAUDE.md's figures have no guard.
5. **A finding worth a lane of its own.** Clerk renamed its appearance API and
   nothing in this repository noticed for however long — no typecheck, no lint,
   no test. The same shape may exist wherever a config object is handed to a
   third-party SDK through a variable rather than an inline literal, because
   that is precisely what disables TypeScript's excess-property check.
   `satisfies` is the cheap fix and it is one line per site.

## Gate

Run from the repo root on `c288317`, clean tree, **nothing piped**, exit codes
read from the command itself. The turbo leg was run on the identical tree
immediately before the commit, which added exactly the two files it covers.

| leg | result | real output |
|---|---|---|
| `npx tsc --noEmit -p apps/web/tsconfig.json` | **PASS** | exit 0, zero lines |
| `turbo run typecheck lint test --filter=@sahoda/web` | **PASS** | `Tasks: 11 successful, 11 total`, exit 0, 2m20.664s |
| `@sahoda/web` vitest | **PASS** | `391 passed, 3 skipped (394)` files · `4976 passed, 13 skipped (4989)` tests, **136.61s — not a cache replay** |
| `clerk-dark-legibility.test.ts` alone | **PASS** | `25 passed (25)`, 316ms |
| `npx prettier --check .` (root) | **PASS** | `All matched files use Prettier code style!`, exit 0 |
| root `vitest` (`scripts/`) | **UNRUN** | would be red here, uid 0. REQUESTS §26 |
| `test:smoke` (Playwright) | **UNRUN** | **UNRUN, not passed.** Two blockers, both above |
| `next build` | **UNRUN** | not invoked. Vercel built the branch and reports **Ready** |
| CI `typecheck · lint · test · format` on `c288317` | **FAILURE, and not this diff's** | four attempts, each ~2s, logs HTTP 404. Never reached a test step |

**Last read at 16:23:49Z. The GitHub MCP server disconnected afterwards, so
anything later than that is unverified from this session.**
