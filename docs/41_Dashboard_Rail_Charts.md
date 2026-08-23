# 41 · The rail, /home, /analytics and the charts — what the reference gave, and what it could not

**Lane** `wt-dash2`, off `wt-page-dash` @ `b346518c`.
**Canon** `docs/37_Design_System_v5.md`. **Prior lane** `docs/40`, whose camera and
accent meter this lane reuses unchanged so that its "after" and this one's "before"
are produced by the same instrument.

Every figure below is **MEASURED** by something in this repository, or it says
INFERRED. The instruments are `apps/web/e2e/page-dash-frames.spec.ts` (the camera),
`apps/web/e2e/helpers/accent-spend.ts` (the pixel meter), and two new ones:
`apps/web/e2e/rail-collapse.spec.ts` and `apps/web/e2e/accent-budget.spec.ts`.

---

## 0 · Reproducing this

```bash
pnpm --filter @sahoda/web build && pnpm --filter @sahoda/web start -p 3280

SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl E2E_PORT=3280 \
E2E_BASE_URL=http://localhost:3280 PAGE_DASH_CAPTURE=1 \
PAGE_DASH_PHASE=before UX_OUT=.ux-dash2 \
pnpm --filter @sahoda/web exec playwright test page-dash-frames.spec.ts --workers=1
```

24 compositions, 48 frames: two routes × three widths (390 · 1024 · 1440) × two
themes × two data states, each shot twice — once at a fixed viewport for the meter,
once full-page for a person. Every frame is SHA-hashed into
`.ux-dash2/manifest.jsonl` and every one was read, as eight contact sheets of three
widths side by side. Two findings in §4 were only visible that way.

---

## 1 · The rail

### 1.1 "The text is too faded" was literally true, and it was not opacity

The founder's verdict named two things and I diagnosed the second one wrong from the
tokens before measuring it. `tokens.css`'s inverse-surface block declares
`--ink-mute: #979797` and does the arithmetic correctly beside it — 6.14:1 on
`#171717`. I read that and concluded the rail was not faded.

**`rail-collapse.spec.ts` measured the rendered pixels and found #57575a on #171717
— 2.49:1 — on EVERY label in the rail, in LIGHT.** The app's primary navigation, at
every width, below the WCAG AA floor of 4.5, in the theme most people use.

Why it survived every check, and it is one mechanism:

- components do not write `--ink-mute`, they write `text-muted`;
- `text-muted` resolves `--muted`, declared in L3 as `--muted: var(--ink-mute)`
  **on `:root`**;
- a custom property whose value contains `var()` is substituted at computed-value
  time **on the element that declares it**, and then inherits as that fixed colour.

So `--muted` was already `#57575a` before the rail existed, and re-declaring
`--ink-mute` on a descendant scope could not reach it. **Dark never showed it**:
`[data-theme='dark']` matches `<html>`, the same element the alias is declared on, so
there the substitution picks up the dark value and measures 6.14:1. Only a scope on a
DESCENDANT is affected, and `[data-surface='inverse']` is the only one in the product.

This is docs/37 §19's own warning arriving a second time — *"Guards that grade TOKENS
cannot see what COMPONENTS write. `--pfg` was correct for weeks while three components
wrote `text-white` on a brand fill."* `tonal-ladder.test.ts` grades this scope and
passes, because every token it reads IS correct.

Five aliases were stale inside the scope and all five are re-declared, not just the
one measured failing: `--bg`, `--s1`, `--s2`, `--muted`, `--faint`. `--s2` is the rail
foot's hover fill and would have painted the LIGHT `#f4f4f5` inside a dark panel.

### 1.2 Every rail label, both states, both themes

MEASURED by `rail-collapse.spec.ts`, in Chromium, on composited colours, after the fix.

