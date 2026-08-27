# Handoff — jiban — wt-jiban — 2026-08-27

**Owner** jiban · **Lane** `wt-jiban` · **Branch** `claude/lead-design-7m7ios`
at `f0b16ee`. Pushed: yes. PR
[#12](https://github.com/development156/sahodalabs/pull/12) → `wt-core`, draft.

> This replaces the stop hook's generated stub, which listed the commits and
> said it did not know why any of them happened. Sessions 1 to 17 are in
> `jiban-wt-jiban-2026-08-26.md` (1130 lines) and nothing there is superseded.
> This file exists only because the date rolled over mid-session.

**Session 18 is short and mostly about a defect no guard could have caught.**

## What shipped

| # | what | proof | covered by |
|---|---|---|---|
| 1 | The `/assets` folder lid stopped sitting behind its own body in dark | `asset-folders.tsx`, `f0b16ee` | `lib/design/folder-depth.test.ts` |
| 2 | The header paragraph that made the false claim, corrected in place | same file | none — it is a comment |

## The defect, and why it survived every check

The folder tiles are drawn as a physical folder: a BACK panel on `--surface-2`,
sheets peeking out, a FRONT panel overlapping the lower two thirds. The front
carried `bg-surface` with no `dark:` variant, and the file's own header claimed
"the two steps hold in BOTH themes".

| theme | front on back | front lighter? |
|---|---|---|
| light | `#ffffff` on `#f2f2f3` = **1.119** | yes — correct |
| dark, before | `#171717` on `#212121` = **1.113** | **no — inverted** |
| dark, after | `#292929` on `#212121` = **1.107** | yes — fixed |

`--surface` is the LIGHTEST rung in light and the DARKEST in dark. So in dark the
lid receded one step behind the body and the folder read as a pale slab with a
dark plate stuck on it.

**`tonal-ladder.test.ts` asserts adjacent rungs clear a 1.03:1 floor. The BROKEN
pair cleared it by MORE than the fixed pair.** A contrast ratio is unsigned —
every check in this repo that looks at these two surfaces was asking about the
GAP, and the gap was never the problem. The ORDER was.

`--surface-3` is nominally the hover/pressed rung and is used as a resting fill
on purpose: what the panel needs is "one step LIGHTER than the back", and in dark
that is the only rung that is. Light is untouched.

## What was NOT done, and why

- **The 3D open-on-hover folder animation the founder asked for is UNBUILT.**
  See "blocked on a decision" below. This session fixed the folder's DEPTH, not
  its motion.
- **The pasted component was not integrated at all.** Its CSS block redefines
  `--background`, `--foreground`, `--primary`, `--border`, `--radius` and
  `--acc`-adjacent tokens in OKLCH; pasting it silently reverts Session 16's
  `#f60` ruling and fails the palette guards. It also uses bounce easing
  (`cubic-bezier(0.34,1.56,0.64,1)`, overshoots past 1) and 500-600ms durations,
  both refused by docs/37 §12 and by `impeccable`'s own motion rules.
  **`lucide-react` (^1.25.0) and `tw-animate-css` (^1.4.0) are ALREADY
  installed** — none of its install instructions apply here. MEASURED: the
  shadcn class names it uses (`bg-card`, `text-foreground`,
  `text-muted-foreground`, `bg-muted`, `border-border`) DO resolve in this
  system; I expected them not to and was wrong.
- **Playwright UNRUN.** REQUESTS §25.

## Shared surfaces touched

**None this session.** One file under `apps/web/src/components/assets/`, plus a
new test under `apps/web/src/lib/design/`. No token moved — the fix is a `dark:`
variant at one call site, not a change to `--surface` or `--surface-3`.

(The stop hook's stub listed `packages/shared/tokens.css` under this heading. It
was reading the whole branch, not this session: that file was last touched by
`60c0c4a` on 26 August and IS a shared-surface change, recorded in Session 16.)

## Contract, migration or money

**None.**

## Guards written, and the mutation that proved each

`lib/design/folder-depth.test.ts` — asserts luminance ORDER per theme, plus a
third case that measures the pair which shipped, so the blind spot is recorded
executably rather than only in prose.

| mutation | result |
|---|---|
| front reverts to `--surface` in dark (the code that shipped) | **RED** — `dark: front #171717 must be lighter than back #212121` |
| the light case, same run | **GREEN** — light was never broken |
| restored | 3 passing |

## Anything retracted

**One, from this session's own reconnaissance.** I expected the pasted
component's shadcn class names to be absent from this design system and said so
before checking. MEASURED: `--color-card`, `--color-foreground`,
`--color-muted-foreground`, `--color-border` and `--color-accent` all exist in
`globals.css`. The integration would not have failed on class names; it would
have failed on the CSS block and the motion.

## Anything that changes an assumption

**`/assets` is contested ground and this lane does not own it.** The divas lane
(`claude/divas-kickoff-xdoxoa`, PR #18) has a DB-backed named-folder system with
migration `20260826120000_asset_folder_system.sql` **already applied to
production**. MEASURED: 20 files differ against `wt-core`, including its own
`folder-tile.tsx` whose header describes the same three-layer shape, and
`asset-folders.tsx` differs from this branch by **227 lines**. None of it is in
`wt-core` yet.

This lane's folders are three computed predicates — Photos, In use, Not used yet
— each a `cards.filter(match).length` over real rows, from the founder's 25
August ruling that named folders had no column to come from. **That ruling has
been superseded by another lane and this tree has not caught up.**

`f0b16ee` is safe: it changes one className on the front panel, which survives
either model. Anything larger will collide.

## What the next session in THIS lane should pick up

1. **BLOCKED ON A DECISION — the folder animation.** The founder asked for the
   3D open-on-hover folder and pointed at THIS lane's preview, which settles that
   they mean these folders. They were asked "here or divas" and have not
   answered. **Do not start it unasked, and do not merge PR #18 into this lane.**
   If the answer is "here", pull PR #18 first and build on the real folder model;
   if "divas", send them the brief plus the canon fixes (one ease, ≤280ms, no
   bounce, no resting shadow, keyboard-reachable cards, no CSS block).
2. **Run the `smoke` job before this merges.** Unchanged from Session 17, and now
   also covers `/assets`.
3. **The four admin `outline-accent` sites** are still at 2.94:1, below the 3:1
   non-text floor. Session 16's open ruling.
4. **`/connections` first tile row** carries ~135px of dead space in three of
   four cards. Raised, not fixed; the remedy is a design choice.
5. **A stale assertion, still unverified.** `connections-honesty.spec.ts:119-121`
   asserts `/X posts this month \d+ of \d+/i` against copy reading "N posts
   remaining this month". Check it in the same run as item 2.

## Gate

Forced, clean tree, repo root, nothing piped. `Cached: 0 cached, 27 total`.

| leg | result | real output |
|---|---|---|
| `turbo run typecheck lint test --concurrency=1 --force` | **PASS** | `27 successful, 27 total` · `0 cached` |
| ↳ `@sahoda/web:test` | **PASS** | `391 passed \| 3 skipped (394)` files, `4959 passed \| 13 skipped (4972)` tests |
| `prettier --check .` (root) | **PASS** | `All matched files use Prettier code style!` |
| `scripts/design/design-lint.mjs` | **PASS** | exit 0 |
| Playwright execution | **UNRUN** | REQUESTS §25 |
| Vercel preview | **PASS** | Ready on `f0b16ee` |

## CI: no job has executed since 11:01 UTC on 26 August

**Seven commits on this branch, ZERO executed jobs.** Every gate run completes in
2 to 7 seconds with `runner_id: 0`, an empty `runner_name` and 404 logs. Six PRs
are affected (12, 13, 14, 16, 18, 19). Last real execution anywhere: run 244
(`32960490718`), this branch at `7e41231`, 13 steps, SUCCESS 11:01:12.

**Run wall-clock duration is NOT execution time** — the clock starts when a run
is ACCEPTED and includes queue time. This was got wrong twice on 26 August and
both errors reached the PR: run 306 showed 1136s and its jobs ran 2s; run 290
attempt 2 showed 984s and its job ran 11s. **Always read the JOB record.**

Three re-runs are spent. Three comments are on PR #12 — `5424538897` (blamed
billing), `5428226762` (a correction that was itself wrong and carried a
FABRICATED run URL), `5429343976` (the retraction, with job-level evidence).
**Billing is neither confirmed nor ruled out**; from this side a quota block and
a capacity shortage are indistinguishable.

---

# Session 19 — the /connections redesign against a reference screenshot

**Branch** `claude/lead-design-7m7ios` at `5736edfc`. Lane `wt-jiban`. Pushed: yes.
PR [#21](https://github.com/development156/sahodalabs/pull/21) → `wt-core`, draft,
`mergeable_state: clean`.

The harness pinned this session to `claude/lead-design-7m7ios` and it cannot leave
it. `sahoda.owner` / `sahoda.lane` are `jiban` / `wt-jiban`. Note that
`jiban-wt-jiban2-2026-08-27.md` also records work on this same branch: two lanes
have now shipped through one `claude/...` branch, so **the branch is no longer a
proxy for the lane** and only these files say which is which.

## What shipped

| # | What | Proof | Covered by |
| --- | --- | --- | --- |
| 1 | `PageTitle` gained an optional `crumb`, so /connections opens `Connections › Integrate` | `page-title.tsx:57`, `f11d60d7` | `page-title.test.tsx` ×5 |
| 2 | A glyph on every category rail row, drawn as a local sprite | `kind-glyph.tsx`, `f11d60d7` | `kind-glyph.test.tsx` ×5, `connection-marketplace.test.tsx` ×1 |
| 3 | The channel card states what the platform is for again, `line-clamp-2` | `channel-tile.tsx:282`, `f11d60d7` | `channel-tile.test.tsx` ×2 |
| 4 | Search field h-10 → h-11 (44px) | `connection-marketplace.tsx:176` | none — a size, not a claim |
| 5 | Page subtitle rewritten and WIDENED | `connections/page.tsx:249` | none — see below |
| 6 | `min-w-0` scoped to the trail; the empty `<nav>` landmark removed | `page-title.tsx:59`, `5736edfc` | `page-title.test.tsx` ×2, both mutation-proven |

## The reference asked for three things this did not copy, each on a measurement

**MEASURED, all three.** They are the whole of the founder-facing argument.

| The reference has | What shipped | The number |
| --- | --- | --- |
| Solid green Connect buttons on every card | `secondary`, unchanged | 20 solid brand fills fail `accent-budget.spec.ts`, which enforces one primary ACTION per view |
| The trail's second segment in the brand colour | `type-h3 text-ink` | `--acc` is `#ff6600` = **2.94:1** on `--canvas`; 16px/650 is not WCAG large text, so the floor is 4.5:1 |
| Category icons, imported | A hand-drawn sprite | 11 `lucide-react` icons → **693.0 kB against a 683.9 kB budget +8 kB slack**, 1.1 kB over. Same build without them: `js-budget ok`. Sprite: route chunk 10.2 kB, inside budget |

The third one is the interesting one. Session 18's `connection-marketplace.tsx`
header refused seven glyphs on a byte measurement and ended "if they come back,
they come back with a shared sprite". They came back as a shared sprite, and the
budget refused the naive version a second time before it did.

## What was NOT done, and why

- **The Playwright leg is UNRUN, and this is the worst the environment has been.**
  `scripts/sandbox-probe.mjs` reports **`NO_BROWSER`** — the Chromium binary is not
  installed at all, where previous sessions at least had one that could not reach
  HTTPS. So **every responsive claim in this session is INFERRED from class names**:
  1 column below 700px, 2 columns 700–1180 with the rail as a horizontal strip,
  sidebar + 2 columns 1180–1360, sidebar + 3 columns above 1360.
  `connections-widths.spec.ts` covers the rail at seven widths for free once it runs.
- **No screenshot.** Same cause.
- **The placeholder is "Search channels", not the requested "Search integrations…".**
  The product's noun is *channel* — `Channel` the type, "Connect your channels",
  "No channels match that". A second word for one thing is drift, and the brief's
  own §4 permits alignment with existing product wording. **This is a deliberate
  deviation from an explicit instruction and the founder was told so.**
- **The subtitle is not the requested sentence.** "Browse available platforms and
  choose the next connection to add" is true of less of this screen than what it
  replaces, because the screen also manages linked accounts and disconnects them.
  Copy rule 1. It keeps the sentence's JOB and widens it: "Browse every platform
  Sahoda can connect, add the next one, and manage what is already linked."
- **No `/connections/integrate` route was created.** The trail states a location and
  neither segment is an anchor. Making it real is a route split, not a design change.
- **The /connections dead-space item and the four `outline-accent` admin sites at
  2.94:1** are untouched. Both are open findings from Sessions 16–18, outside this ask.

## Shared surfaces touched

**One, and it reaches 32 screens.**

- **`apps/web/src/components/page-title.tsx`** — gained an OPTIONAL `crumb?: string`.
  Additive; **breaks no constructor**, and 31 of the 32 call sites pass nothing and
  render byte-identical markup. That last clause is a claim a reviewer partially
  refuted and it took `5736edfc` to make true: the first version put `min-w-0` on
  the wrapper unconditionally, which lets a flex child shrink below its content
  width and would have changed layout on all 31. Now conditional, with a guard.
- **NEW** `apps/web/src/components/connections/kind-glyph.tsx` — exports `KindGlyph`,
  `DRAWN_KINDS`, `isDrawn`. Nothing outside /connections imports it.
- `apps/web/src/components/connections/channel-tile.tsx` and
  `connection-marketplace.tsx` — internal to /connections.
- **`scripts/design/design-lint-baseline.json`: NOT touched.** The two literals I
  first inlined (`text-[20px]`, `text-[13px]`) failed the lint, and the fix was to
  put them back inside `PageTitle` where they were already baselined rather than to
  widen the baseline. Font-size baseline still 698, spacing still 129.
- `apps/web/scripts/perf/js-budget.json`: **NOT touched.** The budget refused the
  glyphs twice and was not raised to fit them.
- `packages/shared`, `packages/db`, `packages/publishing`: untouched.

## Contract, migration or money

**None.** No `packages/shared` change, no migration, no price, no ledger call.

The OAuth and connect path is byte-identical, MEASURED with `git diff --quiet`
per path: `connect-button`, `reconnect-button`, `disconnect-button`,
`telegram-connect`, `channel-accounts`, `app/api/oauth/**`, `lib/connections/read.ts`,
`catalogue.ts`, `use-connect-flow.ts`. An independent `reviewer` agent was asked to
refute that and could not.

## Guards written, and the mutation that proved each

Seven mutations, each applied, watched go red, and reverted.

| Mutation | Result |
| --- | --- |
| drop `'Team chat'` from the glyph map | **RED** — `expected [ 'Team chat' ] to deeply equal []`, and it NAMES the kind |
| remove the fallback (`ICON[id] as never`) | **RED** — `expected undefined to be { … }` on the undrawn-category case |
| delete `<KindGlyph>` from the rail row | **RED** — `expected  to have a length of 1 but got +0` |
| delete the blurb `<p>` from the tile face | **RED** — `Unable to find an element with the text: Publish posts, reels and stories…` |
| remove `line-clamp-2` | **RED** — `expected 'type-sm mt-2 text-muted' to contain 'line-clamp-2'` |
| make `min-w-0` unconditional | **RED** — `expected 'min-w-0' not to contain 'min-w-0'` |
| put the empty `<nav aria-label="Location">` back | **RED** — `expected <nav …> to be null` |

**One guard I wrote could NOT fail, and I caught it before committing.** The rail
glyph assertion was `expect(row.querySelector('svg[aria-hidden]')).not.toBeNull()`.
It passed with the glyph deleted, because **`lucide-react` sets `aria-hidden` on
every icon it renders**, so the selector matched the row's other icons regardless.
It counts the row's own `svg` children now, which is the thing on the screen. This
is the sixth guard in this repository found passing by not looking.

## Anything retracted

**Two, and both are Session 18's own claims from this same lane.**

1. **"The category rows carry no icon" is reversed.** Session 18 measured seven
   lucide glyphs at 2,612 bytes and refused them. The refusal stands as arithmetic
   and was RE-MEASURED here, not overruled: eleven lucide imports failed the budget
   again, by 1.1 kB. What changed is the drawing method, not the appetite.
2. **"The blurb left the tile face" is reversed on the founder's ruling.** The ~800px
   measurement is not disputed; `line-clamp-2` bounds it, which was the half of the
   argument that was about height rather than about relevance.

**And one of my own, mid-session.** The first `connection-marketplace.tsx` header
rewrite said the glyphs "now fit inside the slack" because `814b0342` re-recorded
the budget. That was FALSE when written — the lucide version did not fit — and it
also cited `lib/connections/kind-icons.ts`, a path that no longer existed by then.
Both corrected in `f11d60d7` before the commit landed.

## Anything that changes an assumption

**A plain `pnpm --filter @sahoda/web exec vitest run` is now red in this sandbox and
it is NOT the diff.** `src/lib/privacy/export-drift.test.ts` fails 2 with
`getaddrinfo ENOTFOUND db.<project>.supabase.co`. **MEASURED on `50603f62`, the
commit before this session's work: identical failure.** The turbo gate reports it
as skipped (3 skipped) rather than failed, so the two invocations disagree — if a
future session sees 2 red there, check the base commit before blaming a diff.

## What the next session in THIS lane should pick up

1. **Run the browser leg somewhere with a browser.** `NO_BROWSER` here. Every
   responsive claim in this session is INFERRED. `smoke` on `.github/workflows/gate.yml`
   by hand, or `node scripts/browser-run.mjs --remote`.
2. **Two questions were put to the founder and neither is answered.** (a) Should
   `/connections/integrate` become a real route, which is what would make the trail's
   segments into links; (b) the card sentence restoration overrules a same-day
   measurement and they were told so.
3. **Inherited, unchanged from Session 18:** the folder animation is still blocked on
   "here or divas"; the four admin `outline-accent` sites are still at 2.94:1;
   /connections' first tile row still carries ~135px of dead space;
   `connections-honesty.spec.ts:119-121` is still unverified.

## Gate

Forced, clean tree, repo root, nothing piped.

| Leg | Real output | Verdict |
| --- | --- | --- |
| `turbo run typecheck lint test --concurrency=1 --force` | `Tasks: 27 successful, 27 total` · `Cached: 0 cached, 27 total` · 5m36s | **PASS** |
| ↳ `@sahoda/web:test` | `456 passed \| 3 skipped (459)` files · `5752 passed \| 11 skipped` tests, 129s | **PASS** |
| ↳ `@sahoda/web:lint` (design-lint) | `lint ok`, spacing 129 / font size 698 / dead breakpoint 0, none new | **PASS** |
| `prettier --check .` (root) | `All matched files use Prettier code style!` | **PASS** |
| `pnpm --filter @sahoda/web build` | `next build` clean · `js-budget ok: 81 routes within budget` · `/connections 10.2 kB` | **PASS** |
| `reviewer` agent on the diff | no blockers; 1 Should + 1 Nit, both fixed in `5736edfc` | **PASS** |
| `playwright test --list` | `277 tests in 72 files` · `--grep @smoke` → `118 tests in 37 files` | matches root `CLAUDE.md`, no drift |
| Playwright EXECUTION | `sandbox-probe` = `NO_BROWSER` | **UNRUN** |
| Vercel preview | Building on `f11d60d7` when last seen; not re-checked on `5736edfc` | **UNVERIFIED** |

**CI executed again.** A `check_suite.completed` success arrived on `50603f62` at
20:25 UTC, which closes the "zero executed jobs since 26 August 11:01" finding
Session 18 recorded across six PRs. Not re-checked on `5736edfc`.
