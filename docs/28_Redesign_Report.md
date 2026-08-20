# 28 · The eleven unowned routes — redesign report

**Date:** 2026-08-20 · **Branch:** `wt-redesign`, cut from `wt-design` @ `1447f72`
**Scope:** the eleven routes docs/27 never assigned to a lane, plus the two items it flagged
and nobody owned.

**Every claim below is MEASURED unless it is marked INFERRED.**

---

## 0. Read this first — what was and was not verified visually

The camera in `e2e/design-audit.spec.ts` produced **72 "before" frames** (18 routes × 2 widths
× 2 themes) and they are the evidence for every "before" claim here.

**There are no "after" frames.** The re-shoot was attempted and every one of its 28 captures
failed on a 45s navigation timeout: the box is shared, three other sessions were running dev
servers (`verify-camp-composer`, `wt-pay2`, `wt-assets`), and load average reached **41.6**
with 780MB free. The spec asserts nothing by design, so it reported `1 passed` while writing
zero PNGs — worth knowing before anyone reads that line as success.

So: every "before" claim is measured from a frame. Every "after" claim is measured from
**code, the compiled CSS, and the test suite**, and is marked as such. Nothing here claims a
screen was looked at when it was not.

One "before" frame is contaminated and it is called out where it matters:
`design-audit-before/light-1440/home.png` is a true before, while
`design-audit-before/light-390/home.png` caught the /home restructure **mid-run** — the camera
points at a live dev server and I was editing underneath it. That is why
`DESIGN_AUDIT_ROUTES` now exists (§7).

**Depth is not uniform.** `/home`, `/posts`, `/analytics` and `/inbox` were restructured.
`/planner`, `/wallet` and `/settings` received targeted structural fixes, not ground-up
redesigns. Both are defensible; presenting them as the same thing would not be.

---

## 1. Per route

### `/home` — one thing leads

**Before** (`light-1440/home.png`): `100` renders **three times** on one screen — the topbar
chip, the rail's `Available credits`, and the rail foot. The largest type on the page was its
third copy. The `Credits spent` card said it was empty **twice**, ~110px apart. `Needs your
attention` sat fourth in the left column, below two charts and a spend card.

**Structure changed:**
- The **attention queue leads**. The four questions (what happened · what is happening · what
  needs me · what next) are the order they get *answered* in, not the order of importance.
  Someone checking this between customers is answering "what needs me".
- `Available credits` demoted from `type-display` + brand shadow to a `type-h2` stat. It lost
  because it was already on screen twice more, not because it matters less.
- New `SpendCard` decides emptiness **once**, because the card is the thing that is empty — a
  chart cannot know whether its sibling is also empty.
- **Four Brand Brain tiles deleted.** `rail-cards.tsx` rendered six of which four were
  hardcoded `null`: Primary colour, Audience, Competitors, Knowledge. The file's own comment
  correctly noted there is no competitors table, no document library and no age-range field —
  and then rendered a permanent em dash for each. That is docs/26 §4 state three, which
  renders *nothing*. Same defect as P2a, second file.

### `/posts` — the row stops advertising Delete

**Before** (`light-1440/posts.png`): eight cards, ~197px each, ~1,830px total. Every one spent
a full-width rule plus ~55px of footer on one right-aligned **Delete** — the only action with
dedicated space anywhere on the screen. No sort, no filter, no grouping.

Also measured: docs/27's "three statuses render the identical chip" is **already fixed** on
this branch. Six distinct glyphs render (✓, ✓✓, pencil, ⚠, person, calendar).

**Structure changed:**
- **The card is no longer one big `<Link>`.** `ChannelChip` renders a real `<a>` to the
  platform permalink *inside* that wrapper. The click was handled (`stopPropagation`) but an
  `<a>` inside an `<a>` is invalid HTML and the parser reparents the inner one — on a
  server-rendered document. It also meant every control had to live outside the anchor, which
  is *why* Delete ended up in a footer: there was no other slot. The title is now the link,
  stretched with `after:inset-0`; controls are siblings at `z-10`.
- **Delete is icon-only in the header**, keeping `aria-label="Delete {title}"`. It was not
  removed: `/posts/[id]` has no delete, so removing it would have been a dead end.