| where | text | on | ratio |
|---|---|---|---|
| light · expanded · every nav label | `#979797` | `#171717` | **6.14:1** |
| light · expanded · active (`Home`) | `#ff6600` | `#251c16` | 5.69:1 |
| light · expanded · `Usage` | `#ff6600` | `#171717` | 6.11:1 |
| light · expanded · balance, user name | `#ffffff` | `#171717` | 17.93:1 |
| dark · expanded · every nav label | `#979797` | `#171717` | 6.14:1 |
| **worst across the whole rail, both themes** | avatar initials | brand wash | **5.69:1** |

Before: **2.49:1** on every one of the light rows above.

**In the COLLAPSED state the only visible text in the rail is the avatar's two
initials.** Every label is `sr-only` — clipped to 1px, present in the accessibility
tree — so the guard skips it as having no visible contrast to grade. That is the
correct reading and it is worth stating plainly rather than letting a short table
imply the collapsed rail was measured and found fine.

### 1.3 The real cause was density, and three of the six SOON labels were stale

MEASURED on `page-dash-before__populated__home__full__1440__light`: twenty-one links,
FIVE uppercase group eyebrows and SIX "SOON" labels — thirty-two pieces of text —
against the reference's twelve flat items and no headings at all. At 900px the list
did not fit: `Connections`, `Wallet` and `Settings` sat below the rail's own fold, so
the three destinations you reach for when something is wrong needed a scroll.

**Three of the six SOON flags were on screens that had been BUILT.**
`e2e/roadmap-honesty.spec.ts`'s `ALLOWED` list is down to `/radar` and `/studio`, and
its header records `/loop`, `/playbooks` and `/report` leaving it because they now
charge credits and write rows. Confirmed at the source:

| route | opens a live read? | verdict |
|---|---|---|
| `/loop` | `readLoop` | **live** |
| `/report` | `readRanking`, `readCycleLearnings` | **live** |
| `/playbooks` | `readPlaybooksSnapshot` | **live** |
| `/radar` | `radarStore` — but its own page says the weekly scan is not built | stays `soon` |
| `/studio` | none | `soon` |
| `/ads` | none | `soon` |

### 1.4 What was removed, and how the two founder rulings were read together

`sections.ts` records an earlier ruling — *"the roadmap should be VISIBLE"* — and this
brief says the SOON items *"are roadmap, not navigation"*. Same founder, neither
withdrawn, so they are read together: **the roadmap stays visible, in one place
rather than five, and that place is not the working list you navigate with daily.**

`RAIL_GROUPS` is a projection of `NAV_GROUPS` filtered to `live`. The three roadmap
sections still render, with their "Soon" state intact, in the two surfaces whose job
is to show the whole product — the command palette (`ALL_SECTIONS`) and the phone's
More sheet (`NAV_GROUPS`). `reachable.test.ts` is untouched and still passes, because
the MAP did not shrink; only the rail's projection of it did.

| | before | after |
|---|---:|---:|
| nav links in the rail | 21 | **15** |
| uppercase group eyebrows | 5 | **0** |
| "SOON" labels | 6 | **0** |
| plumbing links | 3 | 3 |
| **visible pieces of text** | **35** | **18** |
| …at first sight, with the rail collapsed | 35 | **0** |

The groups survive in the DATA. They are what puts a gap between `Posts` and
`Planner`, and what the six `<section aria-label>` regions are built from — six named
regions to a screen reader, five silent gaps to the eye. Flattening the data instead
would have taken the accessibility structure with the visual one and made
`reachable.test.ts`'s ordering rule vacuous rather than failing.

### 1.5 Collapse and expand

- **Opens COLLAPSED.** The founder's ruling, and it is the default in the sense that
  survives a document rendered before any script runs: only `expanded` is ever written
  to `<html>`, so absence means collapsed and there is no frame in which the rail is
  wide and then snaps shut.
