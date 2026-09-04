# Handoff — divas — wt-divas — 2026-09-04

**Branch** `wt-divas` at `2ba397e0` (+ this handoff). Lane `wt-divas`. Pushed:
**yes**. The lane had already been merged into `wt-core`, so this began by
fast-forwarding onto `3a89e60f` and building from there. **Two sessions are
recorded here** — the second starts at "Session 2" below.

**Preview:** <https://sahodalabs-git-wt-divas-development-4417s-projects.vercel.app/analytics>
**Live:** not promoted.

The job was a 39-item QA register published against `wt-core`, with the
instruction to fix everything. The register says all 39 are closed. **Four things
were not**, and one of them is the reason the register's biggest open item exists
at all.

## What shipped

| What | Proof | Test that covers it |
| ---- | ----- | ------------------- |
| An auto QA run is attributed to no card, instead of borrowing whichever is open | `scripts/ops-hook-bash.mjs:91` | `ops-hook-bash.test.mjs` — 3 new |
| A scanner is decided by a call shape, not a bare identifier in prose | `scripts/lib/scanner-registry.mjs:73` | `scanner-registry.test.mjs` — 6 new |
| The radar heading in the page and in the specs are held equal | `apps/web/src/app/(app)/radar/heading.guard.test.ts` | itself — 3 |
| A component nothing renders cannot arrive unnoticed | `scripts/lib/unmounted-components.mjs` | `unmounted-components.test.mjs` — 7 |
| `tsconfig.base.json`'s comment no longer credits itself with a class it cannot see | `tsconfig.base.json:21` | n/a — a comment |

### The one worth reading

**A remedy can be real, project-wide, and unable to see the defect it was written
for.** The register's item 32 says a dead-code check is now on across the whole
project and that it is "the check that finds the next four". MEASURED: it IS on —
all ten tsconfigs inherit `noUnusedLocals` / `noUnusedParameters`, none overrides
it — and all four defects it names are the CONSUMER side, where a symbol arrives
in a file unused and the compiler has a local to point at.

**TypeScript never reports an exported symbol nobody imports.** So the producer
side is invisible: a component written, exported, tested and mounted nowhere
compiles clean forever, because there is no unused import — there is no import at
all. The same register then reports 14 files, about 2,000 lines, unreachable from
any screen. That is this defect at scale, and the check credited with preventing
it could not have seen one of them.

`scripts/lib/unmounted-components.test.mjs` is the half that can.

**Scoping was decided by measurement, not taste.** A general unused-export sweep
over `apps/web/src` returns 103 symbols and most are legitimate: fixture data,
lint-rule tables, deliberate test helpers. Narrowing to exported components
returns 91, of which **79 are `app/**` route files** — `page.tsx`, `layout.tsx`,
`loading.tsx`, `error.tsx` — framework entry points that are correctly never
imported. Excluding `app/` entirely rather than filtering it leaves **12**, ten of
them real, and two (`week-card.tsx`, `report-body.tsx`) are named in the
register's own decision item. A rule that is 87% noise on day one is a rule
someone deletes, which is why this is a ratchet over a named baseline rather than
a wall.

Counting a component's own tests as usage would have hidden the entire class —
every one of those four defects was written, tested and mounted nowhere — so the
usage corpus is product files only, and "tested but unmounted" is reported as the
worse case.

## What was NOT done, and why

- **Playwright @smoke: UNRUN, not passed.** Chromium here cannot complete an
  outbound HTTPS request and every @smoke spec signs in through Clerk. Item 06 of
  the register is a direct consequence of that gap, and this lane's radar guard
  exists because the leg that should catch it cannot run.
- **Did not merge the radar heading into one constant.** Doing it properly means
  either shipping test code into the bundle or making an e2e helper resolve `@/…`
  inside Playwright's runner, which **cannot be verified here**. An unverifiable
  change to a guard is what caused the original defect, so both copies stay and a
  vitest guard holds them equal instead.
- **Did not wire up the 14 unreachable files.** Where a feature goes on a screen
  is a product decision, not a bug fix. They are now recorded by name in
  `ops/lint-baselines/unmounted-components.json` so they cannot be forgotten
  again, which is the part that was mine.
- **Did not fix `asset-library.test.tsx`.** See below.
- **Did not re-verify the 5 money items with a second adversarial reader.** The
  first pass called all five clean and only non-clean items went to refutation, so
  a false clean would not have been caught. I read item 05 myself end to end and
  it holds — `correctedSeqs` is window-scoped, the copy separates "above" from
  "on a newer page", and `credit-activity.test.tsx:161` asserts that sentence. The
  other four are INFERRED clean, not measured by me.

## Shared surfaces touched