- **A filter**, built on the existing `STATUS_RUNG` ladder rather than a second grouping.
  Links, not buttons (docs/26 §10.2). `partial` sits under *Needs you*, not *Published* —
  calling it published would state an outcome for the channels that never went out.
- Density: `text-[17px] font-bold` → `type-h3`; excerpt 14px → `type-body`.

### `/analytics` — an absence stops wearing a certainty rung

**Before** (`light-1440/analytics.png`, `dark-1440/analytics.png`): five empty treatments in
five visual languages, and the hierarchy inverted.

**The finding docs/27 did not have:** `performance-over-time.tsx` rendered its empty box as
`className="is-proposed …"`. A dashed edge is not decoration here — docs/26 §3 makes it one of
four **certainty rungs**, meaning "Sahoda suggests it. Nobody agreed." Applied to "nothing has
been measured yet" it dresses an absence as a proposal. In **dark** it is worse: §3.1 measures
that rung as separated from its neighbour by 3/1000 of luminance, so the dashed edge is doing
100% of the work and reads unmistakably as the rung.

**Structure changed:**
- Five treatments → one (`CardEmpty`). Every claim kept verbatim; only the treatment moved.
- **The inversion fixed by adding information, not removing paint.** The bottom `EmptyState`
  had no `action` at all — the loudest object on the page was the one you could not act on. It
  keeps its size and now carries the remedy. Loudest and most useful are the same object
  again, which is the only arrangement in which loud is correct.
- **Marketing score deleted** — the third phantom slot. Its comment said "there is no score in
  this product — no inputs, no formula, nothing that could compute one" and then rendered a
  dash, telling every reader their score was *pending*.
- The four metric slots rendered a bare `—` (I first misread this from the screenshot as the
  `.is-unmeasured` rule; it is an em dash at 19px). They now carry the mark, which has an
  accessible name. `text-[19px] leading-7 font-[650]` → `type-h2`: 19px is not on the scale.

### `/planner` — a verb that was never true

**Before** (`light-1440/planner.png`): seven of eight rows read "Not scheduled" two columns to
the left and offered **"Reschedule"** on the right. Row 1 rendered the word "Approved"
**twice** — status chip, and a disabled `<Button>` beside it.

**Changed:** the verb now reads "Schedule" when nothing is scheduled. The disabled button is
gone entirely — `approve-button.test.tsx` asserted a *disabled button* under a test named
"shows state, not a live control", and a disabled button **is** a control (docs/26 §10.2). The
test now asserts what its title always said.

### `/wallet` — the breakpoint that does not exist

**Before** (`light-1440/wallet.png`): `Start checkout` as a ~1,000px solid orange bar, with
the selected tile's ring and radio competing above it.

**Root cause, and it is systemic.** `globals.css:45` does `--breakpoint-*: initial`, wiping
every stock breakpoint, and defines only `narrow` (700px) and `wide` (1180px). The button
carried `w-full sm:w-auto`. **`sm:` does not exist**, so `w-full` won at every width.

MEASURED in the compiled CSS: `sm:w-auto` → **0 occurrences**; `max-narrow:` → **48**.

Someone had already written the fix. It simply never existed. Also: the hero used
`text-[44px] leading-[52px] font-extrabold`, a hand-written shorthand for the exact case
`type-hero-num` exists to serve ("the ONE big number per view", §5).

### `/settings` — a rule for measure

**Before** (`light-1440/settings.png`): a two-row form across the full ~1,150px pane, each
label about **900px** from the control it names. Every gap was on the 4pt scale and nothing
was mis-spaced — the row had simply stopped reading as a row. That is what made the screen
read as unfinished rather than merely short, and docs/26 had no vocabulary for it. Added as
**§6.1 — measure**, with `--measure-form` (720px) and `--measure-prose` (620px). The page still
fills the viewport; the readable content is capped.

Also corrected: the page's comment claimed "READ-ONLY on purpose… the rows offer no control",
which stopped being true when `WorkspaceNameField` landed with a real input and a Save.

**Not chased:** the workspace-name input visually truncating a long value is an input
scrolling its content, which is what inputs do.

### `/inbox` and its four sub-routes — nothing, in three languages

**Before** (`light-1440/inbox.png`): three empty states on one screen in three visual
languages — plain prose in the list pane, a hand-built `EmptyState` in the thread pane, plain
prose in the context pane. The same failure docs/27 found on `/analytics`, on a route it
explicitly never sampled.

