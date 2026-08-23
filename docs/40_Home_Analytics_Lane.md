# 40 · /home and /analytics — what leads, and what it cost

**Lane** `wt-page-dash`, off `wt-integrate3` @ `fe9fab33`.
**Canon** `docs/37_Design_System_v5.md`. This file decides _what leads on these two
screens_; 37 decides everything about how it is drawn. Where they disagree, 37 wins.

Every number here is **MEASURED** by an instrument in this repository, or it says
INFERRED. The instrument is `apps/web/e2e/helpers/accent-spend.ts` and the camera is
`apps/web/e2e/page-dash-frames.spec.ts`; both are new in this lane, and the reason
they had to be is §1.

---

## 0 · Reproducing this

```bash
SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl \
E2E_PORT=3271 E2E_SERVER_CMD='pnpm --filter @sahoda/web start -p 3271' \
PAGE_DASH_CAPTURE=1 PAGE_DASH_PHASE=before UX_OUT=.ux-page-dash \
pnpm --filter @sahoda/web exec playwright test page-dash-frames.spec.ts
```

Against `next start`, never `pnpm dev`. Two Clerk users per pass — one per data
state, both deleted by the fixture. 24 compositions, 48 frames: two routes × three
widths (390 · 1024 · 1440) × two themes × two data states, each shot twice.

---

## 1 · Why the accent had to be re-measured rather than quoted

docs/37 §2.3 puts Sahoda `/home` at **0.487%** saturated and `/analytics` at
**0.498%**, and those figures are not a "before" for this lane. The script that
produced them is a Pillow one-liner that never landed in the repository, so there is
nothing to run again. A before and an after have to come out of the same instrument
or the difference is an artefact of two methods.

**And the obvious denominator is the wrong one.** A full-page frame's height is the
page's height, and this lane's whole job is to make two pages _shorter_. Collapse
five cards restating one absence into one statement and the orange pixels stay put
while the denominator shrinks — a real improvement scores **worse**. Pad the page
with dead space and it "improves". So the meter reads a **fixed viewport** (390×844,
1024×768, 1440×900, stated per width and identical across passes) and reports the
absolute pixel count beside the fraction.

### 1.1 The measurement, before

Saturated = `HSV s>0.30, v>0.25`, every second pixel — docs/37 §2.3's own thresholds.
`brand%` is the subset within ±18° of `--p` #ff6600, so a customer connecting
Instagram (h≈326) does not read as a Sahoda regression. `regions` counts disjoint
8-connected blobs of brand-hue accent ≥12 sampled pixels.

| state     | route      | width | theme | all % | brand % | brand px | regions | page height |
| --------- | ---------- | ----- | ----: | ----: | ------: | -------: | ------: | ----------: |
| empty     | /home      | 390   | light | 2.783 |   2.783 |     2290 |      14 |        2025 |
| empty     | /home      | 390   |  dark | 3.271 |   3.136 |     2581 |      23 |        2025 |
| empty     | /home      | 1024  | light | 0.880 |   0.808 |     1589 |      13 |        1795 |
| empty     | /home      | 1024  |  dark | 0.911 |   0.888 |     1746 |      18 |        1795 |
| empty     | /home      | 1440  | light | 0.638 |   0.563 |     1825 |      15 |        1085 |
| empty     | /home      | 1440  |  dark | 0.733 |   0.654 |     2118 |      30 |        1085 |
| populated | /home      | 390   | light | 3.310 |   3.184 |     2620 |      15 |        2301 |
| populated | /home      | 390   |  dark | 3.661 |   3.527 |     2902 |      24 |        2301 |
| populated | /home      | 1024  | light | 1.065 |   0.993 |     1952 |      15 |        2059 |
| populated | /home      | 1024  |  dark | 1.151 |   1.072 |     2107 |      21 |        2059 |
| populated | /home      | 1440  | light | 0.686 |   0.642 |     2080 |      15 |        1285 |
| populated | /home      | 1440  |  dark | 0.740 |   0.691 |     2240 |      23 |        1285 |
| empty     | /analytics | 390   | light | 3.016 |   2.890 |     2378 |       5 |         844 |
| empty     | /analytics | 390   |  dark | 2.921 |   2.921 |     2404 |       5 |         844 |
| empty     | /analytics | 1024  | light | 0.911 |   0.858 |     1687 |       6 |         768 |
| empty     | /analytics | 1024  |  dark | 0.929 |   0.873 |     1716 |       6 |         768 |
| empty     | /analytics | 1440  | light | 0.592 |   0.560 |     1814 |       8 |         900 |
| empty     | /analytics | 1440  |  dark | 0.603 |   0.569 |     1843 |       8 |         900 |
| populated | /analytics | 390   | light | 0.992 |   0.865 |      712 |       5 |        1652 |
| populated | /analytics | 390   |  dark | 1.065 |   0.930 |      765 |       8 |        1652 |
| populated | /analytics | 1024  | light | 0.192 |   0.139 |      273 |       7 |        1477 |
| populated | /analytics | 1024  |  dark | 0.217 |   0.161 |      316 |      13 |        1477 |
| populated | /analytics | 1440  | light | 0.171 |   0.139 |      450 |       9 |        1237 |
| populated | /analytics | 1440  |  dark | 0.186 |   0.152 |      493 |      15 |        1237 |