| Surface | Change | Breaks whom |
| ------- | ------ | ----------- |
| `scripts/lib/scanner-registry.mjs` | `findScanners` now filters on a call shape; new `readsSource` export | Nobody. MEASURED across all 124 candidates: the two nets disagree about ZERO files, and the baseline does not move — 0 entries stop being scanners, 0 new undeclared. |
| `scripts/ops-hook-bash.mjs` | Auto QA runs carry `task_code: null` | Nobody. The schema is already `nullish()` and `qa-run-row.tsx` already renders "no card". The commit path is untouched. |
| `tsconfig.base.json` | Comment only, inside the existing JSONC block | Nobody. No compiler option changed. |
| `ops/lint-baselines/unmounted-components.json` | New file, 12 entries | New gate rule. It is a ratchet: it refuses growth, and shrinking needs `--update-baseline`. |
| `apps/web/e2e/helpers/headings.ts` | Header corrected; no export changed | Nobody. |

## Contract, migration or money

**None of the three.** No `packages/shared` change, no migration written or
applied, no price, no ledger write, no call to `apply_ledger_entry`.

## Guards written, and the mutation that proved each

| Guard | Mutation | Result |
| ----- | -------- | ------ |
| QA runs carry no borrowed card | put `currentTaskCode()` back | **RED** ×2, naming `SL-054` in the failure message |
| A scanner is a call, not a sentence | make `readsSource` use the bare-identifier net again | **RED** ×3 |
| An unmounted component cannot arrive | add a component nothing renders | **RED**, naming file and symbol |
| …and it tracks reachability, not files | then MOUNT that component | that entry **clears** and the new host reds instead |
| The radar heading matches its specs | rename the `h1`, forget the helper | **RED** ×2, naming both files |
| …and the pattern stays anchored | remove the anchors from `RADAR_H1` | **RED** on the substring assertion |
| …and it fails rather than crashes | make the heading an interpolation | throws the written sentence, not a `TypeError` |

Every mutation restored from a scratchpad copy, never `git checkout`. The
two-way mutation on the unmounted-component guard is the one that matters: a
one-way mutation would not have shown that it tracks mounting rather than the
mere existence of a file.

**The gate caught one of my own.** `heading.guard.test.ts` used `match![1].trim()`
under `noUncheckedIndexedAccess`, so a missing capture group would have been a
`TypeError` rather than a failing assertion. An accidental crash is not a guard.
Fixed in `7aabb93b` and both mutations re-run after the refactor.

## Anything retracted

**One, and it is mine from the previous session.** I reported
`scripts/lib/scanner-registry.mjs` as leaving `wt-core` red. It is not: `wt-core`
reworded the offending comment in `logo-facts.test.ts`, which cleared the symptom.
The CAUSE was still there — the rule still fired on prose — and is what this lane
fixed, but "wt-core is red" was true when written and false by the time it was
read.

## What the next session in THIS lane should pick up

1. **The decision the register asked for, unchanged**: 14 files, ~2,000 lines,
   reachable from no screen. Three features — stamping a logo onto a generated
   picture, a weekly comparison card, a rewritten CMO report — plus a live
   database table nothing writes to. They are now named in
   `ops/lint-baselines/unmounted-components.json`.
2. **Widen the unmounted check beyond `apps/web/src/components`** once it has
   lived through a few merges. `app/**` must stay excluded; the interesting next
   scope is `packages/*/src`.
3. **`asset-library.test.tsx`** — see the gate note below.
4. **The three repository secrets.** Still the reason the end-to-end suite has
   never run automatically.

## Session 2 — the fourteen, the analytics read, and two decisions taken

Everything below happened after `a7836f8d` and is on `wt-divas` through
`2ba397e0`.

### Asked to connect 14 unreachable components. Almost none was un-wired work.

Mapping every one first — three agents, then a resolved import-graph walk —
found that most are the OLD version of something that deliberately replaced
them. Mounting them as asked would have reinstated up to **24 live Zernio calls
per analytics render** (removed in `af3c20cc`), put two "By channel" headings on
one page, and re-added the onboarding colour picker the 29 August ruling removed.
The founder chose: delete the superseded ones.

| Component | Verdict | Successor |
| --------- | ------- | --------- |
| `ChannelBrowser` | deleted | `ConnectionMarketplace` — better keying, glyphs, responsive rail |
| `ColorField` (+ `palette.ts`, 266 lines of CSS) | deleted | `visual-step.tsx` + `extractPalette`, founder's ruling 2026-08-29 |
| `SurfaceNotice` | deleted | `ThreadPlaceholder` |
| `InertColumn` / `InertToggle` | deleted | `leads/board.tsx` · `FestivalForm` + `Blocked` |
| `Stagger` | deleted, cascade | the ratchet named it when its last call sites went |
| `ReportBody` + all of `lib/report/` | deleted (session 2) | the numbered briefing that ships |
| `ChannelTable`, `PostTable`, `WeekCard` | left in the baseline | their capability gap is closed instead — see below |
| `DRAWN_KINDS`, `THEME_SCRIPT_SOURCE` | left | test seams; declared false positives |
| `OnboardingFlow`, `WeekGrid`, `DropZone` | left in the baseline | genuinely unresolved, see below |

