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

## 3 · Per screen: what leads now, and why

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

**The three named regressions, re-checked:**

| defect | state |
|---|---|
| a channel never written to saying "Saved" | not reproduced; the fixture writes both variants, and `variant-state.ts` derives the label from the row rather than from `{body:'', dirty:false}` |
| a button label that was six flex items | not reintroduced; the new choice buttons put the label and the time in **explicit spans**, precisely because a bare text fragment beside another in a flex container becomes its own item |
| `MEDIA_REQUIRED` missing from the copy allowlist | present — `gate-refusal-note` carries it; not re-verified against a live Instagram refusal, and that is stated rather than claimed |

---

## 6 · Accent spend, before and after

MEASURED with `e2e/helpers/accent.ts` (§1), 1440 light, full-page frames.
`satpx` is the absolute count of saturated samples — the column that cannot be
moved by a page changing height.

| route · state | before | after | Δ | satpx |
|---|---|---|---|---|
| `/planner` list, populated | **3.657%** | **0.908%** | −2.749 | 11850 → 2942 |
| `/planner` week, populated | 3.450% | 0.911% | −2.539 | 11972 → 2952 |
| `/planner` month, populated | 2.346% | 0.553% | −1.793 | 11504 → 2560 |
| `/planner` list, empty | 3.511% | 0.760% | −2.751 | 11376 → 2463 |
| `/planner` week, empty | 3.511% | 0.760% | −2.751 | 11376 → 2463 |
| `/planner` month, empty | 3.543% | 0.760% | −2.783 | 11480 → 2463 |
| `/posts`, populated | 0.848% | 0.650% | −0.198 | 2834 → 2107 |
| `/posts`, empty | 0.617% | 0.506% | −0.111 | 1998 → 1640 |
| `/posts/[id]`, two channels | 0.319% | 0.182% | −0.137 | 2540 → 1451 |
| `/posts/new`, empty | 0.075% | **0.096%** | +0.020 | 328 → 430 |
| `/onboarding` (8 steps) | 1.32–1.80% | 1.32–1.80% | ±0.006 | unchanged |

**`/planner` fell by a factor of four**, and the absolute count fell with it —
11,850 saturated samples to 2,942. Both halves moved, which is the test that
distinguishes a real reduction from a taller page.

**The one that went up is explained, not excused.** `/posts/new` gained the back
link, which made the page **35 pixels taller** — an *odd* number. The sampler
steps two pixels in each axis, so every element below the link changed sampling
parity and elements previously invisible to the grid became visible. Confirmed by
opening the frame: **no orange element was added**; the saturated pixels are the
rail's active item, the credits pill, "Usage" and the platform marks, exactly as
before. This is a limit of a fixed-phase sampler on a full-page capture, and it
is why the absolute count is printed rather than the percentage alone.

**`/onboarding` did not move because this lane did not change its paint.** Its
one change is the history behaviour.

> **What none of this settles.** §2.3's headline comparison is Sahoda's
> `/settings` at 0.505% against the reference's 0.030%. `/settings` is not in this
> lane and was not measured here, and — per §1 — these figures cannot be laid
> beside §2.3's own in any case. What is supported is that four routes in this
> lane spend materially less orange than they did, measured the same way, before
> and after, by an instrument that was calibrated first.

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

## 8 · Every guard written, and what each cannot see

*(completed below)*

---

## 9 · The gate

*(completed below)*
