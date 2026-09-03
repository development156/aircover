# Handoff — karunesh — wt-karunesh — 2026-09-03

**Branch** `wt-karunesh` at `abd50d3d`. Lane `wt-karunesh`. Pushed: yes, local and
`origin/wt-karunesh` match. PR [#22](https://github.com/development156/sahodalabs/pull/22), draft.

**This is a SHORT handoff and it is short on purpose.** The seven screens this
lane rebuilt are recorded in full in
`karunesh-wt-karunesh-2026-08-31.md`, written three days ago and still the file
to read. Since that one was filed, this lane has taken the trunk, been gated on
a real runner, and drained two ops queues. Nothing else changed.

`date +%F` says **2026-09-03**. The previous handoff was filed on 2026-08-31 by
the same session; the clock moved between turns. Recording it because a reader
comparing the two dates against one continuous conversation would otherwise
suspect one of them was guessed. Neither was — both came from `date +%F`.

## What shipped

| Change | SHA | Covered by |
| --- | --- | --- |
| `wt-core` taken into the lane before handover — 61 commits, no conflicts | `4f4ff0e9` | the full forced gate below, on the merged tree |
| The changelog and QA queues drained, as the session-start sync left them | `abd50d3d` | CI run 1216, green on this exact SHA |

**`abd50d3d` is not this lane's content and the commit message says so.** The
SessionStart hook synced one changelog entry — "Autopilot, ready and switched
off", `wt-divas` work — plus 2,122 lines of QA runs to the live dashboard and
reported `changelog 0 · qa 0`, which empties the queues. **I committed the
drained state rather than reverting it**, and that is a deliberate departure
from this repo's usual "revert `qa.pending.json`" rule: reverting here would
resurrect entries the dashboard has already published and the next sync would
send them twice. The usual rule exists for the vitest writer, which is a
different act on the same file.

## What was NOT done, and why

- **Playwright. Still. UNRUN, not passed, for the third session in a row.**
  MEASURED, run 1133 on `2a9f3a98` dispatched with
  `ack_target=rloztdhzfliyvpvxsgjl`: the smoke job reached its own guard step and
  exited 1 in **20 seconds**, printing `CLERK_PUBLISHABLE`, `CLERK_SECRET` and
  `SUPABASE_URL` **all empty**.

  The founder had just added all six variables and asked for this run. They did
  not reach the runner. **`wt-divas2` reproduced the same finding independently**
  on its own lane (`19ad847f`) and went further than I did: all six names print
  empty in **both** `secrets.*` and `vars.*` at repository scope, and the job
  declares no environment, so an *environment* secret cannot reach it either.
  Two lanes, two dispatches, one conclusion — the values are not at repository
  scope on `development156/aircover`.

  So every visual claim this lane has made across three sessions is reasoned and
  unit-tested, never observed. That is unchanged and it is the largest gap here.

- **`wt-core` was NOT pushed.** `lane-sync push` prints the gate to run first and
  deliberately does not push for you. I ran that gate and it is green (below),
  so this lane is ready for the trunk — but `wt-core` reaches `wt-web`, and the
  push guard added in `6d6b05ac` refuses lane writes to the shared branches
  anyway. **Divas takes this in.**

- **The `radar` origin.** Unchanged from 08-31 and still the one open decision:
  `posts.origin` admits four values in the database, `PostOriginSchema` admits
  three, and `radar.ts:251` throws before the insert — so the Radar "draft a
  reply" button creates no post and charges nothing. Needs the founder's word
  because it is a `packages/shared` contract change, and **must be done together
  with `SAHODA_ORIGINS` in `agency-blade.tsx`** or Radar drafts arrive labelled
  as hand-written.

- **I did not force a preview build of this lane.** MEASURED: no deployment for
  `wt-karunesh` appears in the twenty most recent, so the branch alias serves an
  older build and I could not say which. Offered to the founder, not taken up.

## Shared surfaces touched

**None in these two commits.** No component, type, fixture, token or config that
another lane consumes changed between `8bc2e39e` and `abd50d3d`; the only files
are the two `ops/state/*.pending.json` queues, which are data the ops console
owns and no code imports.

The shared surfaces this LANE carries — `channel-mark.tsx` rewritten as an
adapter over `ChannelLogo`, `post-card.tsx`'s two optional props, `modal.tsx`'s
optional `busy`, `read.ts`'s `listPostMedia` returning `Map | null`, and the new
`lib/posts/media-read-state.ts` — are all listed with their reasoning in the
08-31 handoff. **Whoever merges this lane should read that section, not this
one.**

## Contract, migration or money

**None.** No `packages/shared` change, no migration, no price, no ledger call in
either commit. The `radar` origin above is the one thing that WOULD be a
contract change and it is deliberately not made.

## Guards written, and the mutation that proved each

**None written in this handoff's two commits**, and that is the honest answer:
one is a merge and one is a data drain. **Neither is guardable and neither
should pretend to be.**

The twenty mutations this lane applied and watched go red are tabulated in the
08-31 handoff. All of them are still in the tree and all still pass — CI run
1216 on `abd50d3d` is the evidence.

## Anything retracted

**Nothing new.** The four retractions from 08-31 stand as written: the Radar
drop-on-read claim (the write throws first, so no such row can exist), the
blade's colour (it takes the workspace's brand when Brand Skin is on), "no blade
means a person wrote it" (a `radar` post would carry none either), and the hour
in which the delete work was live carrying a swallowed mutation.