- **The toggle** is a 24px circular control on the rail's outer edge, vertically
  centred, straddling the panel border. It is mounted on the rail's outer wrapper —
  the `<aside>` is `overflow-hidden` and would slice it in half — which put it outside
  `data-surface="inverse"`, so it carries the attribute itself. Without that,
  `bg-surface` resolved to the page's white and it was a white dot on a white page.
  §4 has the frame that showed it.
- **62px collapsed, and 56px is still 56px.** Two tokens, and the reason is the
  constraint rather than an inconsistency: everything docs/37 §13 argues about
  `--sidebar-w-collapsed` is an argument about the 700–1179 band, where the content
  column has no spare pixels and `connections-widths.spec.ts` has already caught one
  lane taking 16 of them. At ≥1180 nobody is short, and the founder's ruling names the
  reference's own 62 explicitly. The forced collapse keeps the measured 56; the CHOSEN
  one takes the reference's 62.
- **The toggle is not offered below 1180.** There the rail is collapsed by a media
  query, which an attribute cannot override, so the control would flip
  `aria-expanded`, write localStorage and change not one pixel.
- **Every label is `sr-only`, never `display:none`.** This is the defect this shell
  already shipped once — nine nav items announcing as unnamed links — and the collapse
  gave it a second, unwatched instance: `shell-widths.spec.ts` reads names at a WIDTH,
  and no media query can see a state a person chose. `rail-collapse.spec.ts` holds it.

---

## 2 · /home

### 2.1 The three faults, and which data state each is in

All three are in the **populated** state, not the empty one — the prior lane had
already replaced empty /home with a single-statement `GetStarted` screen, so a fix
aimed at the empty case would have fixed a screen the founder is not looking at.

**a · Four labels and four em dashes.** `performance-strip.tsx`'s own comment argued
for exactly this — *"four slots reading '—' is honest; no card is a defect"* — and the
first clause is the defect. It is docs/40 §2.3's finding one level down: that section
counted SEVEN containers each announcing the same absence and collapsed them to one;
this is a single container announcing it four times INSIDE itself, which survived the
count because it is one card. In dark it is worse — the marks are `--line` on
`--surface`, so the card reads as four labels floating over nothing.

Four slots when there are readings; **one line when there are none**. The rule that
produced the container is unchanged and still right: it is structure, and a reader who
cannot see that this product measures reach AT ALL is worse off than one looking at an
empty slot.

**b · Credits spent.** A 1030×130 full-width panel whose entire content was one
centred sentence, with the figure it was about set in 13px in the top-right corner.
The founder's phrasing is the fix: a number and a sentence. The figure now leads at
`type-hero-num`. §3.3 has what happened to the chart underneath it.

**c · The hero band.** 1132×190 carrying a greeting, one line, a mascot at 55% opacity
under a two-gradient mask, and a button. **It is gone at every width, not restyled.**
The reference's equivalent is one line of type and no band at all: its dashboard opens
"Good morning, DIVAS" on the page ground with a period selector opposite and goes
straight into five stat cards.

Recorded so nobody re-derives it: docs/40 §1.2 measured the two radial gradients at
16% and 6% and found they composite BELOW the s>0.30 saturation floor and contribute
approximately zero accent pixels. The band was a **visual dominance** defect, not a
budget one. The accent meter barely moved; the page height did.

The mascot is not deleted — it is unplaced. `public/mascot/0.png` still ships and
onboarding and the Guide still use it. What went is the one placement where it sat
behind a heading, and whose own note records that the asset is cut off mid-plinth in
the source PNG and no container change can fix that.

### 2.2 What leads now: four numbers this product can always prove

The reference opens on five stat cards and /home had none. The reason it had none was
the honest one and it had to survive: every metric /home used to reach for — reach,
views, followers — comes from a platform, so a workspace with nothing connected has
nothing to put in a stat card, and the previous answer was to render the container
with four absence marks in it.

These four are different in kind. **Every one is a count of rows this product owns or
a ledger balance:**

