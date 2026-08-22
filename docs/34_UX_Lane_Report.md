# 34 · The UX lane — five journeys, 527 frames, and what a person actually meets

**Lane** `wt-ux`, branched off `wt-integrate` at `196c0fd`. Pushed to `idivasm/wt-ux`.
**Run** 2026-08-22, 04:11–12:00 IST, against `next start` on 3243, Chromium only.
**Question** not "does it pass" but "would a shop owner enjoy using this".

---

## 0. How to reproduce this, and what it is made of

```
pnpm --filter @sahoda/web build
pnpm --filter @sahoda/web start -p 3243
cd apps/web && E2E_PORT=3243 pnpm exec playwright test ux-detector-selftest.spec.ts   # calibrate first
E2E_PORT=3243 pnpm exec playwright test ux-j1-new-user.spec.ts ux-j2-returning.spec.ts \
  ux-j3-sweep.spec.ts ux-j4-mistakes.spec.ts ux-j5-phone.spec.ts ux-motion.spec.ts ux-audit.spec.ts
node scripts/ux-report.mjs --view=defects
```

Frames land in `.ux/<journey>/`, one manifest row per frame in `.ux/manifest.jsonl`, and a
screenshot-free measurement pass in `.ux/audit.jsonl`. Both are gitignored: they are evidence,
not source.

| | |
|---|---|
| distinct frames | **527**, of which **523 were opened** and read |
| distinct screens (journey × stop) | **138** |
| widths | 390 (194) · 1024 (136) · 1440 (193) · 844 landscape (4) |
| themes | light 288 · dark 239 |
| frames whose label disagreed with the DOM's resolved theme | **0** |
| routes measured by the calibrated detectors | 40 routes × 3 widths × 2 themes = **240** |
| fresh Clerk accounts minted and destroyed | one per (journey, width, theme) — **44** |

**Every journey got its own fresh account at every width and theme.** Nothing was reused
between them; `fixtures/seeded-user.ts` mints a `+clerk_test` user per test and deletes both the
Clerk user and its Supabase rows afterwards.

### The instruments were calibrated before they were believed

`e2e/ux-detector-selftest.spec.ts` shows every detector a known-good and a known-bad against a
synthetic page whose right answer is arithmetic. **White-on-white measures 1.00, black-on-white
measures 21.00**, through the same code path the app is graded by. Eleven assertions, green.

This is not ceremony. Three of them were wrong when first written and the self-test is what
said so — see §7.

---

## 1. Journey 1 · The new user

**Fresh account → workspace → Brand Brain → a first post. Eight clicks.**

The count was identical at all six (width, theme) combinations, which is itself worth knowing:
the flow does not get longer on a phone.

```
1. Create workspace (the empty state's button, not the topbar's)
2. Continue (intake)
3. Read this (the door)
4. Continue (the door)
5. Resolve my brand · 50 credits
6. Approve the brain
7. Create post
8. Pick the Instagram channel
```

**Eight clicks from nothing to a saved draft is good.** It is also where the story stops being
good, and the ninth click is the finding: **there isn't one.** The journey's stated goal was "a
first *scheduled* post", and the composer has no control called Schedule. Scheduling is a bare
`dd/mm/yyyy, --:--` native `datetime-local` input in the Send it panel — the only unstyled
native control on the screen. A shop owner sees a date mask and has to know to click the tiny
calendar glyph. The capture recorded `16-schedule-open` as *absent* and frames 15 and 17 came
back with identical SHA-256 prefixes, which is what "nothing happened" looks like in a manifest.

**What worked.** The bootstrap is one press and it grants 100 credits visibly. The door
("Show us how you already talk") is the strongest idea in the product: a link, a PDF or one
sentence, read for free before anything is spent. The read-back panel that appears afterwards —
headed with what Sahoda will hold — was named the single best piece of design in the corpus by
an independent reader.

**What confused.** Screen one summarises three guesses into a bold second-person sentence —
*"You're a service business in everyday consumer goods and services, in India."* — and the grey
line directly beneath it retracts the whole thing: *"We could not read any of this from your
words — pick below."* The boldest sentence on the screen is an assertion the screen has just
said it cannot make.

**What broke.** Typing *"We roast and sell single-origin coffee from a small shop in Pune"* left
the sector on the catch-all **General consumer**, with **Food and drink** sitting unselected two
chips away — on a screen whose own placeholder is *"e.g. I run a bakery on Prabhat Road in
Pune"*. A wrong pre-pick that the reader must notice and undo is worse than an honest blank,
and it seeds the Brand Brain for anyone who just taps Continue.

**What I would change.** Make the sector lexicon cover the shape of sentence the product invites
(coffee/roast/bakery/café/kitchen/menu → Food and drink), and where confidence is genuinely low
say *"We could not tell your sector from that"* and leave every chip unselected. Then give the
composer a real Schedule control and let the native input be its implementation detail.

