# 27 · Design Audit — Sahoda Labs

**Date:** 2026-08-19 · **Branch:** `wt-design` (cut from `wt-ui-port` @ `7bb8ad5`)
**Method:** one real workspace, bootstrapped through the app's own RPC and seeded with
eight posts across eight statuses. 16 routes × 2 widths (1440, 390) × 2 themes = **64
screenshots**, plus 12 viewport captures of the shell at six widths.

**Every claim below is MEASURED unless it is marked INFERRED.**

---

## 0. How to reproduce this

```bash
cd apps/web
DESIGN_AUDIT=1 E2E_PORT=3200 pnpm exec playwright test design-audit   # 64 frames, ~4 min
E2E_PORT=3200 pnpm exec playwright test shell-widths                  # 12 frames, ~45 s
node scripts/design/contrast-report.mjs                               # every colour ratio quoted here
```

Output lands in `apps/web/design-audit/{theme}-{width}/` and `apps/web/shell-proof/{theme}/`.
Both directories are gitignored: the harness is the artefact worth versioning, not its output,
which goes stale the moment a token changes.

### What was sampled, and what was not

Sampled (16): `/home` `/posts` `/create/post` `/approvals` `/planner` `/brain`
`/brain/identity` `/analytics` `/wallet` `/connections` `/inbox` `/campaigns` `/sites`
`/assets` `/settings` `/settings/plan`.

**Not sampled (23 of 39 routes):** all six `/admin/*` screens, both `/(auth)` screens,
`/onboarding`, `/embed/beta`, `/posts/[id]`, the four `/inbox` sub-routes, the four
remaining `/brain` sub-routes, `/settings/profile`, `/settings/integrations`, `/create`.
These were chosen by archetype, not by URL — the aim was coverage of *kinds* of screen.
Saying so explicitly because a silent sample reads as full coverage, and this is not.

### One thing in the screenshots that is NOT a defect

Every dev screenshot has a **black circle with an "N" in the bottom-left corner**, and in
the 390px frames it sits on top of the `Home` item in the bottom bar. It is not ours.
`document.elementFromPoint(38, innerHeight - 40)` returns `<nextjs-portal>` — Next.js's
dev-mode indicator, which does not exist in a production build. **Do not chase it.**

Likewise, in *full-page* captures the mobile bottom bar appears inlined halfway down the
document. That is a screenshot artefact — `position: fixed` chrome renders at its scroll
offset in a full-page capture. The viewport captures in `shell-proof/` show it correctly
docked. Both of these were nearly written up as bugs; they are not.

---

## 1. The three worst screens

### Worst · `/analytics`

**Five empty states, in five different visual languages, on one screen.**

| # | element | treatment |
|---|---|---|
| 1 | Reach / Views / Accounts engaged / Interactions | four bare em-dashes, inline |
| 2 | Marketing score | a fifth em-dash, right-aligned |
| 3 | Instagram account | hairline card, heading + body + orange text link |
| 4 | Performance over time | **dashed** box, centred grey prose, ~130px of padding |
| 5 | Best performing | hairline card, plain prose, no action |
| 6 | bottom card | orange icon tile + bold heading + centred prose |

Six ways of saying "nothing yet". This is precisely the failure mode this session exists to
end: with no rule in the system, each surface invented its own answer.

Worse, the hierarchy is inverted. The largest, highest-contrast, most colour-saturated
element on the page — the orange icon tile at the bottom — carries the **least** information.
The eye lands on the emptiest thing first.

The screen also says a variant of "nothing" **five times** in prose: *nothing to show*,
*nothing has been measured yet*, *nothing to rank*, *nothing published yet*, *nothing to
measure*. Each sentence is individually honest and well-written. Together they read as a
product apologising for itself.

### Second worst · `/posts`

**Three different statuses render the identical chip.**

The Certainty System *is* applied here — `StatusBadge` renders `CERTAINTY_CLASS`, and
`certaintyFor` is one of the most carefully argued files in the repo. The defect is
downstream of that care. Because evidence, not intent, is what earns `.is-real`,
`certaintyFor` returns `committed` for **`approved`**, **`scheduled`** *and* **`published`**
whenever no variant row proves a publish. The chip renders the rung, so all three come out
as one pill and only the word separates them. Measured at the source
(`certainty-distinct.test.ts`, before the fix):

```
"approved" and "scheduled"  both render class "is-committed"
"approved" and "published"  both render class "is-committed"
"scheduled" and "published" both render class "is-committed"
```

`failed` differs from those three only by having a transparent background instead of a 6%
orange wash. So on a list of eight posts, the reader cannot scan by shape at all — words are
read one at a time, shapes are read all at once — and the status that most needs to jump out
is the one that stands out least.

The underlying decision is *correct* and must not be loosened: approving a post is not
publishing it. What was missing was a second axis. Fixed in this branch by giving each status
a glyph (`lib/posts/status-mark.ts`), so certainty carries the fill and edge while the mark
carries what happens next — both structural, both surviving greyscale.