**Structure changed:** all five routes use `CardEmpty`; every claim kept verbatim
(`lib/inbox/emptiness.ts` exists to keep eight of those sentences apart). The thread pane
stays loud — it is the one pane carrying the reason and the remedy — and now uses the
`EmptyState` primitive instead of reproducing its markup. **"Nothing selected" is no longer
dressed as an empty state**: it wore the same 44px brand-washed marker tile while carrying no
remedy and needing none, because the list is right there.

The three-pane shell was **kept**. Its own comment argues that blanking the screen would
remove the layout and a new user would never learn what the inbox is. That is right.

---

## 2. The motion system

One keyframe for the product: `sl-enter` — opacity 0→1 with a 6px rise (`--enter-lift`).

| what | duration | easing | why |
|---|---|---|---|
| entrance (`.enter`, `.enter-step`) | `--dur-base` 180ms | `--ease` | one curve, so motion reads as one hand |
| stagger step between items | `--stagger` 40ms | — | capped at `--stagger-cap` 8 **in CSS** via `min()` |
| count-up | `--dur-count` 560ms | easeOutCubic (JS) | §8 caps transitions at 280ms; a count is a *reveal*, not a transition, and a 4-digit count at 280ms is a flicker |
| everything pre-existing | `--dur-fast` / `--dur-base` / `--dur-slow` | `--ease` | unchanged |

**Deliberately left still**, and these are the interesting ones:

- **The authoritative credit balance.** Wallet hero, credit chip, rail foot. It moves under
  you as actions spend, and mid-count it displays a figure that is not your balance.
  Enforced, not merely intended: `count-up.guard.test.ts` fails if any of those three files
  imports `CountUp`. **Proved by mutation** — adding the import turned it red.
- **The crash path.** Unchanged from §8: an error must arrive, not ease in.
- **Layout on first paint.**

**The count-up ruling** is docs/26 **§8.1**, written because §8 forbade animating a number and
the brief asked for count-ups. Ruled in the doc rather than bent at eleven call sites. A
*settled historical* figure may count on arrival; an authoritative live one may not. Its two
call sites are `PerformanceStrip` (account readings for a closed period) and `SpendCard`
(a closed 30-day window).

---

## 3. Empty, loading and error states — one language

Three levels, so nobody invents a fourth:

| level | treatment | when |
|---|---|---|
| page | `EmptyState` — marker tile, heading, body, **one action** | the route has nothing at all |
| card | `CardEmpty` (new, docs/26 §4.1) — one sentence, optional `lead`, optional action | one section has nothing |
| slot | `Unmeasured` / `Unreadable` marks | one *number* is not there |

`CardEmpty` exists because rendering `EmptyState` inside a card inverts the page's hierarchy —
its 44px saturated tile becomes the loudest thing on a screen while carrying the least
information, which is precisely how `/analytics` got its worst finding.

**`CardEmpty.body` is `ReactNode`, not `string`, and that was caught before it shipped.**
`performance-over-time` passes an interpolated sentence, which React hands over as an *array*
of children; `String()` joins those with commas. It would have rendered *"One day, measured so
far. A trend needs at least ,3, because…"* and every type, lint and unit check would have
passed. Same class as the rail that rendered `"S Sah"`.

**Loading:** `/home`, `/posts` and `/analytics` skeletons were rewritten to match the **new**
shape. A skeleton mirroring the old order puts a placeholder where nothing is coming and lets
the real content arrive somewhere the eye was not — which is the reflow a skeleton exists to
prevent. `/posts` gained the filter row for the same reason: without it the list stepped ~40px
down the page when data landed.

**Error:** unchanged. The claim-precision rules (`"we never asked"` vs `"we asked and got
nothing back"`) are load-bearing and none of the sentences changed.

---

## 4. No invented number reached any screen

- **Three phantom slots deleted**, not filled: `100 of —` (rail foot), four Brand Brain tiles,
  Marketing score. All three had the same shape — a real numerator or label beside a dash
  standing in for a quantity that *does not exist in this product*. A dash marks a slot that
  is real and not yet filled, so each was telling the reader something was pending.
