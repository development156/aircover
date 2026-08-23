# 40 · The flow lane — /posts, /posts/[id], /planner, /onboarding

**Lane** `wt-page-flow`, branched off `wt-integrate3` at `fe9fab3`.
**Run** 2026-08-23, against `next start` on 3272, Chromium only.
**Question** not "does it render" but "does each screen decide what matters, and
does the journey through them have a next move".

Every number here is **MEASURED** (off a real pixel, a real DOM or a real build)
or marked INFERRED. Where a measurement cannot support a claim, the claim is not
made.

---

## 0 · How to reproduce this

```bash
pnpm --filter @sahoda/web build
pnpm --filter @sahoda/web start -p 3272

cd apps/web
E2E_PORT=3272 SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl UX_OUT=../../.flow-after \
  pnpm exec playwright test flow-frames.spec.ts        # 108 frames, ~3.5 min
E2E_PORT=3272 SAHODA_E2E_ACK_TARGET=rloztdhzfliyvpvxsgjl \
  pnpm exec playwright test flow-journeys.spec.ts      # reload / Back / Forward / deep link / two tabs

node scripts/design/accent-table.mjs .flow-before .flow-after
```

The frames are gitignored — they go stale the moment a token moves. The
**measurements taken off them** are committed: `docs/flow/accent-before.jsonl`,
`docs/flow/accent-after.jsonl` and the two frame manifests, so a later reader can
check this report's arithmetic without re-running anything.

### The capture, and what is in it

| | |
|---|---|
| frames per pass | **108** — 4 routes × 9 states × 3 widths × 2 themes |
| widths | 390 · **1024** · 1440 |
| themes | light · dark |
| frames whose label disagreed with the DOM's resolved theme | **0** |
| onboarding steps captured **before** any was answered | 8 of 8 |
| planner views captured, populated and empty | list · week · month |

**1024 is not optional and it is why it is in the matrix.** `globals.css` opens
`@theme` with `--breakpoint-*: initial` and then defines exactly two: `narrow`
(700) and `wide` (1180). 390 and 1440 both land in *terminal* bands, so neither
exercises 700–1179 — the band `docs/37` §13 calls the only interesting one.
`onboarding-walk.spec.ts` shoots 390 and 1440 only; this closes that gap.

**Every planner view was shot in every state.** `docs/34` §11 records a peer
first reporting "/planner has no calendar" and then finding `MonthGrid`,
`WeekGrid` and `ViewToggle` all built — only the default differed. Sampling one
view of a route with view state is the same error as sampling one width.

---

## 1 · The instrument had to be built, and it is calibrated

`docs/37` §2.3 states the accent budget as a measured fraction per screen and
names the method — HSV `s > 0.30`, `v > 0.25`, every second pixel. **The script
that produced its figures is not in this repository.** Grepped 2026-08-23 across
`scripts/` and `apps/web/e2e/` for `saturat`, `hsv` and the threshold pair: zero
hits. `scripts/design/` holds a contrast reporter, a dark-ladder solver and a
glass-cost meter, and no saturation sampler.

So §2.3's numbers can be **re-measured but not re-derived**, and
`e2e/helpers/accent.ts` is that re-measurement. It is calibrated by
`accent.test.ts` against images whose answer is arithmetic — a half-orange frame
must read 50.000%, an all-grey frame 0.000%, an all-orange frame 100.000% — and
it was **shown red** by mutating its threshold operator from `>` to `>=`, which
took the boundary case from 0% to 100% and failed one assertion.

**What it cannot see, stated rather than discovered later:**

- **It counts platform marks.** §2.1 exempts Instagram's magenta and LinkedIn's
  blue from the ration because a platform mark is identity, not chrome. This
  meter counts chroma, so it counts them. Compare a route against **itself**;
  never one route against another with a different number of marks on it.
- **It cannot be quoted against §2.3's own figures.** A second implementation of
  a stated method is not the same instrument, and §2.3 does not record whether
  it sampled viewport or full page. Every before/after below is this meter
  against itself.
- **The percentage moves when a page changes height.** These are full-page
  captures, so a page that gets shorter scores higher for the same amount of
  orange. That is what "fraction of the frame" means, and it is why the absolute
  saturated-sample count is printed beside every percentage. **A real reduction
  moves both.** Every reduction below moves both.

---

## 2 · The ninth click

> `docs/34` §1 measured journey 1 as eight clicks from nothing to a saved draft,
> identical at every width. The ninth click is the finding: **there isn't one.**

**What was there.** A bare `datetime-local`. `dd/mm/yyyy, --:--`, the only
unstyled native control on the screen, with a small calendar glyph. The stated
goal of the journey — get a post scheduled — was unreachable by looking, for a
reader who has never used a marketing tool and is meeting it on a mid-range
Android. The capture recorded the "open the schedule" stop as **absent** and the
frames either side came back with identical hashes.

**What is there now.** Three named times, and the exact instant each one means
printed underneath it:

```
Schedule
┌──────────────┐ ┌───────────────────┐ ┌───────────────────┐ ┌────────────────────┐
│ In an hour   │ │ Tomorrow morning  │ │ Tomorrow evening  │ │ Pick an exact time │
│ Sun, 23 Aug, │ │ Mon, 24 Aug,      │ │ Mon, 24 Aug,      │ └────────────────────┘
│ 6:15 pm      │ │ 9:00 am           │ │ 6:00 pm           │
└──────────────┘ └───────────────────┘ └───────────────────┘
No schedule set — this post stays a draft.
```