| card | source | full on day one? |
|---|---|---|
| Waiting on you | `needsAPerson(post.intent)` — the same predicate the queue below filters on | yes |
| Scheduled | `bucketWeek`, the rolling 7-day window | yes |
| Published | `publish.live` — SUCCEEDED **live** sends, never `attempts` or `succeeded` | yes |
| Credits left | the wallet balance | yes |

`Published` reads `live` and not `succeeded` deliberately: a fixture run succeeds at
simulating and publishes nothing, so a card reading `succeeded` would count
simulations as reach. Each card is a link, because a number you cannot act on is a
report.

**And the credit balance is now on this screen twice, down from three.** docs/40 §2.3
counted it in the topbar chip, the rail foot and an `Available credits` card. That card
is gone and this slot replaces it — and the rail foot's copy is hidden whenever the
rail is minimised, which is now the default. At the width the founder is looking at,
the number appears in the topbar and here.

---

## 3 · /analytics, and the charts

### 3.1 Six containers and not one number

MEASURED on `page-dash-before__populated__analytics__full__1440__light`, on a
workspace with two posts published to two channels: a readiness line, six containers,
and no figure anywhere. The two real numbers the page held — two published posts, two
channels — rendered as a 12px muted string in the top-right corner, smaller than any of
the five apologies below it.

`WhatPublished` leads with three counts of rows this product owns: **Published ·
Channels · Reporting (n of m)**. Every container below waits on a platform; these do
not, so they are full the moment anything publishes — which is exactly the state the
six apologies describe. The corner string is gone: docs/37 §16 is explicit that a page
saying the same thing in two places says it once, at the top, and keeping it would
have been the same figure in the two most different sizes on the screen.

**`Reporting` is the coverage, promoted.** "0 of 2 channels reported" already appeared
twice on this page, 130px apart, in two different nouns, as a footnote under two
tables. It is the single most important fact on an unmeasured Analytics screen — it
says whether the silence is Sahoda's fault or the platform's clock.

### 3.2 The chart kit

| piece | what it refuses to draw |
|---|---|
| `Bars` | a bar for a day nobody measured — that day draws NOTHING and its axis label goes faint. A measured ZERO draws a stub at the baseline in `--line`: somebody looked and the answer was none, which is knowledge. The reference draws nothing at all there, and it is the one thing in its chart this product may not copy. |
| `Bars` | a hatch without a label. `.is-simulated`'s own contract, enforced as a throw. |
| `TrendArea` | a segment across a gap — each run of adjacent points is its own path. |
| `TrendArea` | a curve outside its own data. |

**The curve is monotone cubic, and that is a correctness choice rather than a stylistic
one.** "Smooth" is the reference's look and the obvious way to get it is a Catmull-Rom
spline, four lines of code. It OVERSHOOTS: through 40, 0, 40 it passes through roughly
−12 — a rendered negative reach, on a chart whose whole job is refusing those.
Fritsch-Carlson monotone interpolation is monotone on every interval where the data is,
so it cannot leave the range of the two points it joins.

**The bars are neutral and exactly one is orange.** The first draft painted every bar
`--brand` and MEASURED /home populated at 1440 going **0.550% → 0.613%** — the accent
budget going up, on a lane whose brief is that the orange should be spent on the one
thing the screen is for. Thirty orange bars is thirty things. It is also what the
reference does and I had it backwards: its hours-by-day chart is neutral and the green
is kept for the line and the primary button. Solis and Flux both highlight exactly one
bar, and that is the shape here — every bar `--ink-mute`, the peak `--brand`, and the
peak named in words directly under the chart and in the accessible summary, so
stripping the hue loses nothing.

### 3.3 The three-day floor is gone, and that is not a loosening

`SpendArea` refused to draw below three active days and its reason was exact: *"two
points are a straight line between them, which implies a rate of change nothing
supports"*, MEASURED as *"29 points at an identical y and one spike at the right edge —
it reads as a rendering fault rather than as a chart"*.