### 1.2 Two things in that table are not what the brief expected

**The accent is not over budget at desktop widths, and the brief's target is the
wrong screen.** `/home` at 1440 light measures 0.563% brand and `/analytics`
populated measures **0.139%** — a fifth of docs/37's quoted figure and below the
reference's own `/invoices`. Chasing 1440 would be chasing a number that is already
near the floor.

**Where it is genuinely over budget is 390**, which no previous pass measured:
`/home` populated dark reads **3.527%**, six times its own 1440 figure and 117×
the reference's `/settings`. That is the device an Indian SMB owner is holding.

**And a correction I am putting on the record, because I made it out loud before I
measured it.** Looking at the dark 1440 frame I said the greeting banner's orange
wash was the page's biggest accent spender. It is not. At 16% alpha the wash
composites to a pale tint that falls **below** the s>0.30 floor and contributes
approximately zero measured accent pixels. Locating the blobs settles it:

| frame                       | biggest brand region                                 | share of all brand pixels |
| --------------------------- | ---------------------------------------------------- | ------------------------- |
| /home 1440 light empty      | (1270,160) 124×38 — **the `Create post` button**     | **80%**                   |
| /home 1440 dark empty       | the same button                                      | 64%                       |
| /home 390 light empty       | `Create post` 124×44 (65%) **+ the FAB** 52×50 (24%) | **89% between two fills** |
| /analytics 1440 light empty | (696,368) 168×38 — **`Connect a channel`**           | **91%**                   |

The banner is a _visual dominance_ defect — 1132×190 of tinted surface holding two
words — and a separate one from the accent budget. Merging them would have sent the
fix at the wrong element.

---

## 2 · /home

### 2.1 What is a person here for?

A shop owner opens this once a day, between customers, to ask **"what needs me?"**.

docs/37 §16's procedure, run honestly, gives **two different answers** depending on
state, and that is the structural finding of this lane:

- **A workspace with work in it** → §16.4: the screen is a list, and the list leads.
  `Needs your attention` is the list.
- **A workspace with nothing in it** → §16.3: there is one action this screen exists
  to start, and it is the setup that makes everything else possible.

The page currently renders **one layout for both**: nine cards of equal weight, in
the same order, whether there is anything in them or not.

### 2.2 What is the loudest element? Does it deserve to be?

**No, twice over, and for two different reasons.**

The **greeting banner** is 1132×190 at 1440 and 358×170 at 390 — at 390 that is
**20% of the viewport's height** — and it carries "Good afternoon" plus one line of
state. It is the first thing on the page by position, by area and by fill. On the
primary device, a fifth of the first screen is a greeting.

The **`DRAFT POST` bar** is the loudest object on populated /home. `spend-bars.tsx`
scales every bar to `credits / peak`, and `peak` is the largest category — so a
workspace with **one** category always draws a bar at **100% of the track**: a
~1000px solid `var(--brand)` rectangle encoding the number that is already printed
at its right end. A comparison of one thing is not a comparison. It is the single
biggest solid-orange area in the product outside a button.

### 2.3 Is any absence stated more than once?

**Empty /home states it seven times**, in six visual languages, and the topbar makes
eight. Counted on one frame (`empty__home__full__1440__light`):

