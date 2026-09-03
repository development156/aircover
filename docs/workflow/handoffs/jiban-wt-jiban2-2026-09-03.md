# Handoff — jiban — wt-jiban2 — 2026-09-03

**Branch** `wt-jiban2`. The work is at `87abe541`; the branch tip carries this handoff
on top of a fresh `wt-core` merge (`lane-sync` took 268 trunk commits first). Lane
`wt-jiban2`. Pushed: yes.
**MERGED into `wt-core`** — MEASURED, `git merge-base --is-ancestor HEAD origin/wt-core`
returns true, and `87abe541` is 97 commits back on `origin/wt-core` (tip `2dba741c`).
PR #31 merged 2026-08-31 05:27Z; this session unsubscribed from it after confirming.

This session added NO new code. It ran the founder's `/goat` design work that was already
committed to green, watched PR #31 to its merge, and now files the record. Everything in
"What shipped" landed under `87abe541` and its two parents.

## What shipped

| # | what | proof | covering test |
| --- | --- | --- | --- |
| 1 | The five supplied logos (Facebook, Google, Instagram, Pinterest, Reddit) as vector, split out of the "evocations" file | `apps/web/src/components/connections/brand-marks.tsx` | existing channel-mark map guards, mutation-proved (instagram → facebook mark; facebook removed) |
| 2 | `/loop` rebuilt as a control centre: the rail is the hero, pause and status beside the title, `paused` a prop not local state | `54f5f43b` + `apps/web/src/app/(app)/loop/page.tsx` | `remedy-anchors.test.ts` (new), `verdict.test.ts` |
| 3 | The seven-step rail: seven equal columns, connector halves meeting on the column boundary, no absolute positioning | `54f5f43b` | rail column-width guard, written because the "remove the outer halves" mutation survived three existing tests |
| 4 | `/home` rebuilt: one card language for all nine regions, the four metrics as ONE divided board, the queue leading full width | `5560d2bd`, `apps/web/src/components/home/section.tsx:41` | `apps/web/src/components/home/section.test.tsx` — 7 tests |
| 5 | Five colour class names that emitted zero CSS, in 16 places across 8 screens and the shell | `399db704` | `scripts/design/dead-classes.mjs` (a report, not a gate) |
| 6 | `/report` as a numbered briefing with a 320px sticky insights column | `87abe541`, `apps/web/src/components/report/module.tsx:48`, `insights.tsx:55` | `apps/web/src/components/report/insights.test.tsx` — 10 tests |

Piece 5, MEASURED by compiling `globals.css` against each name — zero bytes emitted for all
five, against real rules for their correct spellings:

| dead class | uses | what the element actually had |
| --- | --- | --- |
| `bg-subtle` | 10 | no fill |
| `bg-warn-subtle` | 2 | no fill |
| `bg-s3` | 2 | **no hover response at all, on all 59 routes** |
| `text-fg` | 1 | inherited |
| `border-hairline` | 1 | the default border colour |

Turning fills ON is where contrast regressions come from, so every text token landing on the
two newly-live fills was MEASURED on the composited colour in both themes: 12 combinations,
all pass AA, tightest **5.28:1** (`text-muted` on `bg-warn-bg`, dark).

## What was NOT done, and why

- **Playwright `@smoke` is UNRUN, not passed.** MEASURED this session: the gate's smoke leg
  fails in `apps/web/e2e/global-setup.ts:30` with `ClerkAPIResponseError` — `clerkSetup()`
  cannot fetch a testing token from this sandbox. That is the environment, not the diff. The
  branch is merged, so running it now belongs to whoever promotes `wt-core` → `wt-web`.
- **No automated check measures any of these layouts in pixels.** jsdom computes no layout.
  Every guard here pins a MECHANISM and says so in its own header; the pixel claims rest on
  Chromium renders at 1440 light, 1440 dark, 1024 and 420, made from the real page component.
- **The report's three requested animations were not built.** docs/37 §12 allows this product
  ONE entrance; adding three vocabularies is a system decision, not a page one. Open.
- **The report's requested line chart was refused, deliberately.** There is no measured series
  on that page and its own caption says so in the same breath. A guard now stops it being
  "restored" from the design.