Every word of that is an argument about a **line**. A line interpolates: it draws ink
where no reading exists, and with one active day in thirty almost all of its ink is
interpolation. **Bars do not interpolate.** Thirty bars with one tall and twenty-nine
baseline stubs is a completely readable statement — *you spent on one day* — and it is
what the reference's own hours-by-day chart looks like on a quiet fortnight.

So the floor was never about how much data there is. It was about the shape doing the
drawing, and the shape changed. The floor's real job — stopping a reader inferring a
trend from one spike — is kept, in words: *"One day with activity so far — not enough
to read as a trend."*

The first attempt at this was a designed sparse state, and reading its own frame
killed it: a number, one sentence, ~90px of nothing, and a dotted baseline is a
designed apology and still an apology.

### 3.4 `SpendArea` had ten green tests and no caller

Deleting the area chart left a component nothing rendered with ten passing assertions
still standing on it — the shape this repo already records as *a test suite that proves
the wrong thing*. Deleted, with every property re-homed and named:

| property | where it lives now |
|---|---|
| paints with `var(--brand)`, never a hex | `design-lint` rule 1, at zero |
| nothing drawn for empty / unreadable | `spend-card.test.tsx` |
| a lone spike stays inside the box | structural in `Bars` — heights are `value / peak`, so the peak IS 100% |
| a measured-zero window is not "no data" | `trend-area.test.tsx` |
| **a capped read names its start DATE** | `spend-card.test.tsx` — **and the rewrite had DROPPED it.** The sentence lived inside the chart, so replacing the chart took it with it, and no test noticed |
| one active day is not charted | **deliberately changed** — see §3.3 |

`pathFor` and its four tests moved the same way, into `charts/trend-area.test.tsx`
against the code that ships, plus the no-overshoot property the old straight segments
could not have failed.

---

## 4 · Four things only a frame showed

None of these could have been caught by a test, and each was found by reading the
after-frames as contact sheets before believing the work was done.

1. **The Performance card's one-line absence opened with two different dashes.** The
   `Unmeasured` rule rendered immediately before a sentence that already contains an em
   dash. The mark exists for a SLOT and there is no slot in that branch — only a
   sentence, which is already legible to a screen reader. It goes.
2. **`Needs your attention` put one post in column one of two,** leaving half of an
   870px card empty. `wide:grid-cols-2` was unconditional. Two columns need two items.
3. **The rail toggle was a white dot on a white page.** A 26px `PanelLeftOpen`
   rectangle — a picture of a sidebar at a size where it is four grey lines — mounted
   outside `data-surface="inverse"`, so `bg-surface` resolved to the page's white. A
   chevron, the scope declared on the button, and centred on the rail's edge.
4. **`Details` was a second brand-coloured target** 400px below `Create post`. Muted,
   like every other card head's link.

---

## 5 · Measured, before and after