| #   | where                  | what it says                                                   |
| --- | ---------------------- | -------------------------------------------------------------- |
| 1   | topbar ring            | "No brain yet"                                                 |
| 2   | Needs your attention   | "Nothing is waiting on you…"                                   |
| 3   | Performance            | four absence rules + "Connect a channel to start measuring."   |
| 4   | Credits spent          | "Nothing spent yet. Your first AI action shows up here…"       |
| 5   | Week strip             | seven empty day boxes + "Nothing scheduled this week yet…"     |
| 6   | Brand Brain            | "Sahoda doesn't know your brand yet."                          |
| 7   | Connections            | four × "Not connected" + "You can write and plan without one…" |
| 8   | This week, from Sahoda | "Sahoda hasn't drafted anything this week."                    |

Every sentence is true and well written. docs/27 §1 found five of these on
/analytics and called it "a product apologising for itself"; /home has more, and
nobody had counted them because /home's own restructure note is about hierarchy
rather than repetition.

The credit balance is stated **three** times on one screen (topbar chip, rail foot,
`Available credits`) and the brain's confirmation count **twice** (topbar ring,
Brand Brain card). §16: "a page that says the same thing in more than one place says
it once, at the top."

### 2.4 Is any element sized by its CONTAINER rather than its CONTENT?

Yes, and 1024 is where it is worst — the band neither 390 nor 1440 exercises.
`max-wide:grid-cols-1` collapses the two-column page below 1180, so at 1024 an empty
workspace gets **1795px of stacked full-width cards**: "Sahoda doesn't know your
brand yet." is one sentence centred in a 900×80 box, and `Available credits` — a
figure the page used to lead with — lands at **y≈1190**, past the fold of a 768px
laptop. `Connections` is at y≈1415 and `Plan my week` at y≈1755. **The two things a
new user must do are the last two things on the page.**

### 2.5 Would someone know what to do next without reading everything?

On a populated workspace, yes — the queue is second and it works.
On an empty one, no. The two doors (build the brain, connect a channel) are cards 6
and 7 of 9, below the fold at every width.

### 2.6 The decisions

1. **The queue leads on a populated workspace, and it leads visually as well as
   structurally.** The banner gives up its tinted band and its 190px minimum and
   becomes one line of chrome. What was a hero is a header.
2. **An empty workspace gets one statement, not nine cards.** The same
   page-level language `/analytics` already uses, naming both doors, with one
   primary. Seven statements of absence → one.
3. **A one-category spend chart draws no bar.** The row keeps its label and its
   number; the track appears when there is something to compare against.
4. **One solid brand fill per view at 390.** The banner's `Create post` and the
   shell's FAB are the _same action to the same URL_ (`/posts/new`) rendered as two
   brand fills 600px apart. The page's copy stands down below `narrow`; the shell
   already offers it, permanently, in the thumb zone.

---

## 3 · /analytics

### 3.1 The 2026-08-20 fix was aimed one state too early

`analytics/page.tsx` gates the one-statement empty screen on

```ts
account.kind === 'not-connected' && !hasPublished && posts.length === 0
```

and its comment explains the third clause: a two-part gate turned
`analytics-history.spec.ts` red, so the gate was narrowed to "the state actually
MEASURED as broken — a workspace with NOTHING".

**That state is the one nobody stays in.** MEASURED on a workspace one step further
along — four posts, two channels published, nothing connected, which is where every
beta account sits after its first hour — the five-apologies screen **returns in
full**, and it is six now:

| #   | container             | treatment                                                                                                                                                     |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Performance           | four absence rules + "Connect a channel to start measuring."                                                                                                  |
| 2   | Instagram account     | emphasised lead + body + orange link, centred in a 1132px card                                                                                                |
| 3   | Performance over time | centred prose, ~200px of card                                                                                                                                 |
| 4   | Best performing       | centred prose, ~130px of card                                                                                                                                 |
| 5   | By channel            | a five-column table, header row, two rows of em dashes, "0 of 2 channels reported."                                                                           |
| 6   | By post               | "None of your published posts has reported metrics yet." + "0 of 2 published channels reported." + two "Can't be resolved" rows with near-identical sentences |

**1237px at 1440, 1477px at 1024, 1652px at 390, and not one number on the page.**
Lines 5 and 6 state the same coverage fact 130px apart with different nouns.

The gate closed the empty case and left the populated-but-unmeasurable case open,
which is the case that matters. **`analytics-history.spec.ts` is not loosened to fix
this** — see §3.4.

### 3.2 Hierarchy is still inverted, and now it is measurable

docs/27 §1: "the largest, most saturated element carries the least information."

| /analytics at 1440 light               |   brand % | brand px |
| -------------------------------------- | --------: | -------: |
| **empty** — nothing to say             | **0.560** |     1814 |
| **populated** — two published channels | **0.139** |      450 |