**A dead map.** `STATUS_STYLES` in `status-badge.tsx` defines a `className` for all ten
statuses — `bg-ok-bg text-ok`, `bg-danger-bg text-danger`, and so on. Only `.label` is ever
read; the component composes `CERTAINTY_CLASS` instead. Roughly forty class names are
maintained, reviewed and reasoned about in comments, and none of them reach a screen. Anyone
tuning post-status colour would edit that map and see nothing change.

**The only action given permanent space on every card is `Delete`.** Each card runs ~197px
tall for three lines of content, then spends a full-width rule and ~90px of footer on one
right-aligned destructive verb. There is no Open, no Edit, no Schedule, no Approve. The
most dangerous action in the module is the only one with dedicated real estate, repeated
eight times down the page.

Eight posts occupy ~1,800px. There is no table, no sort, no filter, no grouping, no bulk
select — the "dense list" archetype rendered as eight identical stacked cards of equal
visual weight.

### Third worst · `/home`

- **Two heroes.** "Good evening" (30px/700) and the credits number (48px/700) compete
  across the fold. Neither wins, so the screen has no focal point.
- **The mascot is clipped by its container.** It is cut off mid-body at the bottom edge of
  the gradient block in both themes. In dark the gradient behind it reads as a muddy brown
  smear rather than a designed surface.
- **One card states its emptiness twice.** The `Credits spent · last 30 days` card contains
  *both* "No credits spent yet. Your first AI action will show up here." *and* "Nothing
  spent yet — no actions to break down." — two sentences, same claim, ~280px of empty box
  between them.
- **`100 of —`.** The rail foot renders a numerator, the word "of", and an em-dash. The
  reasoning behind it is sound and documented in `rail-foot.tsx`: Sahoda's wallet is a
  balance, not an allowance, so there is no denominator and inventing one would lie. The
  correct conclusion was that **the slot should not exist**, not that it should be filled
  with a dash. This is the clearest instance of a pattern that runs through the whole app
  (§3).
- On mobile the right column reflows to the bottom, putting `Available credits` roughly
  1,400px down the page, and the seven-day strip becomes seven rows of which six are empty.

---

## 2. Two defects found by measurement, not by looking

### 2.1 The app scrolls sideways on a 390px phone — and a green guard says it does not

At 390px with a workspace present: `documentElement.scrollWidth = 407`, `clientWidth = 390`.
**17px of horizontal overflow.** The Clerk user button is pushed off the right edge.

`e2e/no-truncated-labels.spec.ts` already contains a `@smoke` guard named *"the topbar
controls neither overlap nor leave the screen"*, it runs at 390px, and **it passes.**

It passes because it signs a user in and goes straight to `/home` **without bootstrapping a
workspace**. With no workspace there is no credit pill, so the row is one wide item short.
Running that guard's own selector and geometry in both states (`e2e/topbar-two-states.spec.ts`):

| state | last control | result |
|---|---|---|
| **A** — no workspace (*what the guard measures*) | `Open user menu` → right=**376** | fits in 390 |
| **B** — workspace present (*every real user*) | `Open user menu` → right=**407** | **17px off-screen** |

The guard is not wrong. It is aimed at the one account shape that never breaks. `topbar.tsx`
carries the fingerprints of this: *"MEASURED: last control right=316 in a 390px viewport"* —
measured, correctly, in state A.

This is the whole reason the shell in §4 is proved in the state a real user is in.

### 2.2 Dark is an inversion, not a peer — and it costs 2.1× the hierarchy

Same layout, same spacing, same everything; only values flipped. The measurable cost is in
text hierarchy:

| theme | primary on surface | secondary on surface | separation |
|---|---|---|---|
| light (`#ffffff`) | `#000000` → 21.0:1 | `#575756` → 7.23:1 | **2.90×** |
| dark (`#131315`) | `#ffffff` → 18.56:1 | `#dcdcdc` → 13.53:1 | **1.37×** |

**Dark carries 2.12× less tonal separation between primary and secondary text than light.**
`--ink-mute: #dcdcdc` was chosen because "grey dies on black", which is true — but it was
raised so far that secondary text is now nearly as loud as primary, and the reading order
of every card flattens. Labels like *Reach* / *Views* shout in dark and murmur in light.

Separately, `--canvas: #0b0b0c` and `--surface: #131315` are ~2% of luminance apart, so
cards barely separate from the background and the whole dark UI rests on hairlines alone.

---

## 3. The system-level findings

### 3.1 The most-rendered glyph in the product is an em-dash meaning "nothing"

Counted on three sampled screens alone: `/home` 6 (four metrics, marketing score, "of —"),
`/analytics` 5, `/brain` 5. The system has exactly one vocabulary item for absence, and it
is a dash — so it is used for three genuinely different situations that a user needs to tell
apart:

1. **Not yet measured** — a real slot, a real metric, no reading yet. *(Reach, Views)*
2. **Cannot be read** — the query failed. *(`creditsText()` returns `—` on `unreadable`)*
3. **Does not exist** — there is no such quantity at all. *(`of —`)*

