# Handoff — jiban — wt-jiban3 — 2026-08-28

**Branch** `claude/kickoff-jiban-r91o7w` at `c1ce0cea`. Lane `wt-jiban3`. Pushed: yes.
PR [#25](https://github.com/development156/sahodalabs/pull/25) → `wt-core`, draft, subscribed.

**First session in this lane.** No previous handoff exists under
`jiban-wt-jiban3-*`. The harness pinned this session to a `claude/...` branch it
cannot leave, so `sahoda.lane` stays `wt-jiban3` and this file is the only record
of which lane the work belongs to.

## What shipped

Two pieces of work, unrelated to each other. The first came out of a stop-hook
gate failure, the second is the founder's task.

### 1 · The export drift check stopped being red for a reason no code could fix

| # | what | proof | covered by |
|---|---|---|---|
| 1 | `export-drift.test.ts` skips when the database is UNREACHABLE, not only when the credential is absent | `4eedbd5e`, `lib/privacy/export-drift.test.ts` | `lib/testing/db-reachability.test.ts`, 22 cases |

It skipped on `SUPABASE_DB_URL === ''`, right when the sandbox had no `.env`.
`scripts/cloud-setup.sh` changed that on 2026-08-24: the sandbox now HAS the
credential and no route, so the file was hard red on `wt-core`.

**MEASURED four ways in this sandbox.** The production Postgres host publishes
no A record and this container has no IPv6 stack:

| probe | result |
|---|---|
| `dns.resolve4(db host)` | `ENODATA` |
| `dns.resolve6(db host)` | `2406:da1a:82a:9d02:1644:bb0a:2ca1:a2ec` |
| `dns.lookup(family: 4)` | `ENOTFOUND` — the error the suite reported |
| TCP connect to that v6 address | `EAFNOSUPPORT` — no IPv6 socket family here |

The skip wraps the CONNECTION only. Once rows come back every failure is a real
finding and stays red. The line is an explicit errno allowlist, never a prefix
match: **`pg` reports SQLSTATE on `error.code`, the same field as a socket
errno**, so `28P01` and `EAI_AGAIN` arrive identically shaped and a "starts with
E" heuristic would have swallowed a rejected password. `ECONNRESET` is
deliberately excluded. The skip note names the host and the errno, never the
URL, which carries the production password.

### 2 · The /planner content area, redesigned

| # | what | proof | covered by |
|---|---|---|---|
| 1 | Header band with a drawn calendar motif, masked out under the copy | `planner-hero.tsx`, `planner-hero-art.tsx` | — (decoration, `aria-hidden`) |
| 2 | Figures grouped by what needs doing; the one with an action leads, and only when there is something to act on | `planner-summary.tsx:110` | `planner-panels.test.tsx`, 6 cases |
| 3 | All / Drafts / Scheduled / Needs approval, plus a title search | `planner-toolbar.tsx`, `lib/planner/filters.ts` | `filters.test.ts` 40, `planner-panels.test.tsx` 8 |
| 4 | Compact month in the rail; pick a day, the plan narrows; pick again, it clears | `planner-mini-calendar.tsx` | `planner-panels.test.tsx`, 6 cases |
| 5 | Upcoming — the next five scheduled posts | `planner-upcoming.tsx` | `filters.test.ts` `upcoming`, `planner-panels.test.tsx` 2 |
| 6 | Rows reshaped: title owns line one, everything qualifying it sits on line two | `planner-row.tsx:104` | existing `approve-button` / `planner-reschedule` suites |
| 7 | Plan my week as a two-step card, weighted by ground not more orange | `plan-week-panel.tsx:83` | existing `plan-week-panel.test.tsx`, 8 assertions |
| 8 | `OffGridNote` — what the chosen view structurally cannot draw, in every calendar branch | `off-grid-note.tsx` | reasoned; see NOT DONE |

**All of it is server-rendered.** Tabs, search, the calendar and the week
stepper are links and one GET form, so every filter survives a reload, the back
button and a shared link — the reason `flow-journeys.spec.ts` already pins
`?view=`. MEASURED: `js-budget ok: 81 routes within budget`, unchanged.

**Nothing was removed.** `Approve`, `Schedule`, `Reschedule`, `Close`, the
campaign links, the channel chips, the auto-publish notes, all five `data-guide`
anchors and the `h1` `Planner` are exactly as they were.

## What was NOT done, and why

- **NO SCREEN WAS EVER DISPLAYED.** `/planner` is behind Clerk and Chromium here
  cannot complete an outbound HTTPS request (REQUESTS §25), so the visual result
  and the 390px layout are REASONED, not seen. `no-truncated-labels`,
  `every-section-loads`, `no-impossible-remedy`, `flow-journeys` and
  `flow-frames` all sweep `/planner` and **none of them ran**. This is the
  largest gap in the work and the Vercel preview is the check.
- **The supplied PNG is not in the repo.** `a_clean_minimal_modern_ui_background_illustratio.png`
  was shown in the conversation; its bytes never reached the sandbox. The banner
  is drawn as inline SVG from tokens instead. That is also the better answer —
  it re-tints in dark where a baked peach PNG would become a bright slab, costs
  no request against a 1.1 MB precedent (`public/brand/banner.png`), and needs
  no raw hex. Commit the file to `public/brand/` to swap it in; the wrapper owns
  the masking and the sizing, not the art.
- **No post-count control.** The brief asked for `3 / 5 / 7 posts`. MEASURED:
  there is no such control today and the mesh task returns five — `PlanWeekInputSchema`
  has no count field. Adding one is a server and mesh change, not a presentation
  change, and the brief said presentation only.
- **`[Connect channels]` is a link, not a filled button.** The brief asked for a
  button. `accent-budget.spec.ts` enforces docs/37 §16's one solid-brand fill per
  view, /planner spends it on `Plan my week`, and a founder ruling already
  removed this exact object ("a 1032px orange band holding two words"). The
  information asked for is added; the fill is not.
- **No ✨ emoji on the CTA.** docs/37 §18 bans emoji in Sahoda's own interface;
  the carve-out is for generated social captions. `Sparkles` from lucide instead.
- **The founder's helper sentence was not adopted verbatim.** "You can review,
  edit or reschedule everything before publishing" is FALSE wherever
  auto-publish is on, which this route supports. The existing sentence, which is
  true in every configuration, stands.
- **No entrance animation on post rows.** docs/37 §12: "Anything on a data table
  row… a list that re-animates on every filter change is a list nobody can
  read." The page bands stagger; the rows do not.
- **The merge commit `d994d525` is authored `development@sahodalabs.com`** and
  will show Unverified. `git commit --amend` was refused twice by the permission
  classifier, and by the time it could be retried the commit was no longer HEAD.

## Shared surfaces touched

**Three, all additive.**

| surface | change | who breaks |
|---|---|---|
| `lib/planner/month.ts` | **added** `istFullDate()`. No signature changed. | nobody — additive |
| `components/planner/week-nav.tsx` | **added** optional prop `filters?: Record<string,string>`, default `{}` | nobody — optional, existing call sites compile |
| `components/connections/connect-first-note.tsx` | now renders its own `mt-3` and reads `ChannelSchema.options` | any other route rendering it inside its own spaced wrapper would now double the gap. MEASURED: `/posts` and `/planner` are the only two call sites |

`PlannerToolbar` and `PlannerMiniCalendar` take a **required** `week` prop. Both
are new in this diff and have exactly one call site each, so nothing outside can
break — but a required field breaks constructors, and a later lane adding a
second call site must pass it.

`scripts/design/design-lint-baseline.json` tightened `typesize` **698 → 693**.
That is permanent and one-directional; another lane cannot loosen it.

## Contract, migration or money

**None.** No `packages/shared` change, no migration written or applied, no price
touched. `creditCost('loop_cycle')` is read exactly as before and the button
still renders `Plan my week · 20 credits` before the click.

## Guards written, and the mutation that proved each

**Twelve mutations, each WATCHED red, each restored.**

`lib/testing/db-reachability.test.ts` — 22 cases, half asserting a failure is NOT swallowed:

| mutation | result |
|---|---|
| classifier stops recognising `ENOTFOUND` | **RED** — 2 failed, the original `getaddrinfo` |
| connection succeeds, manifest disagrees with production | **RED** — 1 failed, names the table |
| server answers `28P01`, wrong password | **RED** — 2 failed, not swallowed |

`lib/planner/filters.test.ts` — 40 cases:

| mutation | result |
|---|---|
| an unknown `?tab=` is honoured instead of falling back to `all` | **RED** — 4 failed |
| `needs-approval` starts counting drafts (a fifth idea of pending) | **RED** — 1 failed |
| an undated post is kept by a date filter | **RED** — 2 failed |
| `upcoming` stops excluding the past | **RED** — 3 failed |
| the search cap is removed | **RED** — 1 failed |

`components/planner/planner-panels.test.tsx` — 23 cases:

| mutation | result |
|---|---|
| calendar cells lose their full-date name | **RED** — 4 failed |
| the absence note regains its screen-reader twin | **RED** — 1 failed, "Found multiple elements" |

Both of those last two were REAL DEFECTS the render tests caught on first run,
not synthetic mutations: two links named "28", and a note announced twice.

## Anything retracted

**One, and it was mine.** I set the four metric numbers in `type-h2` only after
first shipping them as `type-h1`. docs/37 §16 states "Exactly one `type-h1` per
view" — the page heading owns it, and five elements at that rung each claimed to
be the title of the screen. Caught by re-reading §16, before review.

**Eight further defects were found by two adversarial reviewers and all are
fixed.** The two worth carrying forward:

- **`text-accent` on `--brand-wash` is 2.75:1 in light.** MEASURED from
  `tokens.css:95`, which prints this exact pair. That is under the 4.5:1 text
  floor AND under the 3:1 non-text floor. It is tolerated for `.chip-wash`
  badges; it is not acceptable for a lead figure or a calendar date. Both are
  now ink. **This pair exists elsewhere in the product and is worth a sweep.**
- **Tab counts read the whole workspace while the list read the filtered set.**
  With `?q=chai` the All tab said 4 above one row — a figure no query produced,
  which is the one thing CLAUDE.md forbids outright. It shipped for about an
  hour inside this session and is now pinned by `filters.test.ts` reproducing
  the page's own expression.

## What the next session in THIS lane should pick up

1. **Run the smoke leg before this merges.** `.github/workflows/gate.yml`'s
   `smoke` job, dispatched by hand. Five specs sweep `/planner` and none has
   seen this diff. This is the top item and nothing else on this list matters
   as much.
2. **Look at the Vercel preview for `claude/kickoff-jiban-r91o7w`.** Judge the
   banner, the rail at 1024 (the middle band nobody tests) and the toolbar at
   390. It is the only visual evidence available.
3. **The `text-accent` on tint sweep**, from the retraction above. `apps/web/CLAUDE.md`
   mandates a `dark:bg-s2` swap for this pair; `plan-week-panel.tsx:112` follows
   it and other call sites do not.
4. **`planner.week` is unreachable at runtime.** MEASURED: the anchor lives in
   `week-grid.tsx`, and no page renders `WeekGrid` — `page.tsx` uses
   `WeekTimeline`. Pre-existing, not from this diff, and no guard covers it.
5. **Still open from Session 18 on `wt-jiban`:** the 3D folder animation, here
   or in the divas lane. Unanswered since 27 August.
6. **The four admin `outline-accent` sites at 2.94:1**, Session 16's open ruling.

## Gate

Forced, clean tree, repo root, nothing piped.

| leg | result | real output |
|---|---|---|
| `turbo run typecheck lint test --concurrency=1 --force` | **PASS** | `27 successful, 27 total` · `0 cached` |
| ↳ `@sahoda/web:test` | **PASS** | `455 passed \| 3 skipped (458)` files · `5804 passed \| 13 skipped (5817)` tests |
| `prettier --check .` (root) | **PASS** | `All matched files use Prettier code style!` |
| `scripts/design/design-lint.mjs` | **PASS** | exit 0 · typesize baseline `698 → 693` |
| `next build` | **PASS** | `✓ Compiled successfully in 38.0s` |
| `scripts/perf/js-budget.mjs` | **PASS** | `js-budget ok: 81 routes within budget` |
| Playwright | **UNRUN** | REQUESTS §25 — Chromium here cannot reach Clerk |
| `@sahoda/db` live-database leg | **PASS** | `36 passed \| 12 skipped (48)` files |

The two `export-drift` tests now report as **2 skipped, loudly**, naming the host
and the errno. They are not passing and must not be read as passing.
