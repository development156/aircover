# 37 · Sahoda Labs Design System v5

**Status: canon.** Supersedes `docs/26_Design_System_v4.md`, which supersedes
`docs/08_Design_System_SAHODA_LABS.md` and `docs/ui-package/sahoda-labs/`. If any
of those disagree with this file, this file wins.

> **Numbering clash, RESOLVED at integration on 2026-08-23.** The `wt-ops` lane
> also held a `docs/37`, and because the filenames differ git merged both without
> a conflict — two documents numbered 37, which breaks the canon order in
> `docs/00_README`. This file kept 37 and `37_Tenant_Isolation.md` became
> `docs/39_Tenant_Isolation.md`: it had ZERO inbound references against this
> file's twenty-one across twelve files, so renumbering it moved one heading
> instead of rewriting a dozen call sites. 38 was already taken by
> `38_Data_Handling.md` from the wt-dpdp lane.

- **Values:** `packages/shared/tokens.css` — the source of truth.
- **Solver:** `scripts/design/solve-v5.mjs` — every ratio quoted here is printed by it.
- **Live reference:** `/design-system` — every primitive, every state, both themes,
  with a greyscale toggle.
- **Target:** `docs/design-inspiration/runey/` — screenshots of runey.app.
- **Before:** `docs/design-inspiration/current/` — 240 frames of the product as v4 shipped it.
- **After:** `docs/design-inspiration/v5/` — the shell at six widths, both themes.

Every number below is **MEASURED** (sampled off a real pixel or a real DOM) or
**SOLVED** (printed by the solver). Where something is inferred, it says so.

---

## 0 · What this system is for

The reader is a shop owner in Bhubaneswar on a mid-range Android who has never
used a marketing tool. Every rule here serves that person, and several rules that
would be defensible for a different reader are refused for that reason.

The founder's standard is **enjoyable**, and enjoyable decomposes into four
things that build **in this order**:

1. **Confidence** — one thing leads on each screen, and it is the right thing.
2. **Momentum** — no dead ends. Every state offers the next move.
3. **Responsiveness** — everything answers immediately, including "no".
4. **Delight** — small, earned moments.

**Delight applied to bad hierarchy makes a screen worse**, because it adds a
second thing competing for the attention the first thing had not yet won. Do not
reach for step 4 until steps 1–3 hold on that screen. This ordering is the single
most important rule in this document.

---

## 1 · What was taken from the reference, and what was not

Four mechanisms, all measured off the screenshots with Pillow.

| # | Mechanism | Measured |
|---|---|---|
| 1 | **Surfaces separate by FILL, not by line** | page `#fafafa`, card `#ffffff`, card edge pixel `#fdfdfd` — one step, i.e. anti-aliasing |
| 2 | **Very large radii, as a ladder** | card 24px (corner profile x112→x90 over 22 rows), rail 28px, buttons fully round |
| 3 | **A solid near-black rail against a light content area** | rail `#171717`, 62px wide, inset 10px, floating |
| 4 | **A rationed accent** | see §6 — the ration is not what most people think it is |

