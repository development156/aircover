# Handoff — karunesh — wt-karunesh — 2026-09-03

**Branch** `wt-karunesh` at `5f962f96`. Lane `wt-karunesh`. Pushed: yes, local and
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
| `wt-core` taken into the lane — 61 commits, no conflicts | `4f4ff0e9` | superseded by the `5f962f96` gate below |
| The changelog and QA queues drained, as the session-start sync left them | `abd50d3d` | CI run 1216, green on this exact SHA |
| `wt-core` taken again at handover time — **197 further commits**, no conflicts | `5f962f96` | the forced gate below, re-run on this tree |

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

**None in this handoff's three commits.** No component, type, fixture, token or config that
another lane consumes changed between `8bc2e39e` and `5f962f96` from THIS lane; the only files
are the two `ops/state/*.pending.json` queues, which are data the ops console
owns and no code imports. The two `wt-core` merges of course bring other lanes' surfaces with them, but those are theirs to declare, not mine.

The shared surfaces this LANE carries — `channel-mark.tsx` rewritten as an
adapter over `ChannelLogo`, `post-card.tsx`'s two optional props, `modal.tsx`'s
optional `busy`, `read.ts`'s `listPostMedia` returning `Map | null`, and the new
`lib/posts/media-read-state.ts` — are all listed with their reasoning in the
08-31 handoff. **Whoever merges this lane should read that section, not this
one.**

## Contract, migration or money

**None.** No `packages/shared` change, no migration, no price, no ledger call in
any of them. The `radar` origin above is the one thing that WOULD be a
contract change and it is deliberately not made.

## Guards written, and the mutation that proved each

**None written in this handoff's three commits**, and that is the honest answer:
two are merges and one is a data drain. **None is guardable and none
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

All at `5f962f96`, the pushed head, **after** `lane-sync push` brought 197 more
trunk commits in. Every leg below was re-run on that tree; nothing here is
carried over from the pre-merge run.

| leg | result |
| --- | --- |
| `CI=1 turbo run typecheck lint test --force --concurrency=1` | **PASS** — 27 successful / 27 total, **0 cached**, 7m34s. `@sahoda/web` 7669 passed / 13 skipped in 197.5s |
| `prettier --check .` | **PASS** — all matched files |
| `next build` + `js-budget.mjs` | **PASS** — 82 routes within budget |
| CI `typecheck · lint · test · format`, run **1216** on `abd50d3d` | **PASS** — a clean runner, one commit behind this head |
| CI `Playwright @smoke`, run 1133 on `2a9f3a98` | **FAIL at its own guard, 20s. UNRUN, not passed** |

### The typecheck failed first, and the reason is a trap this repo has hit before

**MEASURED.** The first forced run on `5f962f96` failed `@sahoda/web#typecheck`
with three errors, all of one shape:

```
.next/types/app/(app)/studio/[id]/page.ts(2,24): error TS2307:
  Cannot find module '../../../../../../src/app/(app)/studio/[id]/page.js'
```

**Not a real error, and proven so rather than assumed.** `apps/web/src/app/(app)/studio/`
holds `page.tsx` and nothing else — the trunk removed `studio/[id]` in the 197
commits just merged. Next generates route types into `.next/types/**`, which is
gitignored (`.gitignore:22`), so my local copy still described a route the source
no longer has. **A rebuild regenerated them and `tsc --noEmit` exits 0.**

This is the third time this shape has cost a session time — my own 08-28 handoff
records it, and `divas/wt-divas` recorded it again on 09-01 and left it
unverified. **A session that trusted that output would have "fixed" someone
else's working code.** The tell is the path: an error inside `.next/` is build
output, never source.

Every claim above is **MEASURED**. There is one INFERRED statement left in this
file — that the two drained `ops/state` JSON files cannot affect a build, since
no route imports them. CI run 1216 and the clean `next build` on this head are
what actually stand behind it.

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
