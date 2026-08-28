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