Same instrument, same fixed viewports (390×844 · 1024×768 · 1440×900), same two Clerk
users per pass. `brand%` counts pixels within ±18° of `--p` #ff6600 over `HSV s>0.30,
v>0.25`; `regions` counts disjoint 8-connected blobs of them.

### 5.1 Fragmentation is the number the verdict was about

**Disjoint blobs of brand-hue accent across the 24 compositions: 145 → 124, −14.5%.**
docs/40 §5.1 took this from 321 to 145 and identified it as the figure the founder's
"no focal point" verdict actually tracks — a fraction cannot tell 0.3% in one button
from 0.3% across nine links. It falls again, and **not one composition rose**.

The biggest single drops are at 1440, where the rail's five eyebrows, six SOON labels
and six extra links all left the frame:

| | before | after |
|---|---:|---:|
| /home 1440 dark, populated | **10** | **7** |
| /analytics 1440 dark, populated | 9 | 6 |
| /analytics 1440 light, empty | 7 | 4 |
| /home 1440 light, empty | 6 | 4 |

### 5.2 Accent spend — flat or down everywhere, which is not what the first draft did

**Brand-hue pixels across all 24 compositions: 42,584 → 41,246, −3.1%.**

Every route/width/theme is flat or down. That took three attempts and the meter caught
two of them (§3.2): thirty brand bars, then one brand bar, both of which put /home
populated at 1440 UP at 0.613% against a 0.550% baseline. Neutral bars land it at
**0.502%**.

The 390 rows barely move, and that is expected rather than a disappointment: the rail
does not render below 700, so none of §1's work is in those frames, and both routes'
accent there is the page's primary plus the shell's FAB — §6 item 1.

### 5.3 Page height moved in both directions, deliberately

| | before | after | |
|---|---:|---:|---|
| /home 1440 populated | 1215 | **1256** | the 190px band left; four stat cards arrived |
| /home 390 populated | 2066 | **2484** | the band was already gone below `narrow`, so the strip is added height on a phone |
| /analytics 1440 populated | 1253 | **1507** | three stat cards, on a page that had no number at all |

**The 390 figure is the cost, and it is stated rather than buried.** A mid-range
Android gains ~420px of scroll on populated /home. What it gains for that is four
figures at 44px above the fold, on a screen whose previous first number was the
credit balance at y≈1190. The empty state — where a phone user actually starts — is
unchanged at 844px, one viewport.

### 5.4 The table

| state | route | w | theme | brand% before | after | regions before | after | page height before | after |
|---|---|---:|---|---:|---:|---:|---:|---:|---:|
| empty | `/home` | 390 | light | 3.190 | **3.190** | 5 | **5** | 844 | **844** |
| empty | `/analytics` | 390 | light | 2.571 | **2.571** | 4 | **4** | 844 | **844** |
| empty | `/home` | 1024 | light | 0.950 | **0.950** | 5 | **5** | 768 | **768** |
| empty | `/analytics` | 1024 | light | 0.734 | **0.734** | 5 | **5** | 768 | **768** |
| empty | `/home` | 1440 | light | 0.606 | **0.577** | 6 | **4** | 900 | **900** |
| empty | `/analytics` | 1440 | light | 0.485 | **0.441** | 7 | **4** | 900 | **900** |
| empty | `/home` | 390 | dark | 3.235 | **3.235** | 5 | **5** | 844 | **844** |
| empty | `/analytics` | 390 | dark | 2.581 | **2.581** | 4 | **4** | 844 | **844** |
| empty | `/home` | 1024 | dark | 0.955 | **0.955** | 5 | **5** | 768 | **768** |
| empty | `/analytics` | 1024 | dark | 0.740 | **0.740** | 5 | **5** | 768 | **768** |
| empty | `/home` | 1440 | dark | 0.609 | **0.580** | 6 | **4** | 900 | **900** |
| empty | `/analytics` | 1440 | dark | 0.488 | **0.444** | 7 | **4** | 900 | **900** |
| populated | `/home` | 390 | light | 1.196 | **1.165** | 5 | **5** | 2066 | **2484** |
| populated | `/analytics` | 390 | light | 2.560 | **2.559** | 4 | **4** | 1668 | **2154** |
| populated | `/home` | 1024 | light | 0.832 | **0.814** | 7 | **7** | 1949 | **2193** |
| populated | `/analytics` | 1024 | light | 0.739 | **0.739** | 6 | **6** | 1481 | **1697** |
| populated | `/home` | 1440 | light | 0.550 | **0.502** | 8 | **6** | 1215 | **1256** |
| populated | `/analytics` | 1440 | light | 0.503 | **0.444** | 8 | **5** | 1253 | **1507** |
| populated | `/home` | 390 | dark | 1.244 | **1.214** | 5 | **5** | 2066 | **2484** |
| populated | `/analytics` | 390 | dark | 2.576 | **2.575** | 4 | **4** | 1668 | **2154** |
| populated | `/home` | 1024 | dark | 0.844 | **0.820** | 8 | **8** | 1949 | **2193** |
| populated | `/analytics` | 1024 | dark | 0.744 | **0.744** | 7 | **7** | 1481 | **1697** |
| populated | `/home` | 1440 | dark | 0.566 | **0.504** | 10 | **7** | 1215 | **1256** |
| populated | `/analytics` | 1440 | dark | 0.506 | **0.447** | 9 | **6** | 1253 | **1507** |

---

## 6 · Logged, not fixed

| # | what | why not here |
|---|---|---|
| 1 | **At 390 both routes render two solid brand fills** — the page's primary and the shell's permanent FAB — and that is the highest brand fraction in the whole matrix. Unlike docs/40 §5.3's case they are DIFFERENT actions to different URLs, so deleting the page's would remove the only door the screen offers. | Standing the FAB down on a route whose first step is something else is a shell change across forty screens. `accent-budget.spec.ts` asserts one fill per LAYER and prints both, so the pair is visible rather than absorbed. Owner ruling. |
| 2 | **`Bars`' `hatchLabel` has no call site on either screen.** Nothing on /home or /analytics is a simulated or projected value. | It is a parameter on a component that DOES ship, with a test that proves its refusal fires — not an unreferenced module. Removing it means the next chart that needs a hatch re-invents it without the guard. Stated rather than left to be discovered. |
| 3 | **`CardEmpty` is still centred at ~40 call sites outside this lane.** Centring a sentence in a wide box is what makes it look like a shrug, and it is why `align="start"` exists. | Those are on screens this lane has not shot, and converting what cannot be looked at is a change nobody can report on — docs/40 §6's own rule for `follower-chart.tsx`. |
| 4 | **`follower-chart.tsx` still keeps 11 hand-written sizes**, including three banned 15px. Carried forward from docs/40 §6.4 unchanged. | None of its populated paths renders without a live Instagram connection, so none appears in a captured frame. |
| 5 | **`page-title.tsx` renders `<h1>` at 20px** where docs/37 §3.3 puts a page title at 24. Carried forward from docs/40 §6.3. | It is the shared primitive for ~40 routes. /home's own heading is `type-h1` (24) via `GreetingBanner`, so the two now differ — stated here rather than silently promoted. |

---

## 7 · Every guard, shown red

A guard that has never failed is a line that always passes. Each was broken, built,
run, and put back — the script is `mut-unit.sh` / `mut4.sh` in the run directory, and
**two of the eight survived their first attempt, which is the reason for doing this.**

| # | what was broken | guard | verdict |
|---|---|---|---|
| 1 | `rail-min:sr-only` → `rail-min:hidden` on every nav label | `rail-collapse.spec.ts` | **1 failed** |
| 2 | the inverse scope stops re-declaring `--muted` (the 2.49:1, put back) | `rail-collapse.spec.ts` contrast | **1 failed** |
| 3 | a second solid brand ACTION in the populated /home header | `accent-budget.spec.ts` | **1 failed** |
| 4 | the accent guard stops visiting the populated state | `accent-budget.spec.ts` | **1 failed** |
| 5 | the flat-tangent-at-a-local-extremum clause deleted | `trend-area.test.tsx` | **1 failed** |
| 6 | `Bars` stops refusing to hatch without a label | `trend-area.test.tsx` | **1 failed** |
| 7 | a measured ZERO draws nothing, like an unasked day | `trend-area.test.tsx` | **1 failed** |
| 8 | `SpendCard` stops naming the date a capped read starts at | `spend-card.test.tsx` | **1 failed** |
| 9 | a `soon` section back in the rail's projection | `reachable.test.ts` | **1 failed** |

### 7.1 The two that survived

**#5 passed on its first attempt.** `never dips below the two readings it joins` was
written against `[40, 0, 40]`, and the naive average of a symmetric V is
`(-40 + 40) / 2 = 0` — the same answer the clause under test gives. The fixture's own
symmetry supplied the property, so it could not tell a guarded implementation from an
unguarded one. `[40, 0, 10]` separates them (naive −15, correct 0), and the local
MAXIMUM case is asserted too.

**#3 passed on its first attempt, for a different reason: the mutation never reached
the page.** `accent-budget.spec.ts` bootstrapped a workspace and stopped, so every pass
measured an EMPTY one — which renders `GetStarted`, not `GreetingBanner`. The guard was
aimed at a state the founder is not looking at, and would have read in review as
coverage of one he is. It seeds one post now (`workspaceHasStarted` gates the dashboard
on exactly that), visits both states, and **asserts that it visited both** — which is
mutation #4.

### 7.2 And widening it found a defect in the guard itself

The moment it reached the populated screen it went red on the shipping product:
`populated /home 1024 and 1440, both themes: 2 in #main`. The second fill is
`Badge rung="urgent"` — `bg-brand text-primary-foreground`, and "In review" renders
~75×20 = **1500px², over the 1000px² floor** the first version used as its proxy for
"is this an action". The header had even argued for that proxy, citing the 18×18
approvals count.

