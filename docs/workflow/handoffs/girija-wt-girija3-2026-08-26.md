# Handoff — girija — wt-girija3 — 2026-08-26

**Branch** `claude/lead-research-kickoff-dw8slw` at `c3499cc`. Lane `wt-girija3`.
Pushed: **yes**. PR [#19](https://github.com/development156/sahodalabs/pull/19)
→ `wt-core`, draft, `mergeable_state: unstable` (failing checks, **no conflict**).

**This is the first session in `wt-girija3`.** `ls girija-wt-girija3-*.md` returned
nothing at kickoff. A first session, not a lost one.

**The lane is `wt-girija3`; the branch is not.** The harness pinned this cloud
session to `claude/lead-research-kickoff-dw8slw` and it cannot leave. Per
`08_ROLES` the work stays there and `git config sahoda.lane` stays `wt-girija3`,
which is why this file carries that name. Three other sessions hit the same thing
today and made the same call.

**The role was `/lead-research`, and `08_ROLES.md` disagrees** — it says girija is
design and jiban is research. The arguments win over the doc, per `/kickoff`.
girija's `wt-girija2` session raised this same contradiction earlier today and it
is still unruled. See the decisions section.

---

## What shipped

The founder reported one defect and then ruled it applied twice. Both are done.

| # | What | Proof | Covered by |
|---|---|---|---|
| 1 | The paid re-resolve on the /brain aside is a **secondary button**, not accent-coloured prose inside a paragraph | `ed11803`, `apps/web/src/components/brain/brain-header.tsx:133` | `apps/web/src/components/brain/brain-header.test.tsx` — 4 tests, all four proved by mutation |
| 2 | The same control on `/brain/resolve`, same shape | `c3499cc`, `apps/web/src/app/(app)/brain/resolve/page.tsx:256` | `apps/web/src/app/(app)/brain/resolve/page.test.tsx` — 4 tests, all four proved by mutation |
| 3 | The existing page-level guard **retargeted, not deleted**, and one assertion stronger | `ed11803`, `apps/web/src/app/(app)/brain/page.test.tsx:210` | itself |
| 4 | A false claim removed from a code comment, with the measurement that killed it | `c3499cc`, `resolve/page.tsx` §THE PAID PATH | see "Anything retracted" |
| 5 | The gate's account-wide runner failure established and reported once on the PR | [issuecomment-5428184230](https://github.com/development156/sahodalabs/pull/19#issuecomment-5428184230) | n/a — a measurement, not code |

### The defect, stated exactly

MEASURED: `Re-running the whole resolve` was an inline `<Link>` styled
`font-semibold text-accent underline-offset-2 hover:underline`. **Accent colour at
rest, underline only on hover**, inside a muted paragraph, in a card whose eyebrow
(`Worth answering next`) is also accent colour. The one control on that panel that
navigates away and spends credits was the same colour as the panel's decorative
heading. Reading it as emphasis was the correct reading of what was on screen.

### Why secondary and not primary

A re-resolve rewrites every field **including the ones just confirmed** — the exact
opposite of what a person reading either screen is doing. It must be unmistakably
pressable and unmistakably not the recommended path.

### Why no credit figure on either label — READ THIS BEFORE ADDING ONE

The list price is 50. **It is not always the price.** `isFirstResolve` reads
`brand_memory` and takes the FREE path when it is empty, which is why
`onboarding-flow.tsx:401` passes `regenerateCost={isFree ? 'free' : cost}` and not
the constant, with its own comment saying a card reading "Uses 50 credits" would
quote a charge the server is not going to make.

Neither component runs that query. A number typed into either label would be a
figure nothing produced.

INFERRED, and worth checking before acting on it: on `/brain/resolve` the brain
provably exists (the branch only renders on `status === 'ok'`), so `brand_memory`
is non-empty and that resolve *is* paid. The amount is still not queried, and the
bulk accept beside it reads `Confirm all 15 · free`, which primes the reader to
expect a number that would then have to be right.

---

## What was NOT done, and why

- **The Playwright `@smoke` leg is UNRUN. Not passed — UNRUN.** Chromium cannot
  complete an outbound HTTPS request in this sandbox and every `@smoke` spec signs
  in through Clerk (REQUESTS §25). The `smoke` job on `gate.yml` is where it runs,
  and it needs a runner, which is the blocker below.
- **No credit amount on either button.** Reasoned above. It needs the cost plumbed
  from `pricing.config.json` through to both components, which is its own change
  with its own tests.
- **The design-lint baseline was NOT tightened.** It reports `1 file(s) improved`
  on two of its checks and offers `--update-baseline`. That baseline file is shared
  across all nine lanes; tightening it from inside one lane is how a lane breaks
  five others.
- **Nothing was pushed to `wt-core`.** `/handoff` step 4 conditions that on the
  gate, and the gate has an UNRUN leg. PR #19 is the reviewable record and it
  targets `wt-core`; pushing `HEAD:wt-core` directly would land unreviewed work on
  the branch that feeds production and make the PR moot.
- **No second standing-down comment and no second dispatch** on the runner failure.
  One comment, one dispatch, then silent re-checks — which is what the rule says
  while the same blocker holds.
- **`@sahoda/db` skipped 12 of 46 test files** on the forced run. Not investigated:
  not this lane's ground and not caused by this diff. Flagged because this project's
  own doctrine is that a suite which ran nothing reports as passing.

---

## Shared surfaces touched

**None.**

MEASURED: `git diff --stat 3137bc3..c3499cc` is 5 files, all under `apps/web/src`,
all inside `brain/`. No `packages/shared`, no `packages/db`, no migration, no
token, no fixture, no config, no `pricing.config.json`, no `.github`. Two files are
new tests, one is an existing test retargeted, two are components.

The only import added anywhere is `cn` from `@/lib/utils` into two files that
already imported `buttonVariants`. Nothing another lane consumes changed shape, so
there is no constructor to break.

## Contract, migration or money

**None.** No contract, no migration, no ledger call, no price.

The change is adjacent to money — it makes a paid action visible — but it charges
nothing, reads no price, and adds no figure. That last point is the deliberate one
and it is argued above.

## Guards written, and the mutation that proved each

**8 new tests, and every one was watched going red.** Two different mutations,
because three of the eight guard a different claim from the other five.

**Mutation A — restore the inline link verbatim** on both files. Six of the eight
go red:

```
× is a control, not a run of text
    AssertionError: expected 'font-semibold text-accent underline-o…' to contain 'inline-flex'
× is not the panel primary — a re-resolve destroys confirmed work
    AssertionError: expected 'font-semibold text-accent underline-o…' to contain 'bg-surface'
× the price and the consequence reach a screen reader before the press
    AssertionError: expected null to be truthy
```

**Mutation A caught a weak guard, which is the point of doing it.** On the first
pass, `renders on the every-field-confirmed branch too` **survived** — it asserted
`href` alone, and the inline link has the same `href`. It proved nothing about the
branch it names. It gained the `inline-flex` assertion and now fails under A too.

**Mutation B — swap the two halves of the resolve page's sentence** so the reader
meets "paid" before "free". Only the eighth guard goes red, which is correct
because it is the only one asserting that order:

```
× the free path is still stated, and still stated first
    AssertionError: expected 175 to be less than 44
```

**What the guards assert, and what they deliberately do not.** They pin the
AFFORDANCE (`getByRole('link')` plus the `inline-flex` / `h-control` /
`bg-surface` classes that come only from `buttonVariants`) and the CLAIM (the
described-by paragraph still matches `/paid/i` and `/confirmed/i`). The label is
matched through `/re-run/i`, so the sentence stays rewritable. Per the copy rule:
retarget a guard, never delete it.

**One guard failed the wrong way first and was fixed.** The initial fixtures were
object literals; `Provenance` is a `ReadonlyMap`, so all four crashed with
`TypeError: provenance.get is not a function`. An accidental `TypeError` is not a
passing guard and it is not a failing one either — the fixtures are real `Map`s now
and `tsc` caught the same class of error again in the resolve fixture
(`readCitedPassages` returns a Map, not an array).

## Anything retracted

**A ruling written into `resolve/page.tsx` was reversed, and half of it was false.**

It read: *"THE PAID PATH, as a link with its price attached and never as a button
beside the free ones. docs/26 §1.5 allows one primary per view and it is the bulk
accept."*

MEASURED, against the code that comment describes:

| Control | Variant | Source |
|---|---|---|
| The bulk accept | **`secondary`** | `apps/web/src/components/brain/confirm-all.tsx:73` |
| Every resolution-row control | `secondary` or `ghost` | `resolution-row.tsx:236,244,264,273,315` |
| The console's own control | `ghost` | `resolution-console.tsx:165` |
| **Any primary on this view** | **none exists** | the four rows above are all of them |

The bulk accept is not a primary. It shipped as a ghost, was reported invisible by
someone looking straight at it, and was raised one rung — with its own comment in
that file saying so. **So the primary that note was rationing does not exist and
never did**, and the rule it invoked did not apply.

The note's second half stands and is why the new button is secondary. The note is
**reproduced in place with the correction rather than deleted**, so nobody
re-derives it from scratch.

**Nothing else is retracted.** No earlier measurement in this lane was found wrong.

---

## What the next session in THIS lane should pick up

1. **Check whether GitHub Actions can start runners.** Everything below waits on
   it, and it is not this lane's to fix. A scheduled check-in is armed for 19:46Z;
   if the session has ended, re-check by hand. The moment a gate job reports a real
   `runner_id`, dispatch `gate.yml` on this branch with `ack_target` **empty** and
   drive PR #19 to green.
2. **Run the `@smoke` leg** on the `smoke` job of `gate.yml`, dispatched by hand
   with the project ref typed in. It has never run on this lane.
3. **Decide the price question** (below) and, if yes, plumb the effective cost from
   `pricing.config.json` into both buttons. Do not type `50`.
4. **Do not re-litigate the `resolve/page.tsx` comment.** It was reversed on the
   founder's explicit ruling and the reversal is argued in the file itself.

## Gate

Every leg run on `c3499cc`, unpiped, real output.

| Leg | Command | Result |
|---|---|---|
| Typecheck (web) | `npx tsc --noEmit` | **PASS** — exit 0 |
| Lint (web) | `pnpm lint` | **PASS** — exit 0, 1222 files scanned |
| Format (root) | `npx prettier --check .` | **PASS** — "All matched files use Prettier code style!" |
| Unit (web) | `npx vitest run` | **FAIL** — 4959 passed, **2 failed**, 11 skipped, 395 files |
| Turbo typecheck+test (all other packages) | `npx turbo run typecheck test --concurrency=1 --force` | **PASS** — 16/16 successful, **0 cached**, 3m36s |
| Unit (root) | `npx vitest run --root .` | **FAIL** — 229 passed, **2 failed** |
| Playwright `@smoke` | `pnpm test:smoke` | **UNRUN** |
| Build / JS budget | Vercel preview on `c3499cc` | **PASS** — Ready |

**The turbo leg was run TWICE and the first run proved nothing.** It returned in
`789ms >>> FULL TURBO`, `16 cached, 16 total`. That is a cache replay. Re-run with
`--force`: 3m36s, `0 cached`, same 16 successful. The figure in this table is the
forced one.

### The 4 failures, grouped by error message — two environments, no diff

**Group 1 — `getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co`.** Two
tests, one file, `apps/web/src/lib/privacy/export-drift.test.ts`. It opens a direct
connection to the production database, which this sandbox cannot resolve.
**Reproduced identically on a stashed, untouched tree**, so it predates this work.

**Group 2 — the mutation harness's two write-refusal tests.** `refuses a directory
that exists but cannot be written to` and `refuses the whole run when the scratch
directory cannot be used`, in `scripts/lib/mutation-harness.test.mjs`. They `chmod`
a directory to `0500` and assert the write is refused.

MEASURED, and proved directly rather than asserted:

```
uid=0 (root)
$ mkdir ro && chmod 0500 ro && echo hi > ro/probe.txt
WROTE INTO A 0500 DIRECTORY -> the refusal these tests assert cannot happen as root
dr-x------ 2 root root 4096 ro
-rw-r--r-- 1 root root    3 ro/probe.txt
```

Root bypasses the permission bits, so the refusal never occurs and the assertion
fails. Red here, green on CI's unprivileged runner. This is REQUESTS §26, recorded
by girija's `wt-girija2` session before this one. **Not a defect and not mine.**

I could not run the counter-experiment (the same two tests as a non-root user):
`setpriv --reuid=65534` fails at startup with `EACCES` on `node_modules/.vite-temp`.
The direct write probe above establishes the mechanism without it.

### The gate on CI has not run at all, on any branch, for over five hours

This is the finding that matters most beyond this lane.

MEASURED across two sampling windows, 13:19Z-16:35Z and 16:39Z-18:24Z, 60 runs of
`gate.yml`:

| | |
|---|---|
| Successful runs | **0** |
| Runs finishing in under 60s | 26 of the first 30; all 30 of the second |
| Explicit `startup_failure` | 4 |
| Branches affected | all six active lanes |

Every failing job reports `runner_id: 0`, `runner_name: ""`, **no `steps` array at
all**, and every log download returns **HTTP 404**. The jobs do not run and fail;
they fail to start. Ten consecutive such jobs on this branch alone.

I dispatched one by hand on this exact head to rule out the `pull_request`
non-firing defect (REQUESTS §27): run
[32989598015](https://github.com/development156/sahodalabs/actions/runs/32989598015),
`workflow_dispatch`, head `ed11803`, `ack_target` empty so `smoke` correctly
skipped and **nothing was written to any database**. Failed in 16s with the same
empty runner.

INFERRED, and I could not confirm it: the shape points at the shared account's
Actions spending or usage limit. The billing endpoint returns **403** through this
session's proxy (`sessions are bound to their configured repositories`). Consistent
with REQUESTS §26's neighbouring entry — until `concurrency` was keyed correctly,
every commit on a branch with an open PR ran the full 10-12 minute gate **twice**
against one shared pool.

**Nothing in a pull request can make a runner start**, so there is no fix to port.
One comment on PR #19 says exactly this; the one permitted re-run is spent.

---

## In plain terms

The founder pointed at a line of orange text on the Brand Brain screen. It looked
like the sentence was just stressing a phrase, but it was actually the one place
you could click to start your whole brand over — which costs money and wipes every
answer you have already approved. It is now a proper button, on that screen and on
the second screen that had the identical problem.

While doing the second one I found that the comment in the code arguing *against*
making it a button had a factual mistake in it. It claimed a particular control on
that screen was the loud, main button, and it is not — it is a quiet one, and was
deliberately made quiet a long time ago. So the rule it appealed to did not apply.
I corrected the note in place instead of deleting it, so the next person can see
both the old reasoning and why it did not hold.

Everything checks out on this machine: types, formatting, code style, and 4,959
automated tests. Four tests fail for two reasons that have nothing to do with this
work, and I proved both rather than assuming — one needs a database this sandbox
cannot reach, and two only pass when run as an ordinary user rather than an
administrator, which is how the real build machine runs them.

The thing that should worry somebody: GitHub's own automatic checking has not
managed to start once in more than five hours, for anybody on the team. It is not
failing the tests, it is failing to switch on, which usually means a spending limit
has been hit. Until somebody with access to the billing page clears it, every lane
is working without a safety net.

## What needs a decision

1. **Somebody with account access must check the GitHub Actions billing or usage
   limit.** All six lanes are blind until then. This is the urgent one.
2. **Should the re-resolve buttons carry `· 50 credits`?** It would match both
   neighbouring buttons, but it needs the effective cost plumbed from
   `pricing.config.json`, not typed.
3. **Is `08_ROLES.md` wrong about girija being design, or were the arguments
   wrong?** Two sessions have now asked. One line settles it.