**Retargeting the deleted tests found three live regressions.**
`SurfaceNotice`'s 17 tests moved onto `ThreadPlaceholder`, which had none of its
own. Six then failed on behaviour the three-pane rework had dropped: `unresolved`
had lost its connect CTA, the "which accounts did not answer" list was rendered
nowhere for `could_not_ask`, and `data-surface-state` was gone. All restored.

### Two decisions, taken because they were left to me

**The CMO Report is the numbered briefing.** `87abe541` replaced the page with
it and `af3c20cc` deleted the five readers the rival design needed as dead code.
Mounting `report-body.tsx` was never a missing import — it was rebuilding a data
layer removed on purpose to reinstate a design replaced on purpose. Deleted 11
modules and 4 test files, verified a CLOSED cluster first: every product consumer
of all eleven was inside the eleven. The reasoning is recorded on the surviving
page and names the commits.

**`asset_logo_facts` keeps its GDPR entry and its `readable` flag** — the list's
promise is completeness and the policy claim is true. The SENTENCE was the false
part, and it now says the measurements are worked out per draw and not kept,
instead of implying an empty table means we measured nothing.

### /analytics shows impressions and engagement

Never for want of data: `post_metric_snapshots` has stored all three since it was
created and the nightly job captures all three. The read asked for
`.eq('metric', 'reach')`.

Three things had to be right at once, and each is a note in the code:

- **The shared age still comes from reach alone.** Feeding all three to
  `commonAge` would pick the day SOME metric was recorded and shift every reach
  figure a customer has already seen, as a side effect of adding two columns.
- **The cap is `ROW_CAP * SNAPSHOT_METRICS.length`.** Tripling the rows for the
  same history would push a busy workspace over and report the whole page
  unreadable — a regression that looks like a database fault.
- **The absence does NOT reuse `MetricAvailability`.** Its `never-measured` copy
  reads "{Platform} has not reported metrics for this post", which blames the
  channel for our own collecting job missing a night.

Shown in `PostRows` as two sortable columns and in `ChannelCards` per channel,
each with its OWN coverage count.

### The measurement worth inheriting

A resolved **import-graph walk from every route** found **74 unreachable
modules**; the text-matching guard finds 8. It also corrected a deletion my grep
had got wrong — `grep "report/read'"` claimed six live consumers by matching
sibling `./read` imports elsewhere; there is one.

It has its own false positives (framework entry points, dynamic imports,
test-only modules), so it is NOT shipped as a gate rule. The script is
`scratchpad/reach.mjs` in this session and is 30 lines. **Turning it into the
guard, with a triaged baseline, is the highest-value work left here.** The
striking cluster is 17 files under `components/onboarding/` — the whole
pre-`stage/` flow, `OnboardingFlow` among them.

## Gate

MEASURED on `7aabb93b`. Nothing piped; `--force` on turbo so no leg is a cache
replay.

| Leg | Result |
| --- | ------ |
| turbo `typecheck lint test` | **PASS after re-run** — see below. `Cached: 0 cached, 27 total`, 8m33s |
| root vitest | **PASS** — 17 files, **256 tests** (19 of them new here) |
| prettier | **PASS** — "All matched files use Prettier code style!" |
| Playwright @smoke | **UNRUN.** Not passed. |

**The turbo leg was red once, on a test this lane does not touch**, and the honest
account matters more than the final number. `src/components/assets/asset-library.test.tsx
> offers Undo, which puts back only what this call moved` failed with `expected
"vi.fn()" to be called at least once`.

MEASURED: it passes **4 of 4** runs of that file alone and **2 of 2** full
`@sahoda/web` test legs afterwards (631 files passed, 3 skipped, both runs). The
test's own comment already root-caused this on 2026-08-27 — "red once in three
full runs … the signature of `waitFor`'s 1s default expiring on a busy machine" —
and raised its timeout to 5s. My failing run had a background `next build` and a
fan-out of subagents competing for CPU, which is heavier load than that
mitigation was measured against.

So: **not this lane's diff, and not called a flake either.** It is a load-sensitive
`waitFor` race with a known author, a written diagnosis and one mitigation already
applied. The proposed next step belongs to whoever owns that file — make the
assertion await the handler's own settled state rather than a wall-clock window —
and is deliberately not done here, because widening someone else's test to get my
own gate green is how a guard goes soft.