**The page is four times louder when it has nothing to report.** 91% of the empty
page's accent is one `Connect a channel` button — which is the correct place for it
— but the 44px orange marker tile above it is pure decoration on the emptiest screen
in the product, and at 390 the tile, the button and the FAB make **three** brand
fills in one viewport (2.89% brand, the joint-highest figure in the whole matrix).

### 3.3 Two defects a frame found and no test did

**"Sahoda: Sahoda:".** `EmptyState` renders `Sahoda: {tip}`; `analytics/page.tsx`
passes `tip="Sahoda: Reach and followers come from…"`. The prefix is applied twice
and ships on every empty /analytics at every width in both themes. Four frames show
it. No unit test asserts the tip's text, and `no-truncated-labels` does not read it.

**The channel table clips its own header at 390.** `min-w-[420px]` inside
`overflow-x-auto` against ~344px of usable card width, so "Engagement" renders as
"Engager" and the `Posts` column — which holds the only real numbers on the page —
is entirely off-screen with no visual affordance that the region scrolls.

### 3.4 The decisions

1. **One reason, stated once, at the top.** A readiness line leads the page and says
   what Sahoda can and cannot measure right now, plus the one remedy. Every section
   below keeps its container and its _slot-level_ absence marks (docs/37 §9), and
   stops restating the page's reason in prose. Six statements → one.
2. **The gate is not widened and the spec is not touched.** `analytics-history.spec.ts`
   asserts the performance-over-time card is present and says "has started keeping a
   history" on a workspace with one post and nothing published. That assertion stays
   true: the card keeps its container and its sentence. What changes is that the
   other five containers stop making the same announcement around it. A guard is
   never loosened to accommodate the change that broke it — so the change is shaped
   to keep it green rather than the guard reshaped to let the change through.
3. **The marker tile stands down when the page is empty.** The loudest object on a
   screen with nothing to report may not be an icon.
4. **`Sahoda: Sahoda:`** — the page stops prefixing what the component prefixes.
5. **The channel table scrolls visibly**, or drops to a stacked shape below `narrow`.

---

## 4 · The seven kinds of nothing

The brief names seven. The codebase already discriminates more than seven, in three
separate vocabularies, and **one of the brief's seven is not representable at all**.

| #   | the brief's kind               | discriminant in code                                                                                                   | on /home                                                                    | on /analytics                                      |
| --- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- | -------------------------------------------------- |
| 1   | not connected                  | `AccountAnalytics.kind === 'not-connected'`; `MetricAvailability` `unavailable/not-connected`; inbox `never_connected` | card omitted                                                                | stated once, at the top, with the remedy           |
| 2   | read failed                    | `'unreadable'`; inbox `could_not_ask`                                                                                  | `Unreadable` mark + no retry-that-cannot-work                               | stated once; retry offered, because retry can work |
| 3   | not configured                 | `'not-configured'`; inbox `not_read`                                                                                   | stated, **no remedy offered** — no amount of connecting fixes a missing key | same                                               |
| 4   | no data yet                    | `MetricAvailability.kind === 'pending'`, four reasons (`lag` · `processing` · `never-measured` · `unknown-window`)     | `Unmeasured` mark                                                           | `Unmeasured` mark + the lag sentence that owns it  |
| 5   | no workspace yet               | `activeWorkspaceRead().status === 'none'`; `MetricSeries.kind === 'no-workspace'`                                      | `<FirstRun/>` replaces the page                                             | see the defect below                               |
| 6   | **suppressed by the platform** | **NONE**                                                                                                               | —                                                                           | —                                                  |
| 7   | we could not check today       | `not-loaded` (past the 24-call cap) — a stated cap, not a failure                                                      | n/a                                                                         | "Open the post to see its metrics"                 |

**Kind 6 has no representation, and inventing one would be a lie.** Instagram
withholds account insights below a follower threshold by answering **HTTP 200 with
empty arrays** — not the documented 400 — so suppression and "too early" arrive as
byte-identical responses. `account-insights.ts` collapses both into
`nothingReported`, and its copy is deliberately worded to survive either reading.
A state that _asserted_ suppression would be a claim the transport never made.
**Logged as a product question, not built**: distinguishing it needs the follower
count as a second signal, and the threshold is Instagram's and undocumented.