**Nothing here claims a time is good.** There is no best-time backend —
`schedule-field.tsx` has said so in its own header since it was written — and
`docs/37` §17 forbids rendering a number the product cannot prove. A chip reading
"Best time · 6pm" would be that invention. A named time is a *shortcut to an
instant*, and the instant is printed beside the name so the label hides nothing.
`schedule-choices.test.ts` asserts exactly that: every label contains no digits,
and the committed instant is the one the label printed.

**Every candidate is filtered against the channels' own minimum lead**
(`earliestScheduleAt`, reading `scheduleMinLeadMinutes` out of the Constraint
Engine), so a choice on the screen is a choice the validator will take. **That
filter cannot fire today** — MEASURED, all four channels declare a 5-minute lead
and the soonest choice is an hour out — so it is split into `keepScheduleable`
and proved at floors no channel currently reaches, rather than shipped as
untested defensive code.

**The exact control survives**, one click behind *Pick an exact time*. Removing
it would replace one unreachable goal with another: a person who wants 4:45 pm on
the 3rd has to be able to say so. The native input is now the implementation
detail `docs/34` §1 recommended it become.

**It cost +0.1 kB.** `/posts/[id]` went 33.4 kB → 33.5 kB, first-load 294 → 295
kB, built from existing primitives with no dependency added. The JS budget passed
unchanged on every one of the 80 routes.

**Shared with /planner.** `PlannerReschedule` renders the same component on its
own, so the planner's per-row *Schedule* control got the named times too, in the
same change.

### The 73–199 second latency

**MEASURED, and it is not a mystery.** The publish sweep is a Vercel cron at
`*/5 * * * *` (`apps/web/vercel.json`), and `lib/posts/delivery-window.ts`
already carries the arithmetic: a full interval of waiting plus a measured
49–79 s of batch runtime, allowanced to 120 s, giving a **7-minute** window that
`autoPublishTruth` refuses to call late.

**The picker did not say so.** Its live-dispatcher note read *"This goes out on
its own at around that time"* — honest, and "around" is not a quantity. A person
planning a lunch-hour post cannot tell whether around means seconds or an hour.

**It now states the window:**

> Goes out between 6:00 and 6:07 pm — Sahoda checks every 5 minutes, so it is not
> to the second.

Derived from `delivery-window.ts`, never restated, and guarded: the picker's
promised window is asserted to be **no tighter than** the window
`autoPublishTruth` uses, so the screen can never promise a range and then decline
to flag a post that missed it. The range appears **only when the dispatcher is
live** — with it off, nothing goes out at all and the existing "auto-publish
isn't live yet" sentence is the honest one. Both branches are guarded.

> **In this environment the dispatcher is OFF.** `SAHODA_PUBLISH_DISPATCH_MODE`
> is absent from `apps/web/.env`, so `autoPublishEnabled()` returns false and
> every frame in this report shows the *not-live* branch. The live branch is
> proved by unit test, not by a frame, and that is stated rather than implied.

---

## 3 · Per screen

### 3.0 · The five questions, answered from the BEFORE frames

Written before any code was touched, off the 108-frame baseline.

| | `/posts` | `/posts/[id]` | `/planner` | `/onboarding` |
|---|---|---|---|---|
| **What did they come for?** | the post they were working on | to write, and to see each channel's version | what is going out, and when | to answer one question |
| **What was loudest?** | a tinted full-width banner with its own button — *plus* two solid brand fills (Create post, the `All` filter) | a full-width sticky bar reading "No changes yet", carrying no control | a ~1100px solid orange bar for a **paid** action, above the plan | the orb, and the one question |
| **Did it deserve to be?** | **No.** §16 rung 1 is "is the user blocked"; the banner's own copy says you can write and plan without a channel. And §2.3 allows one solid fill per view, not two. | **No.** The widest object on the product's most important screen said nothing. | **No.** On `?view=month` — a view reached by clicking *Calendar* — the calendar began at y≈580 of a 900px viewport. | **Yes.** The hierarchy is settled, which is §0's precondition for delight. Left alone. |
| **Any absence stated twice?** | No — the two notices are different absences (no channel, no post). | **Yes: six.** With no media attached, the writing column carried six blocks explaining media. | No. | No. |
| **Anything sized by its CONTAINER?** | the banner, spanning the content column to hold two lines | the commit bar, spanning it to hold three words | **the Plan my week button** — `w-full` at every width | No. |
| **Would they know what to do next?** | Yes, but the eye lands on the gate before the action. | **No back link**; the only route out was the rail, which is behind *More* on a phone. | Yes, but the plan is below the offer to spend. | Yes. |

### 3.1 · What leads now, and why

The decision procedure is `docs/37` §16's ladder, asked in order — is the user
blocked, is there one number, is there one action, otherwise the list leads.

### `/posts` — the list leads

**What a person came for:** the post they were working on.

**What was loudest:** three things at once. `Create post` (solid brand fill), a
full-width `bg-brand-wash` banner with a hairline ring and its own button, and
the `All 4` filter chip — *also* a solid brand fill. `docs/37` §2.3 allows
exactly one solid brand fill per view; there were two, 71px apart, plus a tinted
band above both.