**The threshold does not separate a badge from a button; interactivity does**, and
that is what docs/37 §16's rule was always about — *one primary ACTION per view*. The
count is now over `<a>`, `<button>` and `[role="button"]`. Every other large brand fill
is still measured and still PRINTED, under `marks`, so a decorative orange slab cannot
hide behind the correction — it simply does not compete to be pressed.

---

## 8 · The gate, leg by leg

`pnpm gate` runs five legs and stops at the first red one. The smoke leg needs two
things this lane learned the hard way and neither is in the script:

```bash
SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl \
E2E_SERVER_CMD='pnpm --filter @sahoda/web start -p 3280' \
pnpm gate
```

Without the first it fails in one second on the production-target guard; without the
second it runs against `pnpm dev`, where Turbopack compiles each route on first
request and the readiness probe times out.

| leg | result |
|---|---|
| 1 · `turbo-typecheck-lint-test` | **ok** — 11 packages, `@sahoda/web` 4,495 tests over 359 files |
| 2 · `vitest-root` | **ok** |
| 3 · `turbo-smoke` | **106 passed, 1 failed** on the first pass; see below |
| 4 · `prettier-check` | **ok** — all matched files |
| 5 · `turbo-build` | **ok** — `js-budget ok: 80 routes within budget` |

### 8.1 The one failure, and why it is not reported as green