**And kind 5 is currently mis-stated on /analytics.** `readInstagramAnalytics`
maps `workspace.status === 'none'` to `{ kind: 'not-connected' }`
(`account-insights.ts:266`), so an account with no workspace is told to _connect a
channel_. /home never shows it — `<FirstRun/>` short-circuits first — but
/analytics has no such guard, and `no-impossible-remedy.spec.ts` cannot see it
because that spec looks for retry words ("reload", "try again"), and "Connect a
channel" is not one. **Logged with the class it belongs to**; the remedy is
reachable in two steps rather than zero, which is why it is a wrong sentence rather
than a dead end.

---

## 5 · What changed, measured

Same instrument, same fixed viewports, same two Clerk users per pass.

### 5.1 The headline is fragmentation, not the fraction

**Disjoint blobs of brand-hue accent across the 24 compositions: 321 → 145, −54.8%.**

| | before | after |
|---|---:|---:|
| /home 1440 dark, empty | **30** | 6 |
| /home 390 dark, populated | 24 | 5 |
| /home 1024 dark, populated | 21 | 8 |
| /analytics 1440 dark, populated | 15 | 9 |

This is the number the founder's verdict was actually about. A page with thirty
separate orange things has no focal point whatever its total spend is, and the
fraction cannot see the difference — 0.3% in one button and 0.3% across nine links
score identically. Every route/width/theme fell.

### 5.2 Page height, on the state every account starts in

| empty | 390 | 1024 | 1440 |
|---|---:|---:|---:|
| /home before | 2025px | 1795px | 1085px |
| /home after | **844px** | **768px** | **900px** |

One viewport at every width, from two and a half. `/analytics` empty was already
one screen and stayed one.

### 5.3 Accent spend — including where it went UP

**It did not all go down, and the two routes moved in opposite directions.**

| | 1440 light before | after | 390 light before | after |
|---|---:|---:|---:|---:|
| /home populated | 0.642% | **0.550%** | 3.184% | **1.196%** |
| /home empty | 0.563% | 0.606% | 2.783% | 3.190% |
| /analytics empty | 0.560% | **0.485%** | 2.890% | **2.571%** |
| /analytics populated | 0.139% | **0.503%** | 0.865% | **2.560%** |

**The win: /home populated at 390 fell 3.184% → 1.196%, a 62% cut**, and that was
the worst figure in the entire before-matrix. Removing the duplicate `Create post`
did it — that button and the shell's FAB were 89% of every brand pixel on the
screen, and they are the same action to the same URL.

**The rise on /analytics populated is 3.6× and it is deliberate.** That screen
previously had **no primary action at all** — its only remedy was an orange text
link buried inside a card, which is why it scored so low. It now opens with the
one action the screen exists for, and MEASURED, that button is **80% of all the
brand-hue pixels on the page**. §2.3 does not ask for less orange; it asks for the
orange to be spent on the one thing the screen is for. A route that scored 0.139%
by having no answer was not passing the budget, it was failing the screen.

**The rise on /home empty (2.783% → 3.190% at 390) is a longer word.** The primary
was `Create post` at 124×44; it is `Teach Sahoda your brand` at 195×44. One button
either way — the region count over the same frames fell 14 → 5.

### 5.4 Totals, stated whole

Brand-hue pixels across all 24 compositions: **40,901 → 42,584, +4.1%**. The
accent budget did not fall in aggregate. It moved: off nine scattered links and a
1000px chart bar, onto one button per screen.

---

## 6 · Logged, not fixed

Each of these is real, each is out of what this lane can verify, and none is
silently absorbed.