**What changed, and the reasoning:**

- **The connect banner is not a blocker, so it does not lead.** §16's first rung
  is "is the user blocked — must this be resolved before anything else on this
  screen works". The banner's own second sentence answers it: *"You can write and
  plan without one."* A previous pass demoted its button from primary to
  secondary and wrote, accurately, that "the banner is still the loudest thing in
  its own right — it has the wash AND the hairline ring." That is the finding,
  not the mitigation. It is now one line with an inline link: same claim, no
  band, no second button.
- **The filter chip takes the ink fill, not the brand fill.** `ChannelPicker`
  reached this conclusion independently and wrote it down — "an orange selected
  state paints up to four oranges on one screen" — so matching its treatment
  keeps the two selectable-pill controls in this product reading as siblings.
  A filter is navigation; the one brand fill goes to the action the page is for.

**Already fixed before this lane, verified still fixed:** Delete is icon-only
rather than the only action with standing space; the card is a stretched link
with one anchor rather than an `<a>` inside an `<a>`; the three statuses render
distinguishably (`Draft` / `In review` / `Approved` each carry their own glyph
and edge); rows carry a derived title rather than five identical "Untitled post".
One deliberately untitled row is kept in the fixture so the list stays legible
with the audit's own worst case in it.

### `/posts/[id]` — the per-channel versions lead

**What a person came for:** to write, and to see each channel's version of what
they wrote. This is the product's one differentiator and no competitor does it.

**What leads:** *Each channel's version* — a column of per-channel cards, each
with its own body, its own character meter against its own limit, its own format
controls. VERIFIED in a real browser on a real post (§5).

**Three things fixed here:**

1. **A footnote that named a channel the post does not use.** MEASURED on the
   baseline frame: a post carrying X and LinkedIn, neither connected, rendered
   *"This posts for real, straight away. Instagram takes about fifteen seconds to
   finish."* Both halves false at once — a channel that is not on the post, and a
   real-publish promise forty pixels below a warn block reading *"X and LinkedIn
   aren't connected yet, so this can't go out there."* It is now gated on the
   live set. Three new guards; **all three go red** against the original line.
2. **No way back.** `docs/34` §10 listed "no page title, no back link". Half of
   that is not a defect — the page's heading *is* the title input, and a visible
   "Write a post" above a field labelled "Name this post" would be the second
   `type-h1` §16 forbids. The back link is a real momentum gap: a person arrives
   by clicking a row on `/posts`, and the only route back was the rail, which on
   a phone is behind *More*. Now `← All posts`, the same treatment `radar/[id]`
   and the inbox threads already use.
3. **The widest element said nothing.** The commit bar spanned the full content
   column reading *"No changes yet"* with no control. It now collapses when it
   carries nothing — but only when idle **and** nothing unsaved **and** nowhere to
   finish, because a reloaded post is legitimately `idle` and needs its *Send
   it*. Hiding on `idle` alone is the obvious wrong repair and there is a test
   for it. **The `aria-live` region stays mounted**: a live region added to the
   DOM at the moment its text changes is not reliably announced, so removing the
   element outright would have swapped a visual defect for an accessibility one.

### `/planner` — the plan leads, at every width

**What a person came for:** what is going out, and when.

**What was loudest:** `Plan my week · 20 credits` as a **~1100px solid orange
bar** — `w-full` at every width — inside a 260px panel, above the plan, under a
tinted banner. On `?view=month`, a view the reader reached by *deliberately
clicking Calendar*, the calendar began at **y≈580 of a 900px viewport**. More
than half the screen spent before the thing they asked for.

**What changed:**

- **The paid panel moved below the plan at every width.** The founder ruled this
  for the phone and it was applied `max-narrow` only. MEASURED at 1440, the cost
  is *worse* on desktop, not better — the phone ruling was not a mobile
  accommodation, it was the right answer found at the width where the cost was
  unmissable. The `max-narrow:order-*` ladder is gone; DOM order is now reading
  order at every width, so there are no longer two sequences to keep in step.
- **The bar is `w-full narrow:w-auto`.** Full width is right on a phone — a
  primary under the thumb — and wrong at 1440. Deliberately **not** `sm:w-auto`:
  `docs/37` §13 records `top-up-panel.tsx` shipping exactly that, where the class
  is spelled correctly, type-checks, reads right in review and **is never
  emitted**, so the money screen's primary rendered as a ~1000px bar.
- The one-line connect note stays above the plan. It costs the plan nothing now
  and a standing condition is worth meeting early.

**Judged in all three views** (§6). **Already fixed, verified still fixed:**
unscheduled rows offer *Schedule*, not *Reschedule*; `Approved` renders once as a
chip rather than twice as a chip and a disabled button; the month grid keeps its
6×7 shape at 390 with horizontal scroll.

### `/onboarding` — the question leads

**What a person came for:** to answer one question at a time.