One thing this session **strengthened rather than retracted**: the missing-keys
diagnosis. On 08-31 I could say only that three names read empty. It is now
firmer, from another lane's independent dispatch: **six names, both namespaces,
repository scope, and no environment can supply them.**

## What the next session in THIS lane should pick up

1. **The six secrets, then the browser leg.** Repository secrets on
   `development156/aircover`, under those exact six names, then dispatch
   `gate.yml` with `ack_target=rloztdhzfliyvpvxsgjl`. Two lanes have now proven
   this is the blocker. **If one thing gets done, make it this.**
2. **The `radar` decision**, if the founder says yes — `PostOriginSchema` and
   `SAHODA_ORIGINS` in one commit, with a guard on a seam that currently has
   none. MEASURED: widening the schema changed nothing across 6,251 web tests
   and 509 shared tests, which is the problem.
3. Sweep the rest of the product for TikTok and Slack still being offered —
   `HIDDEN_FROM_OFFER` now governs `/connections` and the composer only.
4. Teach the route sweeps to walk the posts grid's fold; the hidden tiles sit
   outside `no-impossible-remedy` and the contrast detectors.

## Gate

| leg | result |
| --- | --- |
| `CI=1 turbo run typecheck lint test --force --concurrency=1`, at `4f4ff0e9` | **PASS** — 27 successful / 27 total, **0 cached**, 9m52s. `@sahoda/web` 6788 passed / 13 skipped in 222.5s |
| `prettier --check .`, at `abd50d3d` | **PASS** — all matched files |
| CI `typecheck · lint · test · format`, run **1216** on `abd50d3d` | **PASS** — the current head, gated on a clean runner |
| CI `Playwright @smoke`, run 1133 on `2a9f3a98` | **FAIL at its own guard, 20s. UNRUN, not passed** |
| `next build` + `js-budget.mjs` | **PASS at `2a9f3a98`** — 82 routes within budget. **NOT re-run at `abd50d3d`**, whose only delta is two JSON data files no route imports |

**The turbo leg is recorded at `4f4ff0e9`, not at HEAD, and the reason is
stated rather than glossed:** `git diff 4f4ff0e9 abd50d3d` is exactly the two
`ops/state` queues. CI run 1216 then gated `abd50d3d` itself and passed, so the
head is covered by a real runner even though my local forced run predates it by
one commit.

Every claim above is **MEASURED** unless it says otherwise. The one INFERRED
statement in this file is that the two drained JSON files cannot affect a build
— no route imports them, but I did not re-run the build to prove it, and CI run
1216 is what actually stands behind that head.

## In plain terms

Nothing new was built since the last write-up three days ago. What happened is
that your lane took in everyone else's work — sixty-one changes — and was
checked on the shared machine afterwards, which came back clean. Your work is
ready for someone to fold into the shared copy.

The one thing still stuck is the same one: the check that walks the real screens
like a customer has never run on any of this. You added the settings it needs,
but they went somewhere that machine cannot read, and a second person hit the
identical wall on their own work and confirmed it more thoroughly than I could.
Until those settings are in the right place, everything this lane has built is
careful reasoning about screens nobody has watched.