`composer-widths.spec.ts` failed on the full-suite pass with

```
strict mode violation: locator('[data-composer]') resolved to 2 elements
  … unexpected value "hidden"
```

Exactly ONE component in the codebase renders `data-composer`, and this lane changed
nothing in the composer. Both copies were `hidden`, which is a document caught with
two renders of the same page in it — a mid-navigation capture, not a layout.

It is called a flake because it was **tested twice, not because it looks like one**:
the same spec on the same build passes standalone (41.5s), and it passes in a full
re-run of the smoke leg (34.2s). The failing pass had already retried it once, under
a machine running four worktrees.

### 8.2 Three gate lessons this lane paid for

1. **A scoped test run is a scoped verdict.** `vitest src/components` was green all
   evening while `tokens-css-inline.test.ts` and six assertions in `home/page.test.tsx`
   were red. The gate found both in ninety seconds.
2. **`.next` is not the source.** A gate ran against a build made during a mutation
   run, and 21 specs failed on a mutation that was no longer in any file — the accent
   guard printed `page 140x38 "Second"`, which is the mutation's own label. Rebuild
   before believing a rendered result.
3. **Two gates at once fight over `.gate/`, port 3280 and `.next`.** Started by
   chaining a second run behind a build while the first was still in its smoke leg.
   One gate, or neither.