**What leads:** each step is one statement, one primary, one secondary. The intro
is the best-composed screen in this lane — headline, one sentence, two controls,
and the cost position stated before anything is pressed (*"Building it is free
the first time"*). The orb is a large saturated object and it is **earned**: the
hierarchy on that screen is settled, which is §0's precondition for delight.

**Not changed, deliberately.** This flow was rebuilt recently by `wt-onboard2`
and the six things the brief asked me to verify were all intact — see §4. The one
change is behavioural, not visual: the browser's Back button.

---

## 4 · Onboarding, verified item by item

| brief item | verdict | evidence |
|---|---|---|
| confidence is DERIVED and does not double-count references on resume | **holds** | `signalCount` returns `signalIds(data).length`, and `signalIds` builds a list of stable ids from the data on every call. There is no accumulating counter to double-count; duplicates are impossible by construction. |
| "FIELDS FILLED 100%" no longer contradicts "Weak signal" | **holds** | The string survives only in the comments and tests that record its removal. `confirmed-fields-meter.test.ts` asserts `queryByText(/Fields filled/i)` is null. |
| "Resolve my brand" cannot fire twice | **holds, PROVEN RED** | See below. |
| the four door statuses each keep their own sentence | **holds** | `door-outcome.ts` carries five arms, and the load-bearing distinction is intact: `unread` is a verdict about the page (`… · not read`), `blocked` deliberately is not (`… · read did not run`). |
| re-entry with an existing brain is not a dead end | **holds** | `intro-step.tsx` branches on `hasSavedBrain` to "Your Brand Brain is ready", with a **free** primary *Review Brand Brain* and a ghost *Build a new one* that states its cost before it is pressed. |
| the first resolve is free and the copy says so | **holds** | Read off the rendered frame: *"Takes about three minutes. You can stop and come back. Building it is free the first time."* |

### The refusal nobody could read, found by looking at a 390 frame

Not in the brief's list, and the worst thing this lane found on its own.

`onboarding.css` disabled its primary with `opacity: 0.34` over an `!important`
orange fill. MEASURED on real pixels — fill `rgb(255,102,0)`, label
`rgb(0,0,0)`, **effective** alpha 0.34 (multiplied down the tree, not read off
the element), over `rgb(242,242,243)` light and `rgb(13,13,13)` dark:

| | before | after |
|---|---|---|
| label on its own fill, light | **1.65:1** | **6.44:1** |
| label on its own fill, dark | **1.75:1** | **5.51:1** |

That is the same class of defect `docs/34` fix #2 called CRITICAL and fixed in
`button.tsx` at 1.37:1 — and **it survived because these screens do not use the
Button primitive.** They ship their own `.btn` classes, so a fix in the
component could never have reached them, and no amount of care in `button.tsx`
would have found it. It sits on step 01 of the flow every customer meets first,
on the one control that is supposed to tell them why they cannot continue.

The recipe is `button.tsx`'s, not a new one: a recessed surface with muted text
and an inset hairline. Opacity is not reduced at all — dimming is what produced
the unreadable pair, and the recession is now carried by a surface the tonal
ladder governs rather than by a veil over a brand fill.

`onboarding-disabled-contrast.spec.ts` guards it in a real browser, and was
**shown red against the original CSS**, reporting exactly 1.65:1 and 1.75:1. It
is a RENDERED guard on purpose: every token involved was correct the whole time,
and `docs/37` §19 is explicit that guards grading tokens cannot see what
components write. An `opacity` on an element does not exist until something is
rasterised.

It was found by building a contact sheet of all eighteen states at 390 and
looking at them together — the pale-on-pale button is unmissable beside three
siblings that are not disabled, and invisible when you read one frame at a time.

### The money guard, proven red

Not asserted — executed. `if (inFlight.current) return` was **deleted** from
`use-build.ts`, the app **rebuilt**, the server restarted on that build, and
`onboarding-money-guard.spec.ts` re-run:

```
Expected: 1
Received: 3
```

**Three server actions.** `newResolveObjectRef` mints a fresh ledger key per
dispatch, so that is three `brand_research` charges — **150 credits instead of
50**. The guard was then restored and `git diff` confirmed byte-identical to the
commit.

This is only meaningful because the spec aborts the action rather than holding it
open. The brief is right that the obvious version passes with the guard deleted:
Next 15 serialises server actions through one client queue, so hanging the first
POST stops the other two being *sent*, and the count reads "one charge" while
three sit queued behind a request the test itself is holding.

**A trap this run hit, and it would have made the proof worthless.** The first
attempt reported the port ready in one probe. It was the *previous* server:
`next start` had failed with `EADDRINUSE` and the old build — with the guard
still in it — was answering. Caught by reading the server log rather than the
probe. The re-run killed the listener by PID first and confirmed the port free.

---

## 5 · The composer, verified

Two channels, two bodies, two limits, two formats, saved, reloaded, **read back
through a surface that did not write them**.

- `composer.spec.ts` — green on the base before any change, green after. It reads
  `post_variants` back through the **service-role client**, with no app code in
  the path, and then again through the **publish dry run**, which loads the rows
  fresh on the server and runs them through the Constraint Engine. Nothing in
  that file writes either surface.
- `format-per-variant.spec.ts` — 2 tests, green before and after.
- Read off the rendered frame at 1440: X at **64 / 280**, LinkedIn at
  **224 / 3,000**, two genuinely different bodies, per-channel hashtags, kind of
  post, poll, and LinkedIn's first comment — with the header stating the claim in
  the product's own words: *"One body per channel. Edit any of them without
  touching the others."*
- `flow-journeys.spec.ts` reloads a real two-channel post and asserts both cards
  and **both limits** survive a fresh document.

### RELINK, and the crop offer — both brief items, both verified by executing their guards

- **RELINK is built, discoverable, and writes nothing.** `relink-control.tsx` is
  FSD §3.1's second half — "variants editable independently; relink re-syncs from
  canonical" — and it is an UNDO rather than a confirm, deliberately: a writer
  can judge the two bodies far better after the swap than from a sentence
  describing it. It **cannot silently discard written words**, and the reason is
  structural rather than careful: relinking writes nothing, so the mirrored body
  lands in the box marked unsaved and `post_variants` still holds the channel's
  own copy until the writer saves. It is discoverable because it is ON the
  version card — visible in this lane's own composer frames as *"Follow the post
  again"* under both the X and LinkedIn cards — and hidden only when it would do
  nothing (a channel already following, or one whose copy already equals the
  post). `relink.test.tsx`: **13 passed**.
- **The crop offer's two halves are both there.** `crop-preview.tsx` shows the
  crop it would make and `crop-focal.tsx` carries the adjustable focal point;
  `crop-outcomes.tsx` is careful that a photo under Google Business's 250px floor
  reads as a refusal rather than a fix, because cropping only removes pixels.
  And the second half — the refusal standing when the offer is declined — has its
  own guard: `crop-decline.test.tsx`, **5 passed**, whose stated subject is "the
  thing that did NOT change".

**Neither was changed by this lane.** They were verified by running their guards
and reading what those guards claim, which is weaker than driving them in a
browser and is stated as such.

**The three named regressions, re-checked:**

| defect | state |
|---|---|
| a channel never written to saying "Saved" | **fixed, and now guarded** — see below |
| a button label that was six flex items | not reintroduced; the new choice buttons put the label and the time in **explicit spans**, precisely because a bare text fragment beside another in a flex container becomes its own item |
| `MEDIA_REQUIRED` missing from the copy allowlist | present — `gate-refusal-note` carries it; not re-verified against a live Instagram refusal, and that is stated rather than claimed |

**The "Saved" defect needed a guard, not a shrug.** The first draft of this
report said "not reproduced" — which was true of the frames and worthless as
evidence, because `flow-seed.ts` writes a non-empty body to every variant it
inserts, so the defect state never existed in anything captured. Read properly,
the fix is structural and lives in `seed()`: `own = row !== undefined &&
row.body !== ''`, so the only branch that can set `following: false` is one that
has copy in it, and `{ following: false, dirty: false, body: '' }` — the exact
pair `versionStateLabel` turns into "Saved" — is unreachable.

**Nothing imported `seed()` in a test.** `follow-the-post.test.tsx` covers the
live editing session through a rendered harness, which is right for typing and
detaching; it never calls `seed`, so the RELOAD path — the one a person actually
meets coming back to a post — had no coverage. `variant-state.test.tsx` is now
that coverage: 5 tests, and deleting the `row.body !== ''` clause turns **2 of
them red**, including the one that asserts the unreachable STATE rather than the
label, so a future change that keeps the words and reintroduces the state still
fails.

---

## 6 · Accent spend, before and after

MEASURED with `e2e/helpers/accent.ts` (§1), full-page frames, **all 108 of
them** — three widths, both themes, before and after. `satpx` is the absolute
count of saturated samples, the column a page changing height cannot move.

**Across the whole lane: 2.218% → 1.625%.** 64 frames down, 25 up, 0 missing.

Mean over the six (width, theme) frames of each state:

| route · state | before | after | Δ | satpx |
|---|---|---|---|---|
| `/planner` list, empty | **3.938%** | **2.103%** | −1.835 | 8392 → 3075 |
| `/planner` month, empty | 3.938% | 2.117% | −1.821 | 8391 → 3076 |
| `/planner` week, empty | 3.930% | 2.122% | −1.808 | 8374 → 3095 |
| `/planner` list, populated | **3.709%** | **1.843%** | −1.866 | 8915 → 3650 |
| `/planner` week, populated | 3.507% | 1.832% | −1.675 | 8866 → 3547 |
| `/planner` month, populated | 2.622% | 1.413% | −1.209 | 8488 → 3169 |
| `/posts`, populated | 1.471% | 1.264% | −0.207 | 2875 → 2239 |
| `/posts`, empty | 1.415% | 1.236% | −0.180 | 2079 → 1740 |
| `/posts/[id]`, two channels | 0.371% | 0.333% | −0.039 | 2332 → 1792 |
| `/posts/new`, empty | 0.241% | 0.247% | **+0.007** | 447 → 481 |
| `/onboarding` · visual | 2.182% | 2.190% | +0.008 | 3689 → 3720 |
| `/onboarding` · references | 1.997% | 2.007% | +0.010 | 3190 → 3223 |
| `/onboarding` · audience | 1.947% | 1.939% | −0.008 | 3085 → 3060 |
| `/onboarding` · basics | 1.934% | 1.930% | −0.004 | 2925 → 2911 |
| `/onboarding` · what | 1.921% | 1.908% | −0.013 | 3015 → 2976 |
| `/onboarding` · rivals | 1.787% | 1.772% | −0.014 | 3381 → 3335 |
| `/onboarding` · knowledge | 1.570% | 1.567% | −0.004 | 3290 → 3279 |
| `/onboarding` · intro | 1.435% | 1.437% | +0.001 | 2810 → 2815 |

At **1440 light alone**, where the `narrow:w-auto` change bites hardest, the
planner figures are sharper still — `/planner` list populated goes
**3.657% → 0.908%**, satpx 11850 → 2942, and `/planner` month populated
**2.346% → 0.553%**. The six-frame means above are lower because **at 390 the
Plan my week button is still full width, deliberately** — a primary under the
thumb is right on a phone, and the mobile frames keep that orange on purpose.

**`/onboarding` did not move, and should not have.** This lane changed its
history behaviour and nothing about its paint. The ±0.014 across eight steps is
the noise floor of a full-page sampler, and quoting it as a result either way
would be reading noise.

**The one route that went up is explained, not excused.** `/posts/new` gained
the back link, which made the page **35 pixels taller** — an *odd* number. The
sampler steps two pixels in each axis, so every element below the link changed
sampling parity and some previously unsampled orange became sampled. Confirmed
by opening the frame: **no orange element was added.** The saturated pixels are
the rail's active item, the credits pill, "Usage" and the platform marks,
exactly as before. This is a limit of a fixed-phase sampler on a full-page
capture, and it is why the absolute count is printed rather than the percentage
alone.

> **What none of this settles.** §2.3's headline is Sahoda's `/settings` at
> 0.505% against the reference's 0.030%. `/settings` is not in this lane, was
> not measured here, and — per §1 — could not be laid beside §2.3's figures
> anyway. What is supported: four routes in this lane spend materially less
> orange than they did, measured the same way, before and after, by an
> instrument calibrated first and shown red.

---

## 7 · Flow: reload, Back, Forward, deep link, two tabs

`docs/34` §11 leaves two items open and both were assigned to this lane.

**Onboarding pushed no per-step history entry**, so Back left the route entirely
— on the screens every customer meets first. The typed words already survived it
(the store writes to `localStorage` on every move) and *that fix was necessary
and is not this one*: surviving a wrong exit is not the same as not being thrown
out. A person who presses Back expecting the previous question does not know
their answers are safe; they know the flow vanished.

`use-step-history.ts` pushes an entry per step with **the url argument omitted**,
so the address bar never changes and Next's router has no navigation to reason
about. A `#step-3` implementation would pass every Back assertion and hand the
router one on a route that is one page with nine internal states. `history.state`
is **spread, not replaced** — Next keeps its router keys there, and replacing the
object degrades the next soft navigation into a full reload, silently, and only
when someone presses Back.

**Forward-after-Back is exercised nowhere, for any flow.** It is the item worth
having: a Back implementation that pushes a new entry as it returns passes every
Back test that exists and makes Forward permanently dead. It is now covered in
both layers, and the mutation that produces exactly that defect turns it red.

---

## 8 · Every guard written, shown red, and what each cannot see

**Every one of these was executed against the defect it exists for**, not
reasoned about. A guard that cannot fail is worse than none, because a green
result is read as evidence.

| guard | what it catches | shown red by | what it CANNOT see |
|---|---|---|---|
| `e2e/helpers/accent.test.ts` (9) | the accent meter mis-reading, or reporting a clean frame it could not decode | flipping `s > SAT_MIN` to `>=` — the boundary case went 0% → 100% | it grades the METER, not any screen. It cannot tell you a route regressed; only that the number describing it is arithmetically right. And it says nothing about the sampler's fixed phase, which §6 had to explain by hand. |
| `schedule-choices.test.ts` (14) | a named time whose label disagrees with the instant it commits; a delivery promise tighter than the cron can keep | — (its subject is new code; the shape is guarded at the component layer below) | it is pure. It cannot see whether the CHOICES REACH A SCREEN, which is exactly the gap `docs/34` found — the old picker's logic was fine and unreachable. |
| `schedule-field.test.tsx` (22, 8 new) | the label lying; the delivery window shown when the dispatcher is off; selection carried by colour alone | 3 mutations: morning committing the evening hour (1 red), ungating the range (5 red), `aria-pressed={false}` (1 red) | jsdom has no layout, so it cannot see the pills WRAP correctly at 390 — that is settled by the frames in §6, not here. |
| `publish-now.test.tsx` (14, 6 new) | a footnote naming a channel the post does not carry, or promising a publish under a block refusing one | restoring the original unconditional line — **3 red** | it reads the rendered text. It cannot tell you the sentence is *good*, only that it is not making a claim about the wrong channel. |
| `commit-bar.test.tsx` (6, all new) | a full-width bar carrying one grey phrase and no control; and the wrong repair, which is hiding on `idle` alone | the component had NO test at all before this, which is why the defect survived two audits | `.sticky` is matched by class, so a refactor that renames the wrapper would make the "no bar" assertions pass vacuously. The counterweight tests (bar present) are what stop that being silent. |
| `use-step-history.test.tsx` (8, all new) | Back leaving the flow; **Forward killed by a Back that pushes**; Next's router keys destroyed; a foreign popstate blanking the screen | 4 mutations, each caught by its own: pop-that-pushes (**2 red, incl. forward-after-Back**), push-instead-of-replace (1), replace-instead-of-spread (1), no `isStep` (1) | jsdom's history is real but its ROUTER is not — it cannot see Next degrading a soft navigation into a full reload. That is why §7's browser leg exists. |
| `media-pane.test.tsx` (+5) | six blocks explaining media on a post with none — and the wrong repair, deleting the claims | the absence assertions are paired with "…and BOTH come back the moment a file lands", without which they would pass against a component that lost them | it asserts presence, not position. It cannot see that the notes are in the WRITING column, which is what made them a defect rather than clutter. |
| `flow-journeys.spec.ts` (10, all new) | reload / Back / Forward / deep link / two tabs, in a real browser | the onboarding legs go red against the pre-hook build by construction — Back left the route | it is a READ-side check for the two-tab case. The concurrent WRITE collision is `docs/23`'s subject and `concurrent-edit.spec.ts` owns it; this deliberately does not duplicate it. |
| `flow-frames.spec.ts` (6) | a capture that silently shot fewer frames than it claims | it asserts an exact frame count per combo, so a selector that stopped matching fails rather than reporting green | **it cannot judge a frame.** It proves 108 distinct images exist; only opening them settles what is in them, which is why §3 quotes what was seen and not what was counted. |
| `design-lint` ratchet | a hand-written font size creeping back | reintroducing one `text-[12.5px]` — **FAIL, NEW in 1 file** | it reads SOURCE. A size arriving through a variable, a `cn()` branch or a token indirection is invisible to it. |

**Tightened, not loosened:** the font-size baseline went **838 → 828** (five
files improved) and the new number was shown to bite. Spacing stays at 139 and
breakpoints at 0 — untouched, neither loosened nor claimed as progress.

### The one test that was changed, and why it is not a loosened guard

Four assertions in `schedule-field.test.tsx` reached the native `datetime-local`
directly, because it was the only control the field had — **and that was the
defect being fixed.** The input now sits one click behind *Pick an exact time*.

Every guarantee those four asserted is unchanged and still asserted: the
wall-clock rendering, the re-sync when the stored value is replaced, the clear,
and the keystroke that must not be eaten. What changed is how the test navigates
to the control, which is a property of the screen rather than of the promise. The
named-time path **added** eight guards rather than replacing any. One assertion
did get stronger: "clears the field" now also requires the field to have folded
back to the named choices, which is the state a person with no schedule meets.

---

## 9 · The gate

Run against `next start` on 3272, `--concurrency=1`, never piped —
`scripts/gate.mjs` writes each stage to `.gate/<n>-<stage>.log` and puts the
verdict on stderr as well as stdout, precisely so a `| tail` cannot swallow it.

**GATE PASSED**, all five stages, on the final HEAD, against a `.next` cleared
and rebuilt immediately beforehand.

| stage | command | result |
|---|---|---|
| 1 | `turbo run typecheck lint test --concurrency=1` | **ok** (53.1s) — 27 tasks |
| 2 | `vitest run` (root) | **ok** (1.3s) |
| 3 | `turbo run test:smoke --concurrency=1` | **ok** (963.3s) — **102 passed · 0 flaky · 0 failed** |
| 4 | `prettier --check .` | **ok** (18.5s) |
| 5 | `turbo run build --concurrency=1` | **ok** (51.6s) — js-budget ok, 80 routes |

**Every stage here is a real run, not a replay.** An earlier attempt reported
stage 1 at 0.6s, which is a cache replay verifying nothing; it is recorded as
such below rather than quoted as a result. This run's 53.1s is genuine — the
tree changed, so the input hash did. The full unit suite also runs directly on
this tree at **4521 passed, 13 skipped, 0 failed**, and `design-lint` reports
828 / 139 / 0 / 0 with none new.

**Stage 3 is quoted at 102 passed with nothing flaky**, which is the whole
`@smoke` tag.

### Four earlier runs failed, and each says something different

**Run 1 failed stage 1** on `src/lib/media/crop-geometry.test.ts` — "Test timed
out in 5000ms", at 5131ms. Not this lane's file (it is not in the diff), and it
**passed standalone in 2.14s, 28/28**. `journalctl -k` showed **no OOM**; the
load average was **16.08**, from peer sessions running browser automation on the
same machine. A 2.6% overrun of a 5s limit under that load is contention, and
the second run passed the same stage in 69.5s.

**Run 3 failed stage 3, and that one WAS mine.** Playwright's default
`testMatch` is `**/*.@(spec|test).?(c|m)[jt]s?(x)`, so it collected
`e2e/helpers/accent.test.ts` — a **vitest** file — and threw
`Cannot read properties of undefined (reading 'config')` at its `describe`.

The important part is not the error, it is the blast radius: a collection error
takes the **whole suite** with it. `playwright test --list` reported **0 tests in
0 files**. The gate's smoke leg had nothing to run and reported that only through
a stack trace, not as "0 tests" — so a less careful reading of a green-looking
run would have banked a smoke stage that executed nothing.

Fixed by pinning `testMatch: '**/*.spec.ts'`, and **proved not to be a
narrowing**: `accent.test.ts` is the only non-`.spec` test file in the tree, and
`--list` after the change reports **236 tests in 57 files, 102 under @smoke** —
the @smoke figure this repo gates on, unmoved.

**Run 5 failed stage 3 on SIX unrelated specs at once** — `analytics-history`,
`approvals` (×2), `assets`, `audience-layers` (×2) — every one of which had
passed forty minutes earlier on code that differed only by a unit test and two
documents. Six unrelated failures together is an environment, not a diff. The
run before it had ended with `turbo run build`, which **rewrites `.next`
underneath the long-running `next start` that stage 3 then reuses**; this lane's
brief warns about exactly that ordering. Killed, `.next` cleared, rebuilt,
server restarted, and the re-run was clean.

**Run 6 failed `composer-widths` twice, and that one IS in this lane** — the
composer is `/posts/[id]` and this lane added wrapping pills to it, so a
sideways-scroll failure was a live possibility and was chased rather than
dismissed. It passed standalone in 34.4s, and passed again in the clean run
above. The gate had been killed before Playwright printed its failure detail, so
**there is no artefact and no error text for run 6, and no claim is made about
why it failed** — only that the behaviour it guards passes on a clean server,
twice, at every width and both themes.

**Stage 3 is quoted against `next start`, not the gate's own `pnpm dev`.** That
is a deviation and it is stated rather than glossed: `docs/34` §11a records the
same one, where a dev run produced 32 × `ERR_CONNECTION_REFUSED` and 24 ×
"Could not find the module" — one dead Turbopack server, not fifty-six failures —
and the identical commit passed against `next start`. This lane's brief requires
`next start` for the same reason.

**`.next` was cleared before the build this gate ran against.** Stage 5 leaves a
production build behind that a later stage 3 would silently run against, and a
turbo leg finishing in under a second is a cache replay verifying nothing.

---

## 10 · What this lane did NOT do

Stated so a reader does not mistake silence for coverage.

- **`posts.body` still has no CAS.** `post_variants` has a `version` column and a
  compare-and-set; the canonical body does not, so two tabs editing it still
  silently overwrite and the two editors behave differently on the same
  collision. **Not fixed, and deliberately.** It needs a `version` column on
  `posts`, a CAS predicate in whichever RPC owns the write, and a decision about
  what each editor does on a losing write — a `packages/db` migration plus a
  contract change touching every writer of the shared body. That is another
  lane's ownership and doing it here would be a scope expansion disguised as a
  paint job. **What it needs, precisely:** `posts.version integer not null
  default 1`; a `save_post_body(p_id, p_expected_version, …)` RPC that updates
  `where id = p_id and version = p_expected_version` and returns the current row
  when it matches nothing; `useAutosave` carrying the version it read and
  surfacing a losing write through the divergence notice the variant path
  already has.
- **The delivery-range sentence is proven by unit test, not by a frame.**
  `SAHODA_PUBLISH_DISPATCH_MODE` is absent from this environment, so
  `autoPublishEnabled()` is false and every frame shows the not-live branch. The
  live branch WAS photographed by restarting the server with the flag on — and
  it correctly showed the CONNECTION GAP claim outranking the timing note, since
  the fixture's channels are unconnected. A frame of the range itself needs a
  live connection row, which this lane did not create.
- **`MEDIA_REQUIRED` was verified present in the copy allowlist, not against a
  live Instagram refusal.** Stated as read, not as exercised.
- **RELINK and the crop offer were verified by running their guards, not by
  driving them in a browser.** 13 and 5 tests respectively, both green, both
  read. Neither was changed.
- **The composer's writing column is better, not solved.** Two "not built yet"
  notices remain in it (inline rewrite, and the generator's terms). Both are
  true and both are about controls that ARE on the screen, which is the test the
  two removed ones failed — but the column is still denser than the writing in
  it deserves.
- **`/planner` empty renders identically for all three views.** Found by frame
  hashing: `list`, `week` and `month` collide byte-for-byte with nothing
  scheduled, because `ViewToggle` only renders once a post exists. Defensible
  (empty is empty) and worth an owner's eye, because a new account cannot see
  that a calendar exists at all until it has a post. **Logged, not fixed** — it
  is a question about what a new workspace should be shown, not a bug.
- **Shared surfaces this lane touched**, listed for whoever integrates it:
  `apps/web/playwright.config.ts` · `apps/web/vitest.config.ts` ·
  `scripts/design/design-lint-baseline.json` · `.gitignore` ·
  `components/connections/connect-first-note.tsx` (also rendered by /posts) ·
  `components/composer/commit-bar.tsx` · `components/composer/composer-header.tsx`
  · `components/posts/publish-now.tsx` · `components/posts/media-pane.tsx` ·
  `components/posts/post-filters.tsx` · `components/posts/schedule-field.tsx`
  (also rendered by /planner's row control) · `styles/onboarding.css` ·
  `components/onboarding/stage/store.ts` (one export added).
  **The baseline file is the one to watch**: it is a `globalDependencies` entry
  every lane touches, and a merge that takes the wrong side silently loosens the
  838 → 828 ratchet back up without failing anything.
- **The five stranded `sahoda.e2e` workspaces in production are not this
  lane's.** All five are dated 19–21 August, before the fixture's
  `assertCleanupCapable` fix. Every workspace this lane created on 2026-08-23 is
  gone: the only two rows dated today belong to LIVE Clerk users minted after
  this lane's last capture finished — a peer session running concurrently
  against the same database.