- **"448 of 600 · 74.7% remaining" was refused.** `balance_total` is credits OWNED, not an
  allowance; the bar is `spent of the cycle's weekly budget` instead, which is a real ratio.
- **`connections-widths.spec.ts:51` still pins `TILES = 8` against a 15-channel catalogue.**
  Pre-existing, unrelated, still not fixed.
- **`dead-classes.mjs` is still a report, not a gate leg.** Making it one needs the six prose
  false positives handled first (strip comments before scanning) and must run AFTER
  `turbo-build`, since compiled CSS is the only trustworthy answer. That is a change to the
  gate and belongs to whoever owns it.

## Shared surfaces touched

**None in `packages/*`.** Every file this lane wrote is under `apps/web/src` or
`docs/workflow`. Two `apps/web` primitives other screens consume DID change, both additively:

| primitive | change | breaks a caller? |
| --- | --- | --- |
| `components/charts/stat-card.tsx` | added `icon?`, `variant?: 'card' \| 'cell'` to `StatCardProps`; `board?` to `StatStrip` | **No** — all three are OPTIONAL with the old behaviour as the default. A reader is unaffected; there is no new required field |
| `components/home/rail-cards.tsx` `RailCard` | gained a REQUIRED `id` prop, and became a thin adapter over `HomeSection` | **Yes, for constructors.** Every call site in this lane was updated; a lane that adds a `RailCard` on top of a stale checkout will fail typecheck, which is the correct failure |
| `lib/design/ink-faint-exceptions.ts` | one `legitimate` entry added for `components/report/module.tsx` | No |

`lib/loop/schedule.ts` is new and its test reads `vercel.json` itself, so the copy cannot
drift from the cron.

## Contract, migration or money

**None.** No file under `packages/shared`, no migration, no change to `pricing.config.json`,
no ledger path touched, no price or charge altered. The `/report` credits card READS
`readBalance()` — it joins the page's existing `Promise.all` and is `cache()`d behind the
layout's own credit chip, so it adds no query and writes nothing.

## Guards written, and the mutation that proved each

Twenty-six mutations across the six pieces, each applied to source, WATCHED go red, reverted.
The ones worth keeping:

| guard | mutation applied | outcome |
| --- | --- | --- |
| `section.test.tsx` | `border-b border-line-soft` put back on the header | RED — the ruled grammar returns to all nine regions |
| `section.test.tsx` | `flush` dropping the HEADER's padding as well as the body's | RED — one heading sits 20px left of every other in its column |
| `section.test.tsx` | `variant="cell"` dropped from one metric | RED — a ringed pane inside a ringed board, two edges 1px apart |
| `section.test.tsx` | seams drawn with `divide-x` instead of a gap | RED — the rule lands on the wrong edge when the row wraps |
| `section.test.tsx` | the count badge rendered at zero | RED — a "0" beside a heading reads as a state to clear |
| `insights.test.tsx` | a sparkline `<svg>` added to the glance card | RED — this is the likeliest thing a later reader "restores" from the design |
| `insights.test.tsx` | a zero printed instead of the absence mark | RED |
| `insights.test.tsx` | the bar drawn with no budget set | RED |
| `insights.test.tsx` | the bar left uncapped past budget | RED |
| `insights.test.tsx` | an unreadable balance shown as 0 | RED |
| `insights.test.tsx` | `dark:bg-s2` dropped from the tinted square | RED |
| `insights.test.tsx` | the ordinal exposed to screen readers | RED |
| `insights.test.tsx` | the credit plural hard-coded back to "credits" | RED |
| `remedy-anchors.test.ts` | `id="loop-current"` deleted while `eligibility.ts` still links to it | RED — nothing caught this before; `verdict.test.ts` asserts the href string and `no-impossible-remedy.spec.ts` never follows a link |

**Two mutations SURVIVED existing tests, which is why their guards now exist:**

- the rail's outer connector halves REMOVED rather than made transparent — survived three
  tests, none of which could see a column change width;
- "Clear filters" resetting the search but not the category — survived eleven tests, because
  the empty state was only ever reached by typing.