| # | what | why not here |
|---|---|---|
| 1 | **Platform suppression has no representation** (§4, kind 6). Instagram withholds insights below a follower threshold as HTTP 200 with empty arrays, byte-identical to "too early". | Telling them apart needs the follower count as a second signal against an undocumented threshold. A state that *asserted* suppression would be a claim the transport never made. Owner's call. |
| 2 | **`account-insights.ts:266` maps `workspace.status === 'none'` to `{ kind: 'not-connected' }`**, so an account with no workspace is told to connect a channel. /home never shows it (`FirstRun` short-circuits); /analytics has no such guard. | `no-impossible-remedy.spec.ts` cannot see it — it looks for retry words, and "Connect a channel" is not one. The remedy is reachable in two steps rather than zero, so it is a wrong sentence and not a dead end. |
| 3 | **`page-title.tsx` renders `<h1>` at 20px** where docs/37 §3.3 puts a page title at 24 (`type-h1`). | It is the shared primitive for ~40 routes. Promoting it is a one-line change and an unverified visual change to 38 screens this lane has not shot. /home matches the shipped 20px rather than becoming the one page out of step. |
| 4 | **`follower-chart.tsx` keeps 11 hand-written sizes**, including two 28px and three banned 15px. | None of its populated paths renders without a live Instagram connection, so none appears in a captured frame. Converting what cannot be looked at is a change nobody can report on. |
| 5 | **The topbar restates the page's absence.** At 1024 and 1440 the brain ring reads "No brain yet" beside a page already saying nothing has happened here. | The shell's chip. Bounded at one by the guard and named there, rather than reached into from a page lane. |
| 6 | **The mascot asset is cut off in the PNG**, not by its container (§2, and `greeting-banner.tsx`). | Needs the render, not CSS. The container now fades the bottom so the cut does not read as a fault. |
| 7 | **/analytics populated repeats its coverage line** — "0 of 2 channels reported" and "0 of 2 published channels reported", 130px apart with different nouns. | Genuinely different denominators when some channels are unpublished; identical on this fixture. Deciding whether to merge them is a product call about what the two numbers mean. |

---

## 7 · The guards, and what each cannot see

| guard | layer | catches | shown red by |
|---|---|---|---|
| `page-dash-hierarchy.spec.ts` · fills | rendered DOM | a second primary action carrying the solid brand fill | the banner's duplicate `Create post` at 390 |
| · h1 | rendered DOM | a second page title | an injected `<h1 class="sr-only">` |
| · absence | rendered text | one absence stated twice on a page | a second "Nothing has been created yet." |
| · shell bound | rendered DOM | the excluded half of the `#main` scoping growing | (bound only; found the topbar's chip on its first run) |
| · doubled prefix | rendered text | `Sahoda: Sahoda:` | reintroducing the prefix in `ReadinessLine` |
| · pixel ceiling | composited pixels | accent spend past a per-route, per-width ceiling | lowering `/analytics@1440` to 0.40 |
| `accent-spend.ts` | instrument | — | (measures; asserts nothing on its own) |
| `readiness.test.ts` | pure | a remedy offered where none can work; a failure claimed where none happened | — |
| `started.test.ts` | pure | an unreadable read being mistaken for an absence | — |
| `charts.test.tsx` | component | a one-category "comparison" drawing a full-width bar | raising `MIN_FOR_COMPARISON` to 1 |

**What none of them can see** — the instrument's own list is in the header of
`apps/web/e2e/helpers/accent-spend.ts` and the DOM guard's is at the foot of
`page-dash-hierarchy.spec.ts`. The four that change how the numbers above should
be read:

1. **`regions` is comparable within a theme, not across them.** The same route, the
   same width, the same data state and therefore the same DOM measures 15 regions
   in light and 30 in dark (/home 1440 empty) for 1392 against 1758 pixels. `--acc`
   is `#bd4b00` in light and `#ff6600` in dark and the two antialias across the
   `s>0.30` floor differently against their own grounds. A light-to-dark delta is an
   artefact; a same-theme before-to-after delta is a measurement.
2. **The fill count sees actions, not elements.** A decorative solid-orange `<div>`
   passes it. That is the price of reconciling §16 with §9, and the pixel ceiling
   is what covers it.
3. **The absence count can be phrased around.** "Your week is clear" states an
   absence and matches nothing in the pattern. It is a floor on repetition, not a
   proof of singularity: it catches the failure that actually shipped — seven
   near-identical "nothing yet" sentences — and would miss seven creative ones.
4. **The ceilings are light-only and empty-only.** Dark measures a few hundredths
   higher on an identical DOM, and a populated page is not covered at all. The
   camera photographs those states and a person reads them; no number guards them.

**Every ceiling is a constant with its measured value beside it, deliberately not a
regenerable baseline.** A budget that rewrites itself is a budget that gets raised
by whatever broke it. Raising one is a design decision and has to read like one.

---

## 8 · Cost, counted

Two Clerk users per capture pass, three passes, plus two guard users per gate run —
minted against **production**, deleted by `fixtures/seeded-user.ts`.

Counted afterwards through the service-role client, for every row this lane could
have created since its first capture:

```
workspaces 0 · workspace_members 0 · posts 0 · post_variants 0
brand_memory 0 · credit_ledger 0        (workspaces all-time: 26)
```

**Nothing was left behind.** The ongoing cost is two Clerk users per `pnpm gate`,
down from the four the guard would have cost as separate `test()` blocks.