Cases 1 and 2 are different claims and the codebase is scrupulous about not confusing them
in *prose* — `lib/inbox/emptiness.ts` exists solely to keep eight such sentences apart. But
they render identically. Case 3 should not render at all.

**INFERRED:** this single glyph is the largest contributor to the app looking unfinished. It
is not dishonest — it is the honest answer, given no better vocabulary. §26 gives it one.

### 3.2 Brand orange is used as though it were free

`#FF6600` measures **2.94:1 on white** (`scripts/design/contrast-report.mjs`). It fails AA
for body text (4.5:1), fails AA for large text (3:1), and fails the WCAG 1.4.11 floor for UI
component boundaries and focus indicators (3:1). It is currently doing all four jobs.

Live instances of the failing pair, from the sampled screens: the `Create post` button, the
`Start checkout` bar, every filled status badge, the nav count badge, the active tab label
and underline on `/brain`, the "2 drafts waiting" subline, the `Won't post itself` warning,
`Usage`, `Details`, `Open connections`, and `WED 19` in the planner strip.

**Fixed in this branch.** `--pfg` is now `#000000`; the primary button measures
`rgb(0,0,0)` on `rgb(255,102,0)` = **7.15:1**, verified on rendered pixels. Accent TEXT moved
to `--acc` `#c95100` (4.51:1 light) / `#ff6600` (6.32:1 dark). The instances listed above are
the state **as found**; the per-screen application of the new accent value is left to the
screen sessions, per `docs/26_Design_System_v4.md` §1.

`/wallet` is the sharpest case: **`Start checkout` is a ~1,000px-wide solid orange bar**, the
loudest object in the entire product, on the money screen, in the failing pair — while three
more orange elements (selected radio, its border, its tint) compete above it.

There is also a **stale figure in the tokens file**: `tokens.css:52` annotates `--pfg` as
`3.13:1`. Measured, that pair is **2.94:1**. Arithmetically it cannot be 3.13 — the comment
is a leftover from the `#ff4b00` era, and it is exactly the kind of number an incoming
session would trust without re-deriving.

### 3.3 One dataset, two treatments

`Welcome credits +100` renders as a **card list row** on `/home` (*Recent activity*) and as a
**table row with a full `When / Activity / Credits` header** on `/wallet` (*Credit activity*).
Same data, same workspace, two component vocabularies — and the table draws full chrome for
a single row.

Similarly on `/connections`: within one row of four cards, Instagram and LinkedIn render
status as **plain grey text** ("Available") while X and Google Business Profile render it as
a **hairline chip** ("Not verified live"). The less important status got the stronger
treatment.

### 3.4 Density is set by the container, not by the content

`--control-h: 34px` and 13px base type are a deliberate, good density decision — it is most
of what separates this shell from a stock dashboard. But it is applied only to the shell.
Page content runs at a much looser rhythm, and the mismatch is why the app reads as a tight
professional chrome wrapped around a loose template:

- `/create/post` — content ends at y≈430, the action bar sits at y≈560, then ~350px of
  nothing. The channel grid runs 4 + 4 + **1 orphan** (Telegram alone on its own row).
- `/connections` — two rows of cards, then ~400px of dead space. `Local listings 0/1` puts
  one card in a four-column grid.
- `/analytics` — `Best performing` is a third of the width holding two lines of text.

### 3.5 What is genuinely good, and should survive

Naming this because a rewrite that discards it would be a regression:

- **`/create/post` is the best screen in the app.** The stepper is clear, and the
  solid-vs-dashed channel treatment makes "live" versus "coming soon" readable in a glance
  without relying on colour. This is the Certainty System working. §26 generalises *this*.
- **The copy is unusually disciplined.** "Account insights come from the connected account,
  not from your posts, so there's nothing to show until one is linked" is a genuinely good
  sentence. The distinction between "we never asked" and "we asked and got nothing" is
  maintained rigorously in prose.
- **The rail's accessible-name handling is already correct** — labels go `sr-only` rather
  than `display:none` when it collapses, so all nine destinations keep their names at 768px
  and 1024px. Verified at six widths in both themes (§4).
- **The honesty rules are load-bearing and must not be designed away.** `—` for an
  unreadable balance rather than `0`, no ratio bar without a denominator, "Won't post
  itself" on a scheduled post. The fix for these is better *vocabulary*, never a prettier lie.

---

## 4. Where this leaves the system

The app does not look bad because any one screen was built carelessly. Most of them were
built thoughtfully, and the code comments show the reasoning. It looks unfinished because
**the same question was answered independently on every screen** — how to show absence, how
to show severity, how much space a section gets, when orange is allowed.

That is a system gap, not a screen gap, and it is what `docs/26_Design_System_v4.md` closes.

The five specific things it must decide, in priority order:

1. **A vocabulary for absence** — three distinct states, three treatments, never a bare dash.
2. **A severity ladder that survives greyscale** — so `Failed` and `Scheduled` can never
   render as the same object.
3. **An orange ration** — where the brand colour is legal, where it is not, and one primary
   action per view.
4. **Dark as a designed peer** — its own tonal ladder, not a flipped one.
5. **A density rule that reaches page content**, not just the shell.