**Two of the repo's own guards caught this work and both were right:** `credit-words` found a
figure that can be 1 interpolated straight into "credits"; `ink-faint` refused the `01–05`
ordinal until the exception was declared with its reason.

## Anything retracted

- **A dark-mode defect I nearly reported was my HARNESS, not the product.** MEASURED: setting
  `data-theme` via `page.evaluate()` after load does not repaint — cards read
  `rgb(255,255,255)` against a `--surface` of `#171717`. With the attribute written into the
  document they read `rgb(23,23,23)`, correct. Nothing was wrong with the product.
- **The render harness silently dropped the whole type scale on its first pass.** `--font-inter`
  is undefined outside Next, which makes the `font:` shorthand invalid and flattens every rung
  to 16px/400. Found and fixed BEFORE any typography claim was made.
- **A commit title said "sixteen colour classes", implying 16 names.** It is 5 names in 16
  places. Amended before pushing.
- **The gate's first two legs replayed from cache** (6.9s and 6.7s) and verified nothing. Re-run
  forced; the numbers below are the forced run.

## What the next session in THIS lane should pick up

**This lane is merged and finished. Do not stack new commits on `87abe541`** — restart
`wt-jiban2` from `origin/wt-core` (`git fetch origin wt-core && git checkout -B wt-jiban2
origin/wt-core`) before any new work. PR #31 is merged and cannot track anything new.

Four things are open and each needs a FOUNDER DECISION, not a session:

1. **The brand orange.** The design brief asked for `#FF6A00`; the system is `#FF6600`. Moving
   it is a token change felt on all 59 routes, so it was not made unilaterally.
2. **`dead-classes.mjs` as a blocking gate leg.** The obvious next step, and the reason piece 5
   existed at all. Needs the six prose false positives handled and must run after
   `turbo-build`.
3. **The report's three animations.** docs/37 §12 allows ONE entrance.
4. **The repository rename `sahodalabs` → `aircover`.** The GitHub remote already answers to
   `aircover`; the docs and the lane tooling still say `sahodalabs`. Flagged, not acted on.

## Gate

MEASURED 2026-09-03 on `wt-jiban2` at `87abe541`. The two turbo legs were re-run with
`--force` because the first run replayed from cache in under 7 seconds and verified nothing.

| leg | command | result |
| --- | --- | --- |
| typecheck · lint · test | `pnpm exec turbo run typecheck lint test --force` | **PASS** — `27 successful, 27 total`, **`0 cached, 27 total`**, 5m44.905s |
| ↳ `@sahoda/web` | | **PASS** — `6248 passed \| 13 skipped (6261)`, 496 files |
| ↳ `@sahoda/sites` | | **PASS** — `1566 passed (1566)` |
| ↳ `@sahoda/db` | | **PASS** — `732 passed \| 207 skipped (939)` |
| ↳ `@sahoda/shared` | | **PASS** — `509 passed (509)` |
| ↳ `@sahoda/publishing` | | **PASS** — `473 passed (473)` |
| ↳ `@sahoda/billing` | | **PASS** — `401 passed \| 13 skipped (414)` |
| ↳ `@sahoda/jobs` | | **PASS** — `396 passed (396)` |
| ↳ `@sahoda/mesh` | | **PASS** — `198 passed (198)` |
| ↳ `@sahoda/research` | | **PASS** — `195 passed (195)` |
| root vitest | `pnpm vitest run --root .` | **PASS** — `223 passed (223)`, 15 files |
| format | `pnpm exec prettier --check .` | **PASS** — all matched files use Prettier code style |
| Playwright `@smoke` | `pnpm gate` leg 3 | **UNRUN — not passed.** `ClerkAPIResponseError` at `e2e/global-setup.ts:30`; `clerkSetup()` cannot fetch a testing token from this sandbox. Environment, not diff |
| CI on `87abe541` | GitHub `typecheck · lint · test · format` | **PASS** — 16:42:22Z → 16:48:00Z, same figures |

**The 207 skipped `@sahoda/db` tests and the 13 skipped billing tests are not a pass.** They
are the known live-database and key-dependent skips; a suite that ran nothing reports as
passing, which is how twenty-six billing tests never executed for months.

## Gate again, after `lane-sync` took 268 trunk commits