**Mechanism 1 reverses v4 deliberately.** v4 set `--canvas == --surface == #ffffff`
and separated cards with a hairline, and wrote a rationale for it ("depth comes
from the ring, not from a fill step"). That rationale served a different target. A
card is now a card because it is *brighter than the page*.

### What did NOT port

The reference codes deltas **green-up / red-down**. v5 does not, and this is not a
preference. Severity and certainty here are carried by **fill weight, glyph and
label** so they survive greyscale, re-theming and colour blindness (§9). Orange
replaces the reference's green; **no red is introduced**. What ports is the
reference's *ration*, not its hue-coding.

---

## 2 · Colour

### 2.1 The palette is five things

`--p` brand orange · achromatic neutrals · the tints (orange at alpha) ·
platform marks · nothing else. Platform marks (Instagram, LinkedIn, …) keep their
own colours because a platform mark is **identity, not UI chrome** — the only
exception, and it never leaks into buttons, text or surfaces.

### 2.2 The measured facts about `#ff6600`

| pair | ratio | verdict |
|---|---|---|
| `#ff6600` on `#ffffff` | **2.94:1** | fails AA, and fails the 3:1 UI-boundary floor |
| `#ffffff` on `#ff6600` | **2.94:1** | so white text on the brand fill is not allowed |
| `#000000` on `#ff6600` | **7.15:1** | **this is `--pfg`** |
| `#f60` on `#ffffff / #fafafa / #f2f2f3` | **2.94 / 2.81 / 2.62:1** | **this is `--acc`**, accent TEXT on light — fails AA, by ruling |
| `#bd4b00` on `#ffffff / #fafafa / #f2f2f3` | **5.04 / 4.82 / 4.50:1** | what `--acc` was until 2026-08-26 — cleared AA on all three |
| `#ff6600` on `#171717` | **6.11:1** | dark is unchanged; `--acc` was already the brand orange there |

**`--acc` is now `#f60` in both themes, and it does not clear AA on light.** That
is a **founder's ruling of 2026-08-26**, taken with the three ratios above in
hand and reaffirmed after they were put in writing. Brand brightness was chosen
over the contrast floor. It is a deliberate trade, not an oversight, and it
should not be quietly reverted by anyone reading only the numbers.

**What it costs.** AA wants 4.5:1 for body text and 3:1 for large text; `#f60`
clears neither on any light ground. So orange alone is no longer an accessible
affordance on light: anywhere the colour is the ONLY signal that something is a
link or an action, pair it with an underline, a weight step or an icon.

**The flat grounds are not the worst case.** Accent text most often sits on a
tint, and a tint darkens the ground. Shipped value first, previous in brackets:

| ground under `text-accent` | `#f60` | (`#bd4b00`) |
|---|---|---|
| `--t50` 6% over `#ffffff` → `#fff6f0` | **2.75:1** | 4.72:1 |
| `--t50` 6% over `#fafafa` → `#faf1eb` | **2.63:1** | 4.52:1 |
| `--t100` 16% over `#ffffff` → `#ffe7d6` | **2.47:1** | 4.23:1 |
| `--t100` 16% over `#f2f2f3` → `#f4dccc` | **2.23:1** | 3.83:1 |

**2.23:1 is the real floor, not the 2.62:1 the flat table shows.** The settings
section nav — the pill that prompted this ruling — is the 2.75:1 row.

**It is not only text.** `--acc` also paints `border-accent` and
`outline-accent` at four admin call sites. Those are non-text UI boundaries;
WCAG 1.4.11 wants 3:1 and they now measure **2.94:1**, having been 5.04:1. That
is the same 0.06 miss `tokens.css` cites as the reason the global focus ring is
an ink core plus an orange halo rather than plain orange, so those four sites now
do what that note forbids and no spec covers the admin routes. **Open, pending a
ruling** — and it must not be closed by darkening `--acc`, which would reverse
the ruling above by the back door.

The history is worth keeping, because it shows how tight the room was. `--acc`
was **re-solved for v5** when the ground moved: v4's `#c95100` measures
**4.32:1** on the `#fafafa` canvas, below AA, and `#bd4b00` was then the
*brightest* orange that cleared all three. There was never an AA-passing orange
brighter than `#bd4b00` — `#f60` is not a better solution to that problem, it is
a decision to stop solving it.

`own-medicine.test.ts` still grades the shipped tokens against `brandSkinVars()`,
the same Readability Guard every *customer* theme passes through. Its `--acc`
assertion was **retargeted, not removed**: it now pins `#ff6600` exactly and
asserts the 2.94:1 shortfall out loud, so the token cannot drift to some third
value unnoticed and the cost cannot rot into a claim that this pair is fine.

### 2.3 THE ACCENT IS A BUDGET, AND THE BUDGET IS PER SCREEN

Saturated pixels as a fraction of the frame — `HSV s>0.30, v>0.25`, every second
pixel, 1440px light. Same method for both products.

| screen | saturated |
|---|---|
| **Reference** /settings | **0.030%** |
| **Reference** /invoices | **0.218%** |
| **Reference** /report | **1.064%** |
| Sahoda /create | 0.052% |
| Sahoda /approvals | 0.116% |
| Sahoda /home | 0.487% |
| Sahoda /analytics | 0.498% |
| Sahoda /settings | 0.505% |
| Sahoda /brain | 0.516% |
| Sahoda /wallet | 0.526% |
| Sahoda /posts | 0.550% |
| Sahoda /connections | 0.605% |
| Sahoda /planner | 2.883% |

> **A CORRECTION, KEPT ON THE RECORD.** An earlier draft of this section claimed
> Sahoda spread over **1.24×** against the reference's 35×, and concluded the accent
> was "distributed uniformly". **That was wrong, and it was wrong because of how the
> sample was picked** — six screens that happen to resemble each other. Across ten
> routes the real spread is **55×** (0.052% → 2.883%), which is *wider* than the
> reference's 35×. The uniformity claim does not survive its own measurement and is
> withdrawn. A conclusion drawn from a convenience sample is the failure this
> document exists to prevent, so it is corrected here rather than quietly deleted.

**What the measurement does support**, and it is narrower but real:

- **The reference spends ~0 on a configuration screen.** Its `/settings` is
  **0.030%**; Sahoda's is **0.505%** — **17× more orange on a screen whose entire job
  is configuration**, where nothing is being reported and nothing is being urged.
- **The reference is not using less accent on average.** On `/report` it uses roughly
  **twice** what Sahoda's typical screen does. Ration is not austerity; it is spending
  the budget where the screen's job is.

> **The two spreads are not like-for-like, and the next lane should not quote them as if they
> were.** Sahoda's 55× is ten routes captured from the running app; the reference's 35× is
> three screenshots, and three captures cannot bound a product's real range. The **per-screen**
> comparisons above (settings against settings, 0.030% against 0.505%) are sound, because they
> compare the same kind of screen. The spread figures are indicative only.

**The rule.** The accent is spent on *the one thing the screen is for*. A screen that
configures something spends approximately zero. A screen whose job is one measured
quantity spends it on that quantity. **A screen with nothing to report and nothing to
urge should be near the floor, and Sahoda's configuration screens are not.**

**One primary action per view.** Exactly one element per screen may carry the solid
brand fill. Everything else is a secondary or a link.

**v5 did not fix this, and P4 could not.** Measured after the shell landed, the same
ten routes moved **+3% to +21%** — the accent went *up*, not down, because the dark
rail's active item and its orange text are more saturated against a near-black ground
than they were against white. The spend that matters is in the pages (a 1032px orange
hero band, five cards each restating one absence), and pages are out of this lane's
scope. **This section is the brief for the lanes that follow it.**

### 2.4 Never

- Never write a raw hex. Anywhere. (`design-lint` rule 1, enforced at zero.)
- Never put white text on `--p`. 2.94:1.
- Never pair `text-accent` on `bg-tint-50/100` in dark without a surface swap.
- Never use hue to carry severity. There is no red in this palette on purpose.

---

## 3 · Type

### 3.1 The family: Plus Jakarta Sans

There is no `brand/fonts/`. The supplied assets are a logo lockup, a mascot,
platform icons and a 49-page brandbook PDF whose text layer is empty (`pdftotext`
yields 49 bytes). So the choice had to be **made and justified**, not inherited.

The wordmark is a PNG lockup, not a type specimen, so it does not oblige the UI
family — but it describes the brand's letterforms, and they are geometric with a
double-story `a` and circular bowls. That rules out Poppins (single-story `a`) and
it rules out Inter, which is a neo-grotesque and reads as the default UI face of
the last five years rather than as this brand.

Three constraints actually bind, and Plus Jakarta Sans clears all three:

1. **Variable axis 200–800.** The scale separates a label from its value with a
   half-step (550, 650) instead of jumping to bold, and neither weight exists as a
   static instance. Pin the weights in `next/font` and they round to 500/600 and
   the hierarchy flattens on every screen. `weight` is deliberately omitted.
2. **Tabular figures.** `.num` sets `tnum`; a marketing OS may not let digits
   shuffle when a value updates. **Outfit was rejected here** — it is the closer
   geometric match and has no reliable tabular set.
3. **Indic fallback.** It carries no Devanagari, exactly as Inter carried none, so
   `'Noto Sans Devanagari'` stays in the stack.

The CSS variable keeps its `--font-inter` name. Renaming it would be a rename with
no reader, in a file whose whole contract is that names stay stable while values move.

### 3.2 The word space is corrected, and that is not optional

MEASURED, space advance as a fraction of font size:

| face | advance | % of size |
|---|---|---|
| Arial 14px | 3.89px | **27.8%** (a normal face) |
| Plus Jakarta Sans 14px | 2.00px | **14.3%** |
| PJS 16px, tracking removed | 3.00px | 18.8% |

At 14.3% the words run together — *"Needs your attention"* read as one word in a 3×
crop of the first shipped frame. **Negative tracking is not the cause**: removing it
entirely only moves 17.3% → 18.8%. The narrow space is the typeface's own metric.

`--ws-word: 0.1em` corrects it, and it is **re-declared on every `@utility type-*`**.
An `em` in `word-spacing` computes to absolute pixels against the element it is
declared on, and what *inherits* is that computed pixel value — not the em. Declared
once on `html` it becomes a flat 1.6px document-wide, which is a different fraction
at every step. The tell was three steps returning byte-identical advances.

`type-space.spec.ts` measures this in a real browser — the only place a font's
metrics exist — and fails below 22% of the size.

### 3.3 The scale, and why it is the size it is

MEASURED across `apps/web/src`: **859 hand-written `text-[Npx]` classes in 19
distinct values** against a scale of eight steps. Reading the *distribution* rather
than the total changes the diagnosis completely:

```
13px 290   12px 211   12.5px 110   11px 90   14px 52   15px 35
10px 17    11.5px 13   20px 9      13.5px 8   … 9 more under 7 each
```

**636 of 859 — 74% — spell a size that already has a step.** That is not a missing
rung; it is a rung nobody reached for, and adding steps cannot fix it. The other
26% is real gap: **12.5px was the third most-used size in the entire codebase and
had no step at all.**

So v5 does two different things for two different defects:

- the 74% → `design-lint` rule 5 stays ratcheted, and utilities are named for the
  **job** (`type-body`, `type-meta`), never the size;
- the 26% → the base moves **13px → 14px**, which pulls 12.5/13 onto one step and
  gives 14px (52 uses) a home.

**Half-pixel sizes are banned**, and the reason is mechanical rather than tidy:
12.5px does not rasterise as half a pixel. The engine rounds per glyph run, so two
adjacent 12.5px labels can land a whole pixel apart and a baseline can shift under a
hover. 132 uses across four half-pixel values were the largest single source of the
app's uneven vertical rhythm.

**Why 14px and not 13px.** v4 chose 13px and wrote "the density is most of the look" —
true, for the reference v4 was built to. v5's reference is not dense, it is generous,
and the reader is meeting a marketing tool for the first time on a cheap 720p panel.
16px was rejected: this product has tables.

| step | size / line-height / weight | tracking | exists because |
|---|---|---|---|
| `type-hero-num` | 44 / 44 / 650 | −0.03em | The **one** big number per view. Tabular by construction — a balance that reflows its digits as it changes reads as unstable. Figures are wide, so it needs the most negative tracking on the scale. |
| `type-display` | 30 / 36 / 700 | −0.022em | A screen that is one statement. Rare. |
| `type-h1` | 24 / 30 / 650 | −0.022em | Page title. One per screen. |
| `type-h2` | 20 / 26 / 650 | −0.008em | Section title. |
| `type-h3` | 16 / 22 / 650 | −0.008em | Card title. Added in v4 because a 7px cliff between h2 and body made every card title a hand-written `text-[15px] font-semibold`. |
| `type-body` | 14 / 22 / 400 | 0 | **The base.** |
| `type-sm` | 13 / 18 / 400 | 0 | Secondary text. Absorbs the 12.5px block. |
| `type-meta` | 12 / 16 / 400 | 0 | **New in v5.** Table cells, captions, timestamps, helper text — the 211 + 110 uses that had nowhere to go. |
| `type-chip` | 12 / 16 / 600 | 0 | A chip's own label. Not uppercase — a chip label is often a sentence fragment ("Not yet confirmed live"). |
| `type-eyebrow` | 11 / 14 / 600 | +0.06em | Uppercase section label. Positive tracking because 11px uppercase set solid looks cramped. |
| `type-input-embed` | 16 / 22 / 400 | 0 | The one rung that exists because a browser insists on it: iOS Safari zooms the viewport on focus for any input under 16px, and `/embed/*` renders inside somebody else's mobile page where that zoom cannot be undone. |

**There is no 10px step.** 17 call sites want one. They should move up to 11px:
10px is below what this reader can comfortably read on a phone, and adding the step
would legitimise it.

**Tracking is optical, one value per size band, never per component.** Large type
set solid looks loose and needs negative tracking; 11px uppercase looks cramped and
needs positive. Nothing between 12 and 14px needs any.

---

## 4 · Spacing

`--space-N`, a 4pt scale: **4 · 8 · 12 · 16 · 20 · 24 · 32 · 40 · 48 · 64 · 80**.
(64 and 80 are new in v5: the reference's page rhythm between major regions is ~64px
and v4's ladder stopped at 48, so every screen that wanted more wrote it by hand.)

**Do not write `--s-1`.** `--s1` and `--s2` are *surface colours* in this codebase
(158 references). `background: var(--s1)` becoming `4px` blanks every card in the app.

**When each step applies:**

| step | applies to |
|---|---|
| 4 | between a glyph and its label; inside a chip |
| 8 | between two controls in a row; label → field |
| 12 | between rows in a list; inside a compact card |
| 16 | card padding (compact); between fields in a form |
| 20–24 | **card padding (default)**; between cards in a grid |
| 32 | between a section heading and its content |
| 40–48 | between sections of a page |
| 64–80 | between major regions; above a page footer |

Rule of thumb: **the gap between two things is smaller than the gap around the group
they belong to.** If a label sits 12px from its value and 12px from the next pair,
the reader cannot tell which value belongs to which label. That single failure is
the most common spacing bug in this product.

`--measure-*` is different from spacing and must not be confused with it. Space is
the gap **between** things; measure is the cap on **one** thing.
`--measure-prose: 640px` (~66ch at the 14px base), `--measure-form: 720px` (past which
a label and its control stop reading as one row).

---

## 5 · Radius — load-bearing for the look

| token | px | for |
|---|---|---|
| `--r-xs` | 8 | a mark, a swatch, a 20px square |
| `--r-sm` | 12 | chips, badges, inputs, small buttons |
| `--r` | 16 | tiles, list rows, nav items |
| `--r-md` | 20 | segmented controls, wells, media |
| `--r-lg` | 24 | **cards** — measured off the reference |
| `--r-xl` | 28 | modals, drawers, the rail — measured |
| `--r-full` | 999 | **every button, every pill** |

**The ladder is by surface SIZE, not by importance.** A nested surface takes the
parent's radius minus one step. A chip inside a card is `--r-sm` inside `--r-lg`,
always — equal radii on nested boxes make the two curves fight, and a *larger* radius
inside a smaller one reads as a mistake.

**Buttons are pills. Always.** This is the most recognisable single decision in the
reference and it is not negotiable per screen.

---

## 6 · Elevation

The reference separates by **fill and the faintest border**, not by shadow, and the
measurement is unambiguous: a card's edge pixel reads `#fdfdfd` against a `#fafafa`
page. That is one step — anti-aliasing, not a shadow.

- **A resting card gets no shadow.** `--sh-card` is `0 1px 2px rgba(0,0,0,.03)` and
  is deliberately almost nothing.
- **A shadow means "this floats above the page."** Only overlays float:
  `--sh-pop` (popovers, dropdowns), `--sh-lg` (modals, drawers).
- **Never use a border and a ring together.** Pick one. `surface-ring` is an *inset*
  shadow, so it does not change the box size and a hover that thickens the edge
  cannot shift the layout by a pixel.

---

## 7 · Glass

**The brief asked for two things that are not the same instruction:** "glassy and
transparent" *and* "exactly like the reference". The reference's app is **not glass** —
solid rail, opaque cards, solid buttons. The only glass in the entire product is its
auth card floating over a gradient.

### The rule: GLASS ON CHROME, OPAQUE ON DATA

| | |
|---|---|
| **Allowed** | topbar · rail · mobile bottom bar · command palette · modal and drawer panels · toasts · the gradient layer |
| **Forbidden** | every card, table, stat, chart, list row, form well — **anything carrying a value, a status or a certainty mark** |

Two reasons, neither aesthetic:

1. **Cost.** `backdrop-filter` forces the compositor to re-read and re-blur the
   content behind the element on every frame it changes. On the mid-range Android
   this reader is holding, that is among the most expensive things a page can ask
   for. Chrome-on-chrome is a handful of fixed elements; glass-on-data is one per row.
2. **It breaks the Certainty System.** §9 separates rungs by *fill weight* —
   solid → wash+ring → dashed → hatched is a ladder of ink coverage. A translucent
   ground changes the coverage of everything on it, so the ladder stops being a
   ladder. **A glass surface that must host a status-bearing element gives it an
   opaque well (`.glass-well`).** Never let a certainty mark sit on a blur.

`--glass-blur: 20px`, `--glass-sat: 1.6` (a blur desaturates what it samples; the
saturation lifts it back or the panel reads grey). The fallback `background` is
**opaque** on purpose: a browser without `backdrop-filter` gets a solid panel rather
than a see-through one, which fails safe instead of illegible.

---

## 8 · The gradient ground

A soft mesh behind everything, fixed, built in CSS rather than shipped as an image —
an image cannot follow the theme, bands when scaled to 1920, and costs a request on a
phone.

**"It must never compete with content" is a measurable claim.** The gradient's
strongest point must sit closer to `--canvas` than **one deliberate ladder step**.
`canvas → surface` is 1.04:1 in light, so a wash measuring ≤1.03:1 against `--canvas`
can never be mistaken for a surface edge. Dark's smallest step is 1.08:1.

**Light and dark are different gradients, not one inverted.** In light the brand hue
is the warm stop with a cool counterpoint to stop it reading as a stain. In dark the
stops differ again, because on a `#0d0d0d` ground even a little orange glows.

**The alphas are SOLVED against that ceiling, and the first two attempts failed it.**
`glass-and-gradient.spec.ts` measures the strongest stop composited over `--canvas`:

| attempt | light | dark | |
|---|---|---|---|
| chosen by eye (0.05 / 0.045 / 0.035) | **1.056:1** | 1.047:1 | over the ceiling _and_ over one whole ladder step |
| solved to 3 decimals | 1.030:1 | **1.031:1** | one thousandth over |
| solved in n/255 | **1.030:1** | **1.029:1** | passes |

The middle row is the instructive one. **CSS serialises a colour's alpha to 8 bits**, so a
declared `0.034` leaves the build as `#…09` — 9/255 = 0.0353, a _larger_ value than the one
solved for. Solving in the units the browser actually stores is the difference between a
value that passes on paper and one that passes in the document.

**It does not animate.** The brief permits animation if it stops under
`prefers-reduced-motion`, but a permanently animating full-viewport gradient is a
permanently animating full-viewport *composite* — the one thing this reader's phone
should never be asked to do while they are reading. Still is also the honest reading
of "must never compete with content".

It is `aria-hidden`, empty, `pointer-events: none`, `z-index: -1`. It lives in
`(app)/layout.tsx`, not the root layout: `/sign-in` and `/onboarding` compose their own
grounds and a second fixed layer would fight them.

---

## 9 · The Certainty System — the signature

Four levels of **how real a thing is**, each with a structural signature that survives
recolour, greyscale and colour blindness.

| rung | means | fill | edge | texture | label |
|---|---|---|---|---|---|
| `.is-real` | it happened | solid brand | none | — | — |
| `.is-committed` | it will happen | 6% wash | 40% ring | — | — |
| `.is-proposed` | Sahoda suggests | none | **dashed** | — | — |
| `.is-simulated` | not real | none | firm | **hatched** | **required** |

- **Certainty is not urgency.** These say how *real* a thing is, not how much it
  *needs you*. A published post is maximally real and minimally urgent. Never collapse
  the two axes.
- **Approving turns the dash solid.** Approval becomes a visible event.
- **`.is-simulated` never ships without its text label.** The hatch alone is not a claim.
- **Verified by composited luminance, not colour strings.** `design-system.spec.ts`
  composites each rung's (possibly translucent) fill over the page surface and measures
  greyscale luminance, then asserts every rung differs from every other in at least one
  *structural* channel, and that `is-real` and `is-committed` — which share an edge and a
  texture — differ in fill by more than 100/1000. A test comparing `rgb()` strings would
  pass on hue, the one channel that is not allowed to be load-bearing here.

### The absence vocabulary

The most-rendered glyph in this product was an em dash meaning "nothing", doing three
different jobs:

1. **Not yet measured** — the slot is real, the reading has not arrived → `.is-unmeasured`, a solid rule.
2. **Unreadable** — we asked and the answer did not come back → `.is-unreadable`, the same rule **broken**.
3. **Does not exist** — there is no such quantity → **omit the slot.** There is no class, on purpose.

Rendering 1 and 2 identically is the defect: "you have nothing yet" and "something is
broken" led to the same dash, so a failed read looked like a quiet Tuesday. Rendering 3
at all is the other defect — `100 of —` invents a fraction with no denominator.

**Both marks require an accessible name.** A rule with no name is a decoration a screen
reader skips, which makes the absence invisible rather than legible.

---

## 10 · Dark is a peer, not an inversion

The dark ladder is **measured off the reference's own dark capture**, not derived from
the light one: page `#0d0d0d` · card `#171717` · raised `#212121` · hover `#292929`.

### The arithmetic, and the unit

| pair | light | dark |
|---|---|---|
| canvas → surface | **1.04:1** | **1.08:1** |
| surface → surface-2 | **1.12:1** | **1.11:1** |
| surface-2 → surface-3 | **1.08:1** | **1.11:1** |
| **floor** | **1.03:1** | **1.06:1** |

**Two floors, both derived, neither asserted.** Each sits just under the worst adjacent
pair the reference itself achieves. (I first guessed a dark floor of 1.18:1; the solver
showed the reference's own dark ladder fails it. The floor is now derived.)

**The obvious unit is the wrong one.** In ΔL/1000 the light steps measure 44–111 and the
dark steps 4.5–7.0 — a 10–20× difference for pairs doing the same job, because sRGB is
compressed near black. In *contrast* they measure 1.04 and 1.08: the same order. A floor
written in ΔL would condemn a dark ladder that is fine. **The spec and the guard both
speak contrast.** (`scripts/design/dark-ladder.mjs` printed ΔL; it is a solver, it
asserts nothing, and it is not in the gate.)

**The defect this exists for:** v4 shipped `--surface-2` **byte-identical** to `--surface`
in dark (`#17171a` both). 117 of 120 dark frames carried at least one fill that separated
nothing, and nothing could go red because a missing 4% fill reads as a design choice.
`tonal-ladder.test.ts` is now that guard.

### Text in dark is solved, not picked

Light earns its hierarchy from the **gap** between ink and mute: 21.0:1 vs 7.2:1, a
**2.90×** ratio-of-ratios. Dark reproduces that separation: `#ffffff` at 17.93:1 and
`--ink-mute #979797` at 6.14:1 is **2.92×**, and 6.14:1 still clears AA body. A grey
chosen by eye makes secondary text nearly as loud as primary and every card reads flat.

### `--ink` inverts. Watch for it.

`--ink` is `#000000` in light and `#ffffff` in dark, so **any class pairing `--ink` with a
fill that does not follow the theme is white-on-white in one of them.** This is the most
common way a dark-mode bug ships.

---

## 11 · The inverse surface

The rail is `#171717` in **both** themes. In dark that is simply `--surface`. In light it
is an **inverted context inside a light document**, and every token in it is wrong:
`--ink` is `#000000`, so `text-ink` on the rail is black on near-black; `--line` is
`#e9e9ec`, so a divider is a bright white scratch.

**Anything painted with a fill that does not follow the theme must re-declare its text
tokens.** `[data-surface='inverse']` is that declaration, written once:

```
ink   #ffffff  17.93:1
mute  #979797   6.14:1   (AA body, and 2.92× separation — solved, not picked)
acc   #ff6600   6.11:1   (no darkened step needed on this ground)
```

It is a **full four-rung ladder**, not a one-colour patch. It shipped for ten minutes with
`--canvas` equal to `--surface` on the reasoning that a rail has no page behind it, and
`tonal-ladder.test.ts` refused it. The guard was right: the moment anything nests inside
the rail — an active pill, a well, a count badge — it needs a ground to sit on.

A bonus the scope buys: the rail's logo is now **one image**, not a `dark:hidden` pair.
The light-mode lockup has nowhere left to render, and the old pair would have swapped to a
black wordmark on a black panel the moment someone flipped the theme.

---

## 12 · Motion

| token | value | for |
|---|---|---|
| `--dur-fast` | 140ms | colour, opacity, micro-interactions |
| `--dur-base` | 180ms | panels, entrances |
| `--dur-slow` | 280ms | the longest transition that ships |
| `--dur-count` | 560ms | count-up only — a *reveal* of one settled value, not a move between two states |
| `--ease` | `cubic-bezier(.2,0,.2,1)` | everything |
| `--ease-sweep` | `cubic-bezier(.16,1,.3,1)` | the blade sweep, and nothing else |
| `--stagger` | 40ms | the step between successive list items |
| `--stagger-cap` | 8 | past this, items share the last delay so a 40-row table does not take 1.6s to arrive |
| `--enter-lift` | 6px | how far an entering element travels |

**One entrance keyframe for the whole product** (`sl-enter`). A screen that fades, a
screen that slides and a screen that scales read as three products.

**Travel is deliberately small.** An entrance you can watch is an entrance you are
waiting for.

### What must NOT animate

- The gradient ground (§8).
- Anything longer than 280ms that is a transition rather than a reveal.
- Layout-affecting properties. Animate `transform` and `opacity`; never `width`,
  `height`, `top` or `left`.
- Anything on a data table row. A list that re-animates on every filter change is a
  list nobody can read.

### `prefers-reduced-motion` gives a STILL interface **and a FAST one**

Zeroing the *duration* alone leaves the *delay* intact, so a staggered row with
`animation-delay: 320ms` and `fill: both` stays invisible for 320ms and then snaps in —
**the person who asked for less motion gets a slower, jumpier screen than everyone else.**
A stagger is a motion and its delay has to die with it. The reduced-motion block zeroes
`animation-delay` and `transition-delay` as well as both durations.

---

## 13 · Layout, and the three bands

`globals.css` opens `@theme` with `--breakpoint-*: initial`, which **removes every stock
Tailwind breakpoint**, and then defines exactly two: `narrow` (700px) and `wide` (1180px).

> **`sm:` `md:` `lg:` `xl:` `2xl:` DO NOT EXIST.** A class using one is spelled correctly,
> type-checks, reads right in review, and is **never emitted**. `top-up-panel.tsx` carried
> `w-full sm:w-auto` on *Start checkout*, so the loudest object in the product — a
> brand-filled button, on the money screen — rendered as a ~1000px bar at 1440px. Someone
> wrote the fix; it simply never existed. `design-lint` rule 4 reads the allowed names
> **from `globals.css`** so it cannot go stale.

Two breakpoints means **three bands**, and every responsive rule in this document names
the band it applies to:

| band | width | shell |
|---|---|---|
| **phone** | `< 700` | no rail at all — bottom bar with a dominant `+` |
| **middle** | `700 – 1179` | collapsed icon rail (68px), floating |
| **wide** | `≥ 1180` | labelled rail (240px), floating |

**Mobile is recomposed, not shrunk.** `max-narrow:hidden` on the rail is the load-bearing
half of that: without it the phone gets a 68px icon strip eating a sixth of a 390px
viewport, which is a squeezed desktop layout rather than the mobile design.

**Test the middle band.** 390 and 1440 both land in terminal bands and neither exercises
700–1179. Shoot 1024, always.

Layout tokens: `--content-max: 1320px` (widened from 1080 — the reference does not cap its
content at all; 1320 does not bind at 1440 and only starts working at 1920, where an
uncapped table runs to a length nobody can track a row across), `--topbar-h: 60px`,
`--control-h: 38px`, `--input-h: 42px`.

**The floating rail costs its width PLUS two insets, and that is the number to plan with.**
`--sidebar-w-collapsed: 56px` and `--rail-inset: 8px`, so the middle band's rail column is
**72px**. It shipped at 68 + 2×10 = 88px, copied from the reference's own 62px/10px — but the
reference measures those at a **1844px viewport**, and 88px at 700px removed 24px from the
content column at the one width with none to spare. The topbar overflowed by exactly 16px and
`connections-widths.spec.ts` caught it. **Take the reference's proportion, not its pixels.**

**The touch floor is 44px** (`--control-h-touch`). At narrow widths every *interactive*
control grows to it. It is a token rather than a literal because it has to be the same
number in the button, the input, the tab and the icon button — `max-narrow:min-h-[44px]`
scattered by hand is how three of them end up at 40.

---

## 14 · Focus

**One treatment, no per-component overrides.** Two-tone, and that is a requirement rather
than a flourish: WCAG 1.4.11 asks 3:1 of a focus indicator against its surroundings, and
the brand orange measures **2.94:1** on white. It misses by 0.06. A near-identical darker
orange at 3.02:1 would pass the letter of the rule while being invisibly different, which
is gaming the check rather than clearing it.

So the ring is an **ink core with an orange halo**. The core carries the contrast (21:1 on
light; on the inverse surface `--ink` is white and carries it there), the halo carries the
brand. It also reads on top of an orange fill, where a pure orange ring would disappear
entirely — the one case a single-colour ring can never solve.

---

## 15 · Primitives

Every one lives at **`/design-system`** in every state, in both themes, with a greyscale
toggle. Build from that page, not from memory.

button · input · select · card · tile · tab · badge · chip · table · stat card with
sparkline · segmented control · empty · loading skeleton · error · coming-soon · modal ·
drawer · toast · the certainty marks · the absence marks.

**Every component ships every state with it**: rest, hover, active, focus-visible,
disabled, loading, empty, error.

### COMING SOON IS A `<div>`, NEVER `<button disabled>`

A disabled button is still announced as a button — a screen-reader user is told there is
an action they can take, and then it does nothing. `design-lint` rule 3 enforces this at
**zero** with no baseline and no grace.

### The empty state is not a shrug

An empty screen is an **invitation to act**. It says what will appear here, and offers the
one control that makes it appear. "No data" is not an empty state.

**And one absence gets one statement.** The founder's verdict names this precisely: *"five
cards explaining an absence the page could state once."* If a screen is empty because the
workspace has no connection, say that **once**, at the top, with the action — do not let
five cards each discover it independently.

### A choosing surface carries the name and the price. Explanation goes in a drawer.

Founder's ruling, 2026-09-06, from two screenshots side by side. On `/connections`,
pressing "Details" on a channel slides a panel in from the right holding the long
explanation: ready to publish, slots used here, longest post, photos and video, posts
per day, how long the link lasts. On `/studio`, the same kind of information sat inline:
pressing a settings pill opened a wall of prose, four model options each with a
paragraph, and the page became a document instead of a control. His words: *"no user
friendly drop downs but such a wordy detailed options come up when I click on any
settings button."* The `/connections` pattern **becomes the rule**.

**What it is.** A screen where somebody is choosing between options shows only the name
and the price on the surface itself. Anything longer, why one option beats another, what
a limit means, why a state reads the way it does, goes behind one "Details" affordance
that opens a right-hand drawer.

**What to use.** `apps/web/src/components/ui/drawer.tsx`, the shared primitive.
`apps/web/src/components/connections/channel-details.tsx` is the reference
implementation. Nobody builds a second drawer.

**Why that primitive and not a hand-rolled panel.** `Drawer` is a native `<dialog>`
opened with `showModal()`, so it renders in the browser's top layer instead of the
normal flow. That makes it immune to the `backdrop-filter` containing-block trap that
`apps/web/CLAUDE.md` documents at length: the one that laid the command palette out at
1834×137 instead of covering the viewport, reported as three separate defects before
anyone found the single cause. A fixed-position panel built inside a `glass` element
would reproduce that trap exactly; a `<dialog>` in the top layer cannot.

**What it does not license.** Moving text into a drawer is not permission to shorten it
into something less true. §17's rule, that a sentence must never become vaguer than the
truth it replaces, still governs the copy inside the drawer. And the price never leaves
the choosing surface: costs are shown before the spend, on the surface, not one tap away.

**When it does not apply.** A short label, a single line of help, an inline error against
the field it belongs to, stay where they are. The drawer is for explanation somebody
chooses to read, not for a message they must see.

---

## 16 · Hierarchy — the rule, and how to decide

**One thing leads per screen.** Everything else is subordinate to it, visibly.

The founder's verdict on v4 names the failure exactly:

> *"trustworthy, but it does not yet decide what matters on each screen — a 1032px orange
> band holding two words, five cards explaining an absence the page could state once.
> Every one an individually defensible decision nobody weighed against its neighbours."*

That last clause is the diagnosis. Every element was defensible **alone**. Hierarchy is
the only property that cannot be checked one element at a time.

### How to decide which thing leads

Ask, in this order, and stop at the first that answers:

1. **Is the user blocked?** If something must be resolved before anything else on this
   screen works — no connection, no credits, an error — *that* leads. Nothing competes
   with a blocker.
2. **Is there one number this screen exists to report?** Then that number leads, set in
   `type-hero-num`, and everything else is context for it.
3. **Is there one action this screen exists to start?** Then that action leads, as the
   single primary button.
4. **Otherwise the screen is a list**, and the list leads. Its header is a label, not a
   feature.

If you cannot answer 1–4, **the screen is doing too much** and should be split. That is a
real answer, not an evasion.

### Consequences you can check

- Exactly **one** solid-brand-fill element per view.
- Exactly **one** `type-h1` per view.
- At most **one** `type-hero-num` per view.
- A page that says the same thing in more than one place says it once, at the top.

---

## 17 · Copy

Verb-first, sentence case, active voice. A control says exactly what happens when it is
used: *Save changes*, not *Submit*. **An action keeps its name through the whole flow** —
the button that says *Publish* produces a toast that says *Published*.

Sahoda speaks in the **third person**: "Sahoda could not reach your accounts", never
"I could not".

**Errors do not apologise and are never vague.** They say what happened and what to do.
**Empty states give direction, not mood.**

**State the claim precisely.** "We never asked" and "we asked and got nothing" are
different sentences and the user has to be able to tell them apart. `lib/inbox/emptiness.ts`
exists to keep eight of them apart, and its tests assert the *claim*, never the wording —
so rewrite the sentence freely and keep the guarantee.

**Never render a number the product cannot prove.** The reference's dashboards are full of
confident figures; this product may not invent one. If the quantity does not exist, delete
the slot (§9).

---

## 18 · What NOT to do

- **Do not write a raw hex.** Anywhere.
- **Do not hand-write a font shorthand or a pixel size.** Use a `type-*` step.
- **Do not use a half-pixel font size.** §3.3.
- **Do not use `sm:` `md:` `lg:` `xl:` `2xl:`.** They compile to nothing. §13.
- **Do not put glass on anything carrying a value.** §7.
- **Do not use hue to carry severity.** §9.
- **Do not put white text on the brand orange.** 2.94:1.
- **Do not pair `--ink` with a fill that does not follow the theme.** §10.
- **Do not ship `<button disabled>` for coming-soon.** §15.
- **Do not use a border and a ring together.** §6.
- **Do not animate width/height/top/left.** §12.
- **Do not give a nested surface a radius equal to or larger than its parent's.** §5.
- **Do not add delight to a screen whose hierarchy is not settled.** §0.
- **Do not put a wall of explanatory prose on a choosing surface.** Put it behind
  "Details" in a drawer. §15.
- **Do not loosen a guard to accommodate the change that broke it.** §19.

---

## 19 · The guards, and what each one exists for

| guard | layer | catches |
|---|---|---|
| `own-medicine.test.ts` | token | Sahoda's own brand pair failing the Readability Guard it applies to customers |
| `guard-neutrals.test.ts` | token | `brand-theme.ts`'s mirrored neutrals drifting from `tokens.css` |
| `tonal-ladder.test.ts` | token | **new** — an adjacent surface pair that separates nothing, in any of the three scopes |
| `type-space.spec.ts` | rendered | **new** — the shipped typeface's word space collapsing |
| `design-system.spec.ts` | rendered | two certainty rungs perceptually identical in greyscale |
| `shell-widths.spec.ts` | rendered | a shell control losing its label or its accessible name at any of six widths |
| `no-truncated-labels.spec.ts` | rendered | clipped text anywhere |
| `glass-and-gradient.spec.ts` | rendered | **new** — a blur inside `#main`, a certainty mark resting on one, and a gradient stop over the §8 ceiling |
| `glass-cost.spec.ts` | rendered | **new** — the shipped blur exceeding its frame-time budget |
| `connections-widths.spec.ts` | rendered | a page scrolling sideways at any of seven widths |
| `motion.spec.ts` | rendered | reduced-motion leaving a delay behind, so the still screen is also a slower one |
| `design-lint.mjs` | source | raw hex · hardcoded spacing · `<button disabled>` · dead breakpoints · hand-written font sizes |

**Guards that grade TOKENS cannot see what COMPONENTS write.** `--pfg` was correct for
weeks while three components wrote `text-white` on a brand fill. That is why half the table
above measures rendered output in a real browser: some properties — a font's metrics, a
composited luminance, an accessible name — do not exist until something is rasterised.

**Every guard here has been shown red on the defect it exists for.** A guard that cannot
fail is worse than no guard, because a green result is read as evidence.

**A guard is never loosened to accommodate the change that broke it.** Four times in this
lane a guard refused this system's own work, and four times the work changed:

- `tonal-ladder.test.ts` refused the inverse scope for having three rungs where the system
  promises four. The scope was fixed.
- `type-space.spec.ts` refused a root-level word-spacing that inherited as one computed pixel
  value. The correction moved onto each type step.
- `connections-widths.spec.ts` refused a 16px overflow at 700px. The rail column gave it back.
- `glass-and-gradient.spec.ts` refused a gradient at 1.056:1 against `--canvas`. The alphas
  were re-solved — twice, because the first re-solve did not survive CSS's 8-bit alpha.

**And a guard that cannot fail is worse than none.** Two guards in this lane were themselves
wrong on their first run, and were fixed rather than trusted: `type-space` measured a synthetic
span built from a token — a token check in a browser costume — and the gradient check reported
a passing "1:1" while parsing zero stops. Both now refuse to report a result they did not
actually measure.