---

## 2. Journey 2 · The returning user

A workspace with a Brand Brain and four posts in **four different states** — draft, review,
scheduled, draft — because the returning user's real question is *which of these is waiting on
me*, and four drafts cannot answer it. Seeded through `adminClient()` under the workspace the
app itself bootstrapped, so cleanup removes every row.

**Does /home answer "what needs me"?** Yes, structurally: a card literally headed *Needs your
attention* leads the page. On the seeded workspace it is the right card in the right place.

**Can they find what they were doing?** Yes — `/posts` lists all four by their own words and the
seeded draft reopened on the first click.

**What broke, and it is the sharpest honesty defect in the corpus.** The scheduled post wears a
solid-orange **Scheduled** badge — the loudest object in the row — with a calendar glyph and
*"23 Aug 2026, 04:59 pm IST"*. Three lines lower, in quiet 12px: *"Won't post itself —
scheduled auto-publish isn't live yet."* The certainty rung says committed; the sentence says
nothing will happen. **Logged, not fixed** — the rung is chosen from `posts.status`, and
changing which rung a status earns is an owner ruling about what the product promises, not a
presentational choice.

---

## 3. Journey 3 · The person with nothing

**Every route in the product, at three widths and both themes: 240 frames.** A workspace exists
and nothing else does. This is the state every beta account is in for its first hour, which
makes these the most-seen screens in the product.

The headline is `/analytics`, and it is a composition failure rather than a mistake. Five cards,
each arguing correctly for its own existence, each reviewed against its own gate and never
against its four neighbours:

| card | what it said |
|---|---|
| Performance | four absence rules + "Connect a channel to start measuring." |
| Instagram account | "Connect Instagram to see followers and reach." |
| Performance over time | "Sahoda has started keeping a history. Nothing has been measured yet…" |
| Best performing | "Nothing has been measured yet, so there is nothing to rank." |
| Nothing published yet | "Analytics start once a post goes out on a channel." |

**1250px of page to deliver one fact.** Every sentence true; the sum reads as five separate
failures. **Fixed** — docs/26 §4 already rules on it: with no account linked and nothing
published, none of those quantities can have a value from any source, which is the third state,
and the third state says *delete the slot*. One state now, naming both doors, with **one**
primary (connecting leads, because a post that goes out on no channel is still never measured).

Two more from this sweep, both **fixed**:

- **`/connections` truncated its own subject.** "Instagr…", "Google …", "Faceboo…" — at 1440, on
  a four-column grid, on the one screen whose entire job is telling channels apart. The name and
  the status chip were siblings in one row with the chip `shrink-0`, so the name absorbed all
  the shrink.
- **`/playbooks` drew five switches labelled "Off"** and disclosed that they were pictures only
  in the page's last sentence. The switch *shape* is a documented ruling and stays; "Off" is a
  state claim about a thing that does not exist. They say **"Not built yet"** on the object now,
  and the footer names two things that DO work today (Inbox, Planner) instead of trailing off.

---

## 4. Journey 4 · The person who makes a mistake

Six mistakes, each its own test so one dead end cannot hide the next: over the character limit,
a 4:1 image, no credits mid-action, a stale second session, leaving mid-edit, and three wrong
URLs. The balance was zeroed through `app.apply_ledger_entry` — never a raw `UPDATE` on
`credit_balances`, which has exactly one legal writer.

**A gap in this journey, found by review rather than by capture, and now closed.** J4 originally
ran at 1440 and 390 only, and J5 at 390 plus one landscape width — so **no mistake screen and no
phone-specific screen was ever seen in the 700–1179 band**, the band docs/26 §9.1 makes the only
interesting one and the band past audits found the most in. An error screen is precisely where a
constrained layout gives way, because it is the layout carrying an extra sentence nobody
budgeted for. 1024 is now in J4's matrix, and J5 gained the width where the bottom bar hands
over to the collapsed rail. **The frames in this report predate that addition**; the routes it
covers were swept at 1024 by J3, the mistake states were not.

This journey produced the two worst findings in the lane, and both are honesty defects.

**The ledger reported a spend as money arriving.** `credit_ledger` carries a CHECK requiring
`amount > 0` for every `entry_type` except `ADJUST`, so a DEBIT is stored **positive** and the
direction lives in `entry_type`. Home's activity feed derived it as `entry.amount > 0` — true for
every row in the table. So Home showed *"Ux probe **+100**"* with a tick, directly above
*"AVAILABLE CREDITS 0"*, while `/wallet` showed the same row as **−100**. Two surfaces, one row,
opposite claims. **Fixed**, and guarded by a test whose DEBIT fixture has a positive amount —
a negative one is a row the database cannot hold and would pass against the broken code.