The figures above are the lane alone. `lane-sync push` merged `wt-core` in first, so the gate
was re-run on what `wt-core` will actually receive. MEASURED 2026-09-03, all legs forced.

| leg | result |
| --- | --- |
| `pnpm exec turbo run typecheck lint test --force` | **PASS** — `27 successful, 27 total`, **`0 cached, 27 total`**, 5m57.714s |
| ↳ `@sahoda/web` | `7669 passed \| 13 skipped (7682)` |
| ↳ `@sahoda/db` | `843 passed \| 207 skipped (1050)` |
| ↳ `@sahoda/sites` | `1566 passed (1566)` |
| ↳ `@sahoda/shared` | `465 passed (465)` |
| ↳ `@sahoda/publishing` | `473 passed (473)` |
| ↳ `@sahoda/jobs` | `411 passed (411)` |
| ↳ `@sahoda/billing` | `401 passed \| 13 skipped (414)` |
| ↳ `@sahoda/mesh` | `228 passed (228)` |
| ↳ `@sahoda/research` | `195 passed (195)` |
| `pnpm vitest run --root .` | **PASS** — `231 passed (231)` |
| `pnpm exec prettier --check .` | **PASS** |

### The first run of this gate went red, and it was a stale artifact — worth reading

`@sahoda/web:typecheck` failed with **`TS2307: Cannot find module
'../../src/app/(app)/studio/[id]/page.js'`**, in `.next/types/validator.ts` and in
`.next/types/app/(app)/studio/[id]/page.ts`. MEASURED: `apps/web/src/app/(app)/studio/`
contains only `page.tsx` — there IS no `[id]` route — and the `.next/types` tree was dated
**Aug 30 16:31**, generated by a build on a tree from before the trunk merge deleted it.
`apps/web`'s `typecheck` is a bare `tsc --noEmit`, so it type-checks whatever generated types
are lying on disk, including routes that no longer exist.

**Clearing `apps/web/.next/types` made it green with no source change.** This will catch the
next person who merges trunk into a lane holding an older build, and the failure names a file
that looks like source but is not. `.next/` is gitignored build output; deleting it is always
safe.

The four "failures" reported alongside it in that run were the one real task plus its three
dependents. The `PROVIDER_ERROR` and `socket hang up` lines in the log are test fixtures
asserting failure paths, not failures.

## The gate that actually cleared this lane into `wt-core`

`wt-core` moved 17 commits while the previous gate ran, so that gate no longer described the
tree being pushed and was re-run from scratch on the re-merged one. MEASURED 2026-09-03, every
leg forced, `0 cached, 27 total`, 9m25.849s.

| leg | result |
| --- | --- |
| `pnpm exec turbo run typecheck lint test --force` | **PASS** — `27 successful, 27 total` |
| ↳ `@sahoda/web` | `8052 passed \| 13 skipped (8065)` |
| ↳ `@sahoda/db` | `958 passed \| 198 skipped (1156)` |
| ↳ `@sahoda/sites` | `1566 passed (1566)` |
| ↳ `@sahoda/publishing` | `510 passed (510)` |
| ↳ `@sahoda/shared` | `480 passed (480)` |
| ↳ `@sahoda/jobs` | `472 passed (472)` |
| ↳ `@sahoda/billing` | `417 passed \| 13 skipped (430)` |
| ↳ `@sahoda/mesh` | `235 passed (235)` |
| ↳ `@sahoda/research` | `195 passed (195)` |
| `pnpm vitest run --root .` | **PASS** — `240 passed (240)` |
| `pnpm exec prettier --check .` | **PASS** |

### And a mistake of mine, recorded because the next person will make it

I amended the merge commit `lane-sync` had **already pushed**, which rewrote published history
and made the lane diverge from its own remote. The push was rejected, correctly. The fix was to
merge `origin/wt-jiban2` back in, NOT to force-push — the two commits carried identical trees,
so the merge was trivial. **Never amend after `lane-sync push` has run.** Commit the correction
on top instead.

## Working tree

`ops/state/qa.pending.json` was modified by the session-start ops sync on every startup. It is
generated state and must never be committed; restored with `git checkout --` each time. Nothing
else was left uncommitted.