- **`no-phantom-denominator.test.ts`** fails on any file that renders `of —`. Proved: it names
  `components/shell/rail-foot.tsx` when the string is reintroduced.
- **`CountUp` takes `number`, not `number | null`.** There is no way to mount it without a
  figure the server returned. It interpolates *toward* a real value and its final frame
  assigns that value itself, not a rounded interpolation.
- Every count on `/posts`' filter row is computed over the loaded page; the page's existing
  cap note is what keeps that honest, and a bucket that is empty *and* unselected renders no
  `0` — a permanent zero invites the reader to think the filter is broken.

---

## 5. prefers-reduced-motion — verified, and it was broken

`e2e/motion.spec.ts` (new, `@smoke`), run against a real browser: **2 passed.**

- A staggered item's computed `animation-delay` resolves to **distinct real milliseconds**
  across the ladder (not the literal `calc` string, not `0s`-from-invalid), and it is opaque.
- Under `prefers-reduced-motion: reduce`, `animation-delay` **and** `animation-duration` are
  both 0 **and** the queue's heading renders.

This has to be an e2e: jsdom does not run CSS animation, so `.enter-step` stuck at opacity 0
would be a blank dashboard passing typecheck, lint and all 3,202 unit tests.

**The bug it found in the system I was writing:** `tokens.css` zeroed `animation-duration`
under reduced motion but **not `animation-delay`**. With `fill: both`, a staggered row stayed
invisible for its full delay and then snapped in — the person who asked for *less* motion got
a slower, jumpier screen than everyone else. `animation-delay` and `transition-delay` are now
zeroed alongside.

**`CountUp` suppresses itself in JS, not only CSS**, because a `requestAnimationFrame` loop is
not a CSS animation and that rule never reached it. Proved by mutation: removing the check
fails two tests.

---

## 6. Mobile at 390

**Before** frames exist at 390 for all 18 sampled routes. **After** frames do not (§0).

Touch targets use the token, never a literal: `max-narrow:min-h-[44px]` per docs/26 §9. Every
control this lane added carries it — the `/posts` filter links, the compact delete trigger.

**What actually verifies this** is the `@smoke` suite, which includes
`no-truncated-labels.spec.ts` (runs at 390) and `shell-widths.spec.ts` (six widths, both
themes, asserted by TEXT). Gate leg 3 is that suite — see §8. Note docs/27 §2.1's standing
warning that the 390 topbar guard measures the *workspace-less* state; that limitation is
pre-existing and this lane did not change it.

**INFERRED, not measured:** that the `/home` and `/posts` restructures improve the 390px
experience. The one piece of evidence is `design-audit-before/light-390/home.png`, which
caught the restructure mid-run and shows the attention queue second on the page rather than a
credit hero — but it is an accidental capture, not a designed measurement.

---

## 7. P2a and P2b

### P2a — `100 of —`, owned

Three lanes reported it; none owned it. **It was three dashes in one file, not one.**

1. `of &mdash;` — the phantom denominator. Deleted (docs/26 §4 state three).
2. `creditsText()` returning `'—'` on an unreadable balance.
3. `roleLabel` returning `'—'` on an unreadable role.

(2) and (3) are a *different claim* and they stay — as `Unreadable` **marks**, not dashes. A
bare dash also meant "not yet measured", so two different claims rendered identically, and a
dash with no accessible name is a decoration a screen reader skips. The same treatment was
applied to `credit-chip.tsx` and `brain-ring.tsx`, which render on every screen.

**Proved:** `no-phantom-denominator.test.ts` names the offending file on reintroduction.