**The out-of-credits screen never says you are out of credits.** At a zero balance, Home renders
*"AVAILABLE CREDITS / 0 / credits to spend"* — a bare figure, no sentence, no link — while
`/wallet`'s identical card carries the explanation and the top-up. **Logged**: the fix wants the
shortfall on the action's own line ("Plan my week · 20 credits · you have 0") and a route to
`/wallet` instead of a refusal, which is a spend-path change rather than a paint job.

**The stale save says "Post saved".** On the frame captured to demonstrate a losing concurrent
edit, the only signal in 1978px of page is a commit bar reading *"Post saved · 1 version not
saved"*. No divergence notice, no channel named, nothing saying the post moved elsewhere.
**Logged** — the count can name what it counts at zero cost ("your Instagram version is not
saved"), but the conflict surface itself is `docs/23` work.

Two more, both **fixed**: the disabled primary (§6) and the 404 (§6).

---

## 5. Journey 5 · The phone user, on a bus

Journeys 1–4 already run at 390, so this covered only what exists *only* on a phone.

**The bottom bar is the entire navigation below 700px** — the rail is `max-narrow:hidden`. Four
slots: Home, Inbox, [ + ], Planner, More. Seventeen destinations live behind *More*.

**What broke.** On a workspace-less account the 50px orange FAB is the largest painted element on
the screen, and the card behind it is a *second* brand fill saying "Create workspace". Two fills
means neither leads. **Fixed**: the FAB is absent until a workspace exists, and the slot stays so
the four tabs keep their spacing. An `unreadable` workspace read keeps the FAB — hiding a control
because a question failed would be claiming an answer nobody got.

**What did not break, and I expected it to.** Under 1.6 Mbit / 750 Kbit / 150ms RTT with 4× CPU
throttling, `/posts` at 390 was **fully rendered at 150ms** — heading, banner, empty state,
action, tip. The old measurement of 4752ms with no skeleton does not reproduce. Two things
changed since: the route segments gained `loading.tsx`, and this run used `next start` rather
than `pnpm dev`.

**The orb is present at 1440 and absent at 390.** The mascot in the Home hero is the argument of
that band; the phone hero is text and a button. Defensible as a responsive choice, and worth an
owner's eye, because 390 is the primary device.

---

## 6. What no test could see

### The pointer that Tailwind v4 took away — **fixed**

`preflight.css` in `tailwindcss@4.3.3` mentions `cursor` exactly once, and only to correct
Safari's number-input spinners. v3's carried `button, [role="button"] { cursor: pointer }`. The
upgrade removed it across the whole app with no warning.

MEASURED before the fix: `cursor: default` on **Create workspace, Continue, Resolve my brand,
Adapt for 1 channel · 3 credits, Read this, Preview publish, Save, Choose from library, Search
Sahoda**, the workspace switcher, the channel chips and the bottom bar's More — up to **26 on a
single screen**, across 188 frames. Fixed in the base layer, not on the Button primitive: it is
not a Button problem, it is every `<button>` including the ones written next week.

### A disabled primary at 1.37:1, failing in opposite directions — **fixed**

`disabled:bg-line disabled:text-white disabled:opacity-100`.

| theme | pair | measured |
|---|---|---|
| light | white on `--line` | **1.37:1** — the label was effectively invisible |
| dark | white on the composited `--line` | **17.89:1** — the refusal looked pressable |

`opacity-100` was there precisely to stop the base 45% dimming from applying, so nothing rescued
it. `bg-s2` + `text-muted` measures **6.93:1 light / 6.12:1 dark** — legible in both, recessed in
both. Pinned by a test that grades the shipped tokens *and* asserts the old pair still measures
under 2, so the guard can fail.

### `--surface-2` was `--surface`, exactly — **fixed**

The deepest finding in the lane, and nothing in the repo could see it.

| step | light | dark, as shipped | dark, now |
|---|---|---|---|
| `--surface` → `--surface-2` | 1.044:1 | **1.000:1** | 1.042:1 |
| `--surface-2` → `--surface-3` | 1.054:1 | 1.089:1 | 1.045:1 |

One rung was nothing and the next carried a double. MEASURED across all 40 routes in dark:
**117 of 120 frames** carried at least one element whose fill was its parent's own colour with no
edge of its own, the commonest being the topbar's workspace chip — on every page in the product.

**And the vector was a documented fix.** `apps/web/CLAUDE.md` prescribes
`bg-tint-50 text-accent dark:bg-s2` for dark accent-on-tint. It is *right* about contrast and it
routed every element that used it onto the collapsed rung. `#1b1b1f` was solved against the light
theme's own step sizes, the method `dark-ladder.mjs` used for the ink ladder. docs/26 gains
**§2.1**; the CLAUDE.md bullet gains its second half; `dark-surface-ladder.test.ts` grades the
gap, not the value, so the theme can still be retuned.

Three fills the token cannot reach, because they paint their own ground — all **fixed**: the ⌘K
key cap (`bg-surface` inside a `bg-s2` field), and two composer notes on `bg-s1`, which **is**
`--canvas`, the same `#ffffff` as the page *and* as `--surface` on light.

### Ink on orange, at every call site — **fixed**

`--pfg` has been `#000000` (7.15:1) for a while and `own-medicine.test.ts` grades it. That did not
stop three call sites writing the literal:

- `badge.tsx` rung 1: `bg-brand text-white` — **2.94:1** — on the badge that reads *"Weak signal —
  inputs conflict"* on the screen where an owner approves a brain, while the Approve button
  1500px below wore the correct pair;
- an unread-count badge in the inbox;
- **the destructive button's *light* hover.** It carried `dark:hover:text-primary-foreground` and
  no light counterpart, so hovering **Delete** on light painted white on orange. The asymmetry was
  the tell, and a single-rule scan could not have seen it.

`ink-on-brand.test.ts` scans source with **two** rules — the resting pair and the state pair —
because rule A alone misses the third. Both ends of both rules are calibrated.

### Eighteen anonymous icons between 700 and 1179 — **fixed**

The nine-unnamed-links fix restored the *accessible* name and stopped there. Its own comment
states the problem as "unlabelled to the eye across every width from 768 to 1179", and `sr-only`
answers only the screen-reader half of that sentence. MEASURED at 1024 on `/analytics`: eighteen
icons in a 64px strip, every label clipped to 1px, no `title`, nothing on hover. A native `title`
now carries the name (and ", not built yet" for the six roadmap rows). It cannot be clipped by
the rail's `overflow-y: auto` the way a CSS tooltip would be.

### A rail that hid the page you were standing on — **fixed**

At 1440×900 the rail holds more rows than its box. AUTOMATE and everything under it sat below the
fold, so on `/loop` and `/playbooks` the app highlighted the current route on a row nobody could
see. It opens on that row now — `scrollTop`, never `scrollIntoView`, which walks every scrollable
ancestor and would scroll the page too. Bottom padding went 8px → 24px so the fade mask lands on
space instead of through the middle of a word.

### The 404 was light-only in a dark session — **fixed**

MEASURED under real conditions, in one session:

```
/home                        data-theme="dark"   body rgb(11,11,12)
/this-route-does-not-exist   data-theme=NULL     body rgb(255,255,255)
```

…with `localStorage['sahoda-theme'] === 'dark'` and the inline script present in the document
three times over. Next re-renders the root layout on the not-found boundary instead of hydrating
it, and a re-rendered `<html>` keeps only the attributes React authored. Its light and dark frames
were **byte-identical** (md5 `79189e65…` at 1440, `40e0c556…` at 390) while every other stop in
the corpus differed.

A mount-time guard puts the attribute back. **The durable fix is logged, not half-built**: a
`@media (prefers-color-scheme: dark)` block in `tokens.css` guarded as
`:root:not([data-theme='light'])`, so the palette is right when no script runs at all. That
duplicates forty declarations and needs a generator plus a sync test to stay honest.

### The after picture, measured

`e2e/ux-verify.spec.ts` re-opens the screens the fixes touched and re-runs the detectors that
found the defects. Five configurations, all green:

| check | before | after |
|---|---|---|
| clickable things wearing an arrow, `/posts` @1440 | 3–4 of 31 | **0 of 31** |
| `/posts` @390 | several of 11 | **0 of 11** |
| 404's resolved `data-theme` in a dark session | `null` | **`dark`** |
| 404's resolved `data-theme` in a light session | `null` | **`light`** |

The cursor assertion is `expect(cursors.count).toBe(0)` rather than a threshold, so the rule
cannot decay quietly.

### Accessible names

After correcting the detector (§7), the app is in good shape here: the `sr-only`-on-collapse
discipline is real and the nav is fully named at every width. Remaining unnamed interactive
elements cluster on the composer (10 at the widest) and the onboarding door — logged.

---

## 7. Retractions, with the measurement that justifies them

Four things this lane said and then took back. Each was caught by a measurement, not by taste.

**1. "204 unnamed inputs."** My own naming detector knew only `label[for]`. `pick-chips.tsx`
renders `<label><input class="sr-only">Consumer</label>`, which is correctly named. The detector
was reporting a defect it had manufactured — the exact artefact class the self-test exists to
prevent, arriving from the other direction. Fixed, and the self-test now pins **two** unnamed
elements against three correctly-named ones (wrapping label, `for` label, placeholder).

**2. "The phone FAB is a dead end."** It is not. `/posts/new` renders *"Create a workspace to
start writing"* with a working `CreateWorkspaceButton` (`posts/[id]/page.tsx:71`). The hierarchy
half of that finding stands and was fixed; the dead-end half was checked and rejected.

**3. "The dark Choose File button is legible, it just lacks chrome."** That was *my* correction of
a reader's finding, and I was wrong. In dark, `--surface` and `--surface-2` were both `#17171a`,
so `file:bg-s2` on a `bg-bg` field painted the field's exact colour — a 1.00:1 fill, not a subtle
one. The reader's mechanism was right and my reading of the frame described only the symptom.
Retracted; the pill now carries a hairline.

**4. "The 404 supports dark."** A probe said so and the probe was invalid: it ran signed-out, and
`/this-route-does-not-exist` is a protected path, so Clerk redirected it to `/sign-in` and the
probe measured the sign-in page. Re-run under the real conditions it reported `data-theme=null`
and a white body. Retracted.

**5. THE BIGGEST ONE, AND IT IS THE HARNESS'S: an unknown number of 1440 frames photographed a
hover state no person was in.**

Playwright's virtual pointer stays where the last click left it. Every journey in this lane
begins by clicking "Create workspace" on `/home`, and at 1440 that button occupies
**x 754–918, y 389–423** — so the pointer parks at **(836, 406)** and stays there for the rest of
the run. `/posts` then draws its "Create post" button at **x 777–895, y 404–438**, which
*contains* that point.

MEASURED, in one run, on one build:

```
pointer parked where the bootstrap click left it   :hover=true    orange 0     black 3574
pointer moved to (2, 2)                            :hover=false   orange 3579  black 135
```

So the j3 sweep (04:30), the motion pass (07:35) and the verify pass (11:20) — hours apart,
three separate captures — all photographed the product's primary action as a **solid black
button**, which is `hover:bg-ink hover:text-white` behaving exactly as designed. I read one of
those frames, believed it, and was three experiments away from reporting "the primary action is
black on /posts and orange on /home" as a product defect. `getComputedStyle` said orange every
time and I treated the disagreement as a detector bug in the census, which was the wrong way
round.

**A frame is the authority on what a screen looks like — and a frame taken with a stale pointer
is authoritative about a state nobody was in.** `shot()` now parks the pointer at (-40, -40)
before every shutter, proved by a probe that asserts `:hover === false` and 3579 orange pixels.

**How many frames were affected: I cannot say, and I will not guess.** The clean re-capture in
`.ux2/` differs from `.ux/` in all 175 compared frames, but that diff is confounded — the app
itself changed between the two runs by twenty-three fixes. Isolating the artefact would need a
third capture of the *unfixed* build with the *fixed* harness, which is not worth seven minutes
of a shared machine. What can be said precisely is the population at risk: **any control at 1440
whose box contains (836, 406) and whose `hover:` variant changes its fill.** `.ux2/` is the clean
set; read any 1440 finding that turns on the colour of a control near that point against it.

One more worth recording because it is a category, not an instance: **a reader detected that its
own evidence was stale.** The `j2-returning|analytics` frames document a screen commit `60f0246`
had already replaced mid-run. It said so rather than reporting on it, and proposed stamping the
commit SHA into the manifest. That is a good idea and is **logged**.

---

## 8. The motion system

**What animates.** One keyframe, `sl-enter` (fade + 6px rise). Durations 140 / 180 / 280ms on one
curve. `Stagger`/`StaggerItem` set `--i` so no call site hand-writes a delay, capped at 8 items so
a 40-row table does not finish arriving 1.6s late.

**Reduced motion — MEASURED, and it holds.**

```
normal   duration 0.40s   delay 0.32s   transition-delay 0.30s
reduced  duration 1e-05s  delay 0s      transition-delay 0s
```

The failure a peer found — `animation-duration` zeroed but `animation-delay` left alive, so the
person who asked for *less* motion got a slower, jumpier screen — is fixed and stays fixed. This
is measured through a probe element carrying `animation-fill-mode: both`, which is the shape that
made the original defect visible.

**What is left still, and rightly.** Numbers. `CountUp` takes a `number`, never a nullable, reads
`prefers-reduced-motion` in JavaScript (a `requestAnimationFrame` counter is not a CSS animation
and the media query in `tokens.css` cannot reach it), and is barred from the authoritative
balance. A credit balance that counts up is a balance you cannot read.

**Skeletons.** Under 1.6 Mbit + 4× CPU throttle, six of seven routes had settled content and
**zero** pulsing elements by 400ms — the skeletons never needed to appear. `/home` showed 9. The
shapes exist, mirror the real furniture, carry no text and are `aria-hidden`. The honest reading
is that the app is now fast enough that its skeletons are mostly unseen, which is the right
outcome and not a reason to remove them.

**Time to `load` is a different number.** 7552ms for `/home` and ~4800ms for the rest at 1440
under throttle. First content is fast; full settle is not. Logged.

> **These figures are scoped to `196c0fd` — the tree as I found it — and NOT to the tree this
> lane leaves behind.** They were taken at 07:35 against the 04:14 build. One fix since then adds
> server work to every `(app)` render: `AppLayout` is now `async` and awaits
> `activeWorkspaceRead()` to decide whether the phone's FAB should exist. That read is
> React-cached, but `Topbar` calls the UNCACHED `readWorkspaces`, so the cache has no other
> consumer to share with and this is one extra workspace query per render rather than a free
> hit. It is a small, indexed, RLS-scoped select and I would be surprised if it moved these
> numbers — but I did not re-measure, so the honest statement is that I do not know. Re-running
> `ux-motion.spec.ts`'s first test against the current build settles it in about a minute, and
> that is the first thing to do before quoting any of these figures as current.

---

## 9. Which screens I OPENED, and which I only MEASURED

This distinction is the point of the lane, so it is stated exactly.

**OPENED — a human or an agent called `Read` on the PNG and described what was in it.**
**All 138 distinct screens**, and 523 of the 527 frames:

- I opened 14 myself, in full. Every finding in §6 that I fixed, I confirmed in a frame first —
  and one of them I confirmed, doubted, and had to un-doubt (§7.3).
- 46 reading agents opened the rest in batches of three screens × six configurations, each
  instructed never to infer a frame's content from its filename or its size. Reported frames
  opened: 108 (6 batches) + 340 (20 batches) + 75 (20 batches) = **523**.
- Between them they produced **431 findings**: 25 critical, 122 high, 187 medium, 97 low. This
  report acts on the criticals and the highs; the full set is in `.ux/all-findings.json`.

**MEASURED ONLY — no pixels, numbers only.** The 240-row `audit.jsonl` pass, which exists
precisely because measurement is cheap and looking is not. Nothing in this report rests on it
alone: every prose finding cites a frame.

**And one thing measurement got RIGHT while looking got it wrong**, which is the reverse of this
lane's premise and worth stating: `getComputedStyle` said the `/posts` primary was
`rgb(255,102,0)` while three separate captures photographed it solid black. The frames were the
ones lying, for the reason in §7.5.

**MEASURED ONLY — no pixels, numbers only.** The 240-row `audit.jsonl` pass, which exists
precisely because measurement is cheap and looking is not. Nothing in this report rests on it
alone: every prose finding cites a frame.

---

## 10. The three worst screens, and the three best

### Worst · `/posts/new` (the composer)

The screen a shop owner came for. It has **no page title**, no back link, and the widest element
on it says *"No changes yet"* and carries no control. Its writing column held **three** grey
not-built notices, the largest of which was a 62-word list of absent features written in our
implementation's words ("each needs a new kind of AI task"). Twenty arrow cursors. Ten unnamed
interactive elements. On a phone the *reason a post cannot go out* — "Instagram isn't connected
yet" — sits **2,745px** below the chip that caused it.

*Partly fixed*: the 62-word block is now two lines and says only what is true for the reader; the
cursors are gone. The title, the back link and the empty commit bar are **logged**.

### Worst · the onboarding reveal

The one screen whose entire job is letting an owner judge whether to approve. The widest, most
saturated thing on it is a solid brand bar reading **FIELDS FILLED 100%**, and 60px below it the
Signal Lock card says **"Weak signal — inputs conflict"**. The next screen then reports *0 of 15
fields confirmed*. Underneath, the sentences you are being asked to approve are cut off mid-word
in fixed one-line inputs — *"Struggling to find genuinely fresh, honestly-sourced coffee in
everyc"* — with no ellipsis, while two fields on the same card use auto-growing textareas and show
their full value.

*Partly fixed*: the badge is ink-on-orange now. The 100% bar and the one-line inputs are
**logged** — both want a product decision about what the reveal is claiming.

### Worst · `/analytics` empty

Five apologies where one answer belongs. **Fixed.**

### Best · the door's read-back panel

The moment a usable answer exists, a bordered panel appears stating what Sahoda will hold, what it
found, and what it cost — including *"The free reader found no text, so we used OCR… charged to
us, not to your credits."* Paid work stated the moment it happens, unprompted. This is the
product's argument, working.

### Best · `/create`

Answers the one question a new user has — *what can I make here?* — honestly, in one screen, with
the eight unbuilt things drawn as unbuilt rather than hidden. It was named the best screen in its
batch by an independent reader and it deserves it.

### Best · `/approvals` empty

*"Nothing is waiting on you."* A claim, not a shrug — and the body finishes the job by saying that
is a real answer rather than a screen that failed to load. This is the absence vocabulary doing
exactly what §4 designed it to do.

---

## 11. Every defect, and where it stands

**Fixed in this lane** (17 commits, all pushed):

| # | what | where | severity |
|---|---|---|---|
| 1 | every button in the app wore an arrow cursor | `globals.css` base layer | high |
| 2 | disabled primary at 1.37:1 light / pressable-looking dark | `button.tsx` | critical |
| 3 | `--surface-2` identical to `--surface` in dark; 117/120 frames | `tokens.css` §2.1 | critical |
| 4 | white on brand fill at 2.94:1, three call sites | `badge.tsx`, `button.tsx`, inbox | critical |
| 5 | Home reported every credit SPEND as `+n` with a tick | `activity-feed.tsx` | critical |
| 6 | the 404 was light-only in a dark session | `theme-attribute-guard.tsx` | critical |
| 7 | `/analytics` said "nothing yet" five times in 1250px | `analytics/page.tsx` | high |
| 8 | channel names truncated at 1440 on `/connections` | `channel-tile.tsx` | high |
| 9 | 18 unlabelled icons with no hover name, 700–1179 | `nav-item.tsx` | high |
| 10 | the rail hid the row for the page you were on | `rail.tsx` + reveal | high |
| 11 | two brand fills on `/home`, the paid one dressed as the free one | `sahoda-rail.tsx` | high |
| 12 | the phone FAB was a second brand fill over a workspace-less home | `bottom-nav.tsx` | high |
| 13 | onboarding step rail: a 1032px wash behind two words at 1440 | `step-rail.tsx` | high |
| 14 | onboarding step rail: step 4 scrolled off-screen at 390 | `step-rail.tsx` | high |
| 15 | the door offered no way to answer "that is not us" | `door-step.tsx` | high |
| 16 | two primaries after a successful door read | `door-step.tsx` | medium |
| 17 | the file pill was the field's own colour in dark | `door-step.tsx` | high |
| 18 | ⌘K key cap invisible in both themes | `command-palette.tsx` | medium |
| 19 | two composer notes drawn in `bg-s1` (= canvas) | `not-built-yet`, `relink-control` | medium |
| 20 | five "Off" switches disclosed only in the last sentence | `playbooks/page.tsx` | medium |
| 21 | `/playbooks` refusal named no remedy | `playbooks/page.tsx` | medium |
| 22 | "One click up there" pointed 400px the wrong way at 390 | `planner/page.tsx` | medium |
| 23 | 62 words of implementation jargon in the composer's writing column | `writing-pane.tsx` | medium |

**None of these 23 rests on a contaminated frame,** which is the obvious question after §7.5
and deserves an answer rather than an implication. Fixes 1–6 and 18–19 are arithmetic or
detector-derived (contrast ratios computed from the shipped token file, cursor and fill censuses
read from the live DOM). Fixes 8, 13, 14 and 17 turn on geometry — a box that is too narrow, a
wash that spans its container, a step scrolled past the edge. Fixes 7, 11, 12, 15, 16 and 20–23
turn on text, on count, or on where a control leads. **Not one of them turns on the fill of a
control near (836, 406) at 1440**, which is the only thing the stale pointer could change.

**Guards added, so none of these can come back quietly:** `ux-detector-selftest` (11),
`button.disabled-contrast` (5), `dark-surface-ladder` (5), `ink-on-brand` (2, scanning 927 files),
`activity-feed.ledger-sign` (3), and `no-truncated-labels` extended with a rule for a short
app-authored label that ellipsises — calibrated at both ends, because the old exemption was right
about a customer's sign-in address and wrong about the word "Instagram".

**Logged, not fixed** — each needs a decision or a contract change, not a paint job:

1. **A "Scheduled" badge on a post nothing will publish.** Which rung a `posts.status` earns is a
   promise, not a style.
2. **The reveal's "FIELDS FILLED 100%" bar** above "inputs conflict". Delete it or restate it as
   "15 of 15 drafted · 0 confirmed by you" — an owner call about what the reveal claims.
3. **Sentence-length values in one-line inputs on the reveal.** Wants the auto-growing textarea
   two fields on the same card already use.
4. **The composer has no title, no back link, and an empty commit bar** reading "No changes yet".
5. **The out-of-credits state never names the block** and offers no route to top up.
6. **The stale-save bar says "Post saved"** and names neither version nor channel.
7. **`prefers-color-scheme` fallback in `tokens.css`**, so dark survives any failure of the inline
   script. Forty duplicated declarations; needs a generator and a sync test.
8. **The onboarding sector lexicon** files a coffee roaster as "General consumer".
9. **`/settings/plan`'s tax select clips at "…in India without"**, losing the two words ("a
   GSTIN") that decide the tax.
10. **`/create` has no nav entry and no active state** at wide widths.
11. **`/loop` offers Pause and Stop for a Loop that has never run** and never offers the remedy it
    names twice.
12. **`/remix` has a live input that accepts nothing**, admitted only in the page's last line.
13. **`/ads/performance`'s empty message is sliced mid-word at 390** by the table's scroll box.
14. **`/radar`'s cost sentence wraps into three columns at 390** and reads out of order.
15. **The AI-disclosure checkbox renders as a solid white block in dark** — it reads as CHECKED
    when it is not. Reported by pixel sampling; needs verifying against the primitive before a
    fix, and it is the one item on this list I would raise first.
16. **Time to `load` is 4.8–7.6s under throttle**, even though first content is at 150ms.
17. **The Home hero's sentence points at a button 1600px away** ("plan a week and it starts
    filling in" beside a "Create post" button).
18. **The orb is absent at 390.**
19. **Stamp the build SHA into the frame manifest**, so a stale capture is visible rather than
    believed. A reader caught exactly this in its own evidence.

---

## 11a. The gate, and what running it changed

`pnpm gate` had not been run when the first draft of this report was written, and running it
found two things a partial check could not.

**Stage 3 cannot be trusted against `pnpm dev` on this machine.** The gate's own smoke leg failed
with **32 × `ERR_CONNECTION_REFUSED`** and **24 × "Could not find the module"** — one dead
Turbopack server, not fifty-six failures. Re-run against `next start`, the same suite reported:

```
86 passed · 1 flaky · 2 failed        (14.4m)
```

- **flaky:** `resolution-console.spec.ts:286` (the dark checkbox) failed once at 1.35:1 and passed
  on retry. Its selected pair measures correctly in isolation — `rgb(255,255,255)` on
  `rgb(11,11,12)` — so this is a race on `.check()`, not a regression. **Not mine, not fixed.**
- **failed:** `motion.spec.ts:122`, the scrim test. Assigned to lane 1 by this lane's brief.
  **Not chased.**
- **failed:** `analytics-history.spec.ts:55` — **mine, and the most useful thing the gate did.**

That last one deserves its own paragraph, because the tempting repair was the wrong one.

The spec drafts one post, seeds three days of history, and asserts the performance-over-time card
moves through its three states — beginning with *"Sahoda has started keeping a history"*, which is
a different sentence from *"Sahoda does not keep a history yet"* and is precisely the distinction
that file was rewritten on 2026-08-19 to protect. My first `/analytics` gate collapsed that
workspace, so the card never rendered.

I first changed the SPEC to reach the card, and then reverted it. **A guard should not be loosened
to accommodate the change that broke it.** The state I actually measured as broken was a workspace
with *nothing* — no connection, nothing published, **no posts** — which is what every beta account
is in for its first hour and where the five stacked apologies were counted. A workspace that has
drafted something is a step further along and keeps the full page. The gate now carries all three
conditions, the spec is untouched, and it passes.

**And the ratchet I added to a `@smoke` spec does pass.** `no-truncated-labels.spec.ts` gained a
rule that fails on any short app-authored label that actually ellipsises, and I had fixed exactly
one instance of it. Against `next start` all ten routes are green, including `/connections` and
`/inbox`. Against `pnpm dev` every test in that file times out at
`waitForLoadState('networkidle')` — line 177, before the detector runs at all — which is a
property of the file and the dev server, not of the rule.

**Where the gate stands:** stages 1 and 2 green. Stage 3 green under `next start` except lane 1's
scrim test. Stages 4 and 5 did not run in that invocation because the gate stops at the first
failure; `prettier --check` and `turbo build` have been run separately and are green.

---

## 12. The honest verdict

**Would a shop owner enjoy using this? Not yet — but they would trust it, and that is the harder
half.**

What this product does better than almost anything I have audited is refuse to lie. "We asked and
got nothing" is a different sentence from "we never asked", and there is a module keeping eight of
them apart. Paid work states its price before it happens and its cost after. A channel that cannot
publish says so on the chip, in the composer, and again at the commit bar. The absence vocabulary
is real, it survives greyscale, and it is used.

What it does not yet do is **decide what matters on each screen**. The recurring shape of this
report is not a bug, it is a hierarchy: the largest, loudest object carries the least information.
A 1032px orange band holding two words. A solid 100% bar above "inputs conflict". A giant zero.
Five cards each explaining an absence the page could state once. Three grey apologies in the
column where the writing goes. Every one of those is an individually defensible decision that
nobody weighed against its neighbours.

The second shape is **dark treated as a copy rather than a peer**, exactly as docs/26 §2 warned —
and the proof is that its most-used surface token had no rung at all and 117 of 120 frames paid for
it without a single test going red.

The good news is that both shapes are cheap to fix and most of them now are. What is left on the
logged list is mostly product decisions — what a badge promises, what a meter counts, whether a
post can say "Scheduled" when nothing will fire — and those are the founder's to make, not a
lane's.

A shop owner checking this between customers today would find it honest, dense, quick, and
occasionally shouty about the wrong thing. That is a much better place to be than the reverse.