Three existing tests asserted the **glyph**. They now assert the **claim** ("could not be
read"), which is strictly stronger — the old assertion passed for a mark with no accessible
name; the new one cannot.

### P2b — the lint leg that could not fail

MEASURED before: `lint` was the literal string `exit 0` in **all nine packages** and there is
no eslint config anywhere in the repo.

Four rules now, scoped to `apps/web/src` (745 files). **The other eight packages are still
`exit 0` and this report does not claim otherwise.**

| # | rule | state | proof |
|---|---|---|---|
| 1 | no raw hex (§11) | **0**, enforced strictly | red then green |
| 2 | no hardcoded spacing (§6) | 133, **ratcheted** | red then green |
| 3 | no `<button disabled>` coming-soon (§10.2) | **0**, enforced strictly | red then green |
| 4 | no dead breakpoint variant | 8 → 4, **ratcheted** | red then green |

Each proved by writing the violation and removing it — one temporary file tripped 1–3
together (exit 1, each named with file and line) and exit 0 returned when deleted; rule 4 was
proved separately.

Rule 2 is a **ratchet** rather than a mass fix: 133 violations sit across seven lanes' files,
and rewriting another lane's spacing to satisfy a rule they have not read turns a merge into a
regression. The debt is written down in `design-lint-baseline.json` — per *file* counts, since
line numbers churn — so a file may never gain one and every removal tightens it permanently.

**Two bugs in my own rules, both caught before wiring:**
- Rule 4 flagged `button.tsx`'s CVA size **keys** (`sm: 'h-7 …'`). A variant is glued to its
  class; an object key is followed by a space. A false positive on the most-used primitive in
  the app is how a new rule gets switched off in week one.
- `stripComments` replaced block comments with `''`, deleting their newlines — so **every
  reported line number after the first comment in a file was wrong**, and this codebase has a
  long header comment in nearly every file. A rule that points at innocent code teaches the
  reader it is noise. Fixed for all four rules.

The first hex pass flagged 10 values in `brand-theme.ts`. They were **trailing** comments
annotating each neutral with the token it mirrors — real documentation that
`guard-neutrals.test.ts` enforces. Fixed the stripper rather than allowlisting a legitimate
file: a rule that fires on its own documentation gets answered by deleting the documentation.

`turbo.json` declares the script and its baseline as `globalDependencies`. A root file no
package hashes is how a cached PASS gets served over a changed rule.

---

## 8. Two defects the lint rules cannot see

Rule 4 knows *breakpoint variants*, because their names are declared in `globals.css`. It
cannot know an unknown **utility name**, and that half bit twice.

**I reintroduced it myself.** `post-filters.tsx` shipped `text-primary-fg`; the theme maps
`--color-primary-foreground`. Tailwind does not error on an unknown utility — it emits
nothing, the class stays in the markup spelled plausibly, and the element keeps what it had.
On a brand fill that means the label **inherits**, which is white on orange at **2.94:1** —
the one pair docs/26 §1.2 forbids by name. Caught by grepping the compiled CSS
(`text-primary-fg` → 0, `bg-primary` → 4).

**Sweeping every colour utility the same way found a live one:**

> **Every Modal and Drawer in the product opened over an undimmed page.**

Both asked for `backdrop:bg-black/40`. `globals.css:41` also does `--color-*: initial`, and
only `--color-white` is redefined (line 148) — so `bg-black` was never generated. MEASURED:
the compiled CSS contains exactly **two `::backdrop` rules and both are Tailwind preflight**.
There is no scrim rule at all.

Fixed with a new `--scrim` token, and **dark gets its own value** (0.62 vs 0.40) rather than
the same one: black at 40% over a `#0b0b0c` canvas is close to no scrim, and §2 makes dark a
peer rather than an inversion.

The sweep is now `scripts/design/dead-classes.mjs`. It is a **report, not a gate leg**: it
needs a build to be truthful, and prose inside comments trips the class pattern
("divide-by-zero", "text-only"). A rule with false positives gets switched off.

---

## 9. The gate

GATE_RESULTS_PLACEHOLDER

---

## 10. What the next session should know

- **The camera points at a live dev server.** Anything edited while it runs is photographed
  mid-change and filed as evidence of a design that never existed. `DESIGN_AUDIT_ROUTES`
  exists so a per-route before/after costs 4 frames instead of 72; use it, and do not edit
  during a run.
- **`--breakpoint-*: initial` and `--color-*: initial`** mean most Tailwind names you know are
  not here. Two shipped defects came from this in one day. Run `dead-classes.mjs` after a
  build before believing a class works.
- **The shared box is a real constraint.** One kernel OOM kill (victim: this lane's
  `next-server`), a full unit suite showing 4 failures under load that all passed standalone,
  and 28 screenshot navigations timing out at load 41.6. Check `journalctl -k` before
  debugging anything that looks impossible.
- **`pnpm gate | tail` returns tail's exit code.** Never pipe it. This report's §9 was
  produced by a script that echoes each leg's own `$?`.
