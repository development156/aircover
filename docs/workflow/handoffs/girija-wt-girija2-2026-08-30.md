# girija / wt-girija2 — 2026-08-30

**Nine commits, all promoted to production.** `wt-girija2` = `wt-core` = `wt-web`
= `3718bd31`. Yesterday's session is `girija-wt-girija2-2026-08-29.md` and this
one continues it without repeating it.

The day was one feature — **Brand Skin and the logo** — reported broken by the
founder four separate times, each time for a different reason. Every fix was
correct and the feature still did not work, which is the lesson of the day and
is written up at the end.

| commit                             | what                                                        |
| ---------------------------------- | ----------------------------------------------------------- |
| `756b54b2` | the CI smoke guard names which settings TAB                   |
| `1a73a4ec` | a button must be visible as a button, not only readable       |
| `ec1bd57c` | "Replace logo" threw its own error away                       |
| `b32f535e` | a monochrome logo gets a colour picker, not five decoys       |
| `7cbf5f2d` | the neutrals carry the customer's hue — **§2 unfrozen**       |
| `856e6565` | "Replace logo" could never have worked, and two reasons why   |
| `def6f1e1` | SVG logos, rasterised on upload so no SVG is ever stored      |
| `6d917635` | **fifteen defects** an adversarial review found pre-promotion |
| `3718bd31` | the rail follows Brand Skin, graded for its own dark ground   |

---

## The founder's four rulings, in order

**1 · Two switches that must not touch each other.** The moon and sun own
Sahoda's light and dark. The logo owns Brand Skin, on against off. They compose:
brand colours over dark neutrals is a real combination, because only the
themeable tokens move and every neutral belongs to the theme. Off is the default,
stored per person in `localStorage` beside the theme, restored before first paint
by `ThemeScript`.

**2 · Pick-a-colour for a monochrome logo.** His own logo is grey, white and
black. MEASURED: all five extracted swatches had **chroma 0.0000**, so every one
fell through the chroma floor to Sahoda orange — five choices, five no-ops, while
the panel announced "your brand colours are on". `no-impossible-remedy.spec.ts`
exists in this repo for exactly that. Swatches are filtered by
`isUsableBrandColor` now, and a logo with no colour says so and hands over a
picker.

**3 · §2 unfrozen — the neutrals carry the hue.** MEASURED: brand colour reaches
**under 0.5% of the pixels** on any screen (666–5,594 px² of a 1.3M px² frame),
held there deliberately by `accent-area-budget` and `accent-budget`. So Brand
Skin recoloured one button and his verdict was *"a pathetic failed attempt"*. He
was right, and no correctness in the derivation could have fixed it. Five
neutrals now carry the brand hue at chroma 0.006 with lightness copied unchanged.
**Semantics stay frozen** — danger is crimson whatever the brand.

**4 · The rail follows too.** `[data-surface='inverse']` re-declares the dark
ladder AND the `--bg`/`--s1`/`--s2` aliases on the element, so a `:root` rule
could never reach inside it. At 62px collapsed and ~245px expanded that is about
**ten times the entire accent budget of the loudest screen**.

---

## "Replace logo is not working" — four causes, none of them the same

Reported four times. Each report was true and each had a different cause.

| # | cause                                                                                | fix         |
| - | ------------------------------------------------------------------------------------ | ----------- |
| 1 | the result of `uploadAsset` was **discarded**, so every refusal read as success        | `ec1bd57c`  |
| 2 | his file was **already in the library**, so `uploadAsset` refused it as a duplicate — the one action that could make the logo findable was the one certain to fail, every press, for ever | `856e6565` |
| 3 | a file input fires `change` only when its **value changes**, so every attempt after the first produced no handler, no request, no error, nothing | `856e6565` |
| 4 | his logo is an **SVG**, which `accept` excluded, so the dialog greyed it out           | `def6f1e1`  |

Cause 2 is the one worth remembering. Refusing a duplicate is right for a media
library and wrong for a control whose meaning is "this is my logo": if the bytes
are already here, the request is already half-satisfied. `setBrandLogo` hashes
first and **adopts** the existing row rather than refusing it. `uploadAsset` is
untouched — the library's policy is right for the library.

---

## SVG: rasterised, never stored

`lib/assets/kind.ts` already held the position, written long before any of this:
*"an SVG is a script container that no channel accepts."* It is right.

The obvious answer is to sanitise and it is the wrong one. A blacklist is
defeatable (entity encoding, mixed case, CDATA, namespaced elements,
`<set attributeName="onload">`, `<animate>` writing an attribute at runtime) and
this project's own security checklist says it in one line: **whitelist, never
blacklist**. A whitelist SVG sanitiser is real software with a real CVE history,
and one that is subtly wrong looks exactly like one that works.

So the vector is **rasterised and discarded**. Nothing reaching storage, a signed
link, a browser or a model is ever an SVG, and everything downstream —
`sniffImage`, `kindForProvenMime`, the Constraint Engine, the library, image
generation — receives a PNG it already handles. `kind.ts`'s objection is
answered rather than routed around, which is why this needed no exception
anywhere else. `sharp` was already a dependency; output is 1024px with alpha.

The blacklist in `svg-logo.ts` remains and its header says what it is: librsvg
also parses that XML and has its own CVE history, so refusing the obvious hostile
shapes before handing bytes to a renderer is worth the lines. **It is not what
makes this safe.**

---

## The pre-promotion review, and why the promotion was refused first

The founder said "promote all of it". Before pushing a security-sensitive upload
path and a design-canon change to production, six independent lenses ran over
`origin/wt-web..wt-girija2` — security, does-it-work, contrast, hollow-guards,
regression, data-integrity — with every finding facing **three refuters given
distinct angles** and told to default to *refuted*.

**75 agents. 23 raised, 15 survived, 8 dismissed.** Several meant the SVG work
would still not have worked. So `6d917635` is the fix and the promotion came
after it.

### What would have failed for him, again

- **`looksLikeSvg` returned FALSE for a leading `<!-- Generator: Adobe
  Illustrator -->`** — what Illustrator and Sketch put at the top of every
  export, very probably his own file. Also false for lowercase `<!doctype`, a
  doctype with two spaces, long leading whitespace and UTF-16. The branch was
  skipped, raw vector bytes went to `uploadAsset`, and `sniffImage` refused them
  as "not an image type" — for a file the dialog had just said was allowed. The
  module's own comment **claimed** comments were handled.
- **The palette was read from a canvas BEFORE the server call, inside one try.**
  An SVG the browser will not decode (no `xmlns`) rejected in `load()`, the catch
  fired, and `setBrandLogo` was never called — while sharp would have rasterised
  it fine. Upload goes first now; the palette is a separate failable step.
- **Adoption retitled an OLDER row while `readBrandLogo` takes the NEWEST**, so
  it reported success while the topbar kept the previous logo. Found by two
  independent lenses. Exactly one row carries the title now; others are demoted
  to `Logo (previous)`.
- **`readBrandLogo` had no `deleted_at is null` filter**, so a trashed logo kept
  painting and hid a newer one behind it.
- **The "saved as an image" notice was doubly unreachable** — the panel closed in
  the same transition that set the flag, and every test mock omitted `converted`.

### Security

**Nothing bounded SVG render TIME.** MEASURED on this repo's own sharp: ~7ms of
CPU per byte of filter markup. Twenty stacked `feTurbulence`/`feGaussianBlur`
filters is **23 seconds in 3.4 KB** — inside the 2 MB cap, inside the 40M pixel
cap, past `refuseUnsafeSvg`, in a server action with no concurrency limit. At the
old cap that extrapolates to about **four hours of CPU for one upload**.

Now: 256 KB, at most 8 filter elements, and a 5-second race. The header is
explicit that the race bounds the **request** and not the CPU, and that the byte
and filter caps are what bound the work.

### Design

**Light `--surface` is `#ffffff` = L 1.0, where sRGB has no headroom for chroma**,
so asking for some clamps LIGHTNESS. MEASURED: the canvas-to-surface step fell
from **1.0438:1 to 1.0298:1**, under the 1.03 floor `tonal-ladder.test.ts`
enforces — dissolving the only thing that separates a card from the page in light
mode. A stop with no room keeps its exact value now; the step holds at
**1.0399:1** worst across all 360 hues, asserted.

### Five hollow guards, every one mutation-proved

1. `NEUTRAL_CHROMA` 0.006 → 0.001 left **512/512 green** while reducing the
   feature to an invisible no-op. The floor was `c > 0`.
2. The size-cap test passed because **NUL padding made libxml throw**, not
   because the cap ran; `SVG_MAX_BYTES` could be deleted entirely.
3. The Supabase mock **ignored every query argument**, so nothing pinned that the
   lookup is scoped to the workspace — a cross-tenant read would have been green.
4. `NEUTRAL_STOPS` claimed `guard-neutrals.test.ts` pins it against `tokens.css`.
   It does not and never referenced it: **all ten values, including the whole
   dark ladder, were unpinned.** The claim is now true rather than deleted.
5. `readBrandLogo` had **no test at all**.

---

## Two guards found hollow by mutation *during* the work

Recorded because both are the same defect one layer apart, and the second only
appeared after the first was "fixed".

`skinVarNames` reported the derivation **functions'** keys. Adding the neutrals
to `skinCss` left all 489 tests green — including the one named *"never DEFINES a
neutral"*, the single test that existed to notice it. Summing both functions was
**still** hollow: injecting `--danger` straight into the object `skinCss` builds
also stayed green, because the guard read two functions while the browser
received a third thing. It now **parses the emitted rule**, so nothing reaches
the page without passing the guard.

---

## Gate

Run unpiped from the repo root before every promotion.

| leg | result |
| --- | ------ |
| `turbo typecheck lint test` | **PASS**, 27/27. Final run **6,467 tests in 494 files** |
| root vitest | **PASS**, 223 |
| `test:smoke` | **UNRUN.** See below |
| `prettier --check .` | **PASS** |
| `pnpm --filter @sahoda/web build` | **PASS**, `js-budget ok: 82 routes within budget` |

The design lint earned its keep three times: two raw hexes in a colour picker and
a test, six more in SVG fixtures (named colours now, which SVG accepts and which
reads better), and a stray probe file a review agent left behind.

---

## The smoke suite still has never run

`CLAUDE.md` told every session for days to "run the smoke leg in CI before
merging". **That instruction was unexecutable and nobody had tried it.**

MEASURED, run 981 and again on 1061/1065/1066/1067/1068: the job reaches its own
guard step and exits in 17 seconds naming all three secrets absent. The founder
added them, twice, and the runner's env block still printed six blanks — because
they went onto **`sahodalabsold`**, a separate private repo that still exists.
This repo was renamed to `development156/aircover`.

`756b54b2` improved the guard so it inspects the Variables namespace too and says
which tab it found them in. That is how the second theory was ruled out in one
run instead of three.

**I over-dispatched: six runs where two would have been honest.** After the second
identical refusal I should have stopped and reasoned about the shape of the
evidence instead of asking for another tab to be checked.

---

## The lesson of the day

**Every fix was correct and the feature still did not work.** Four separate
causes for one symptom, each hiding behind the last, and three rounds of
"correct" incremental work before anyone asked whether the foundation could
deliver the outcome at all — it could not, at 0.5% of the pixels.

Two habits came out of it:

- **When a user reports the same symptom a third time, stop fixing and go
  looking.** The adversarial review found in one pass what three rounds of
  careful reading had missed, including two defects that would have produced a
  fourth identical report.
- **A mutation round that comes back all-green is a result to distrust.** One did,
  and the cause was that a `git checkout --` had destroyed the uncommitted
  implementation while a `str.replace` with a non-matching anchor had silently
  added no tests. Every edit asserts its anchor now.

---

## Still open

- **The smoke suite has never run.** Three secrets belong on
  `development156/aircover`, under Settings → Secrets and variables → Actions →
  **Repository secrets**. Until then this project has no automated way to run its
  own end-to-end suite: not in the cloud sandbox (Chromium has no outbound 443)
  and not in CI.
- **Nothing in this handoff has been seen in a browser.** Every claim is a
  measured ratio from a test. The founder should look.
- **`workspaces.logo_asset_id` still does not exist.** The logo is found by the
  title `Logo`, a compromise written down in `lib/brand/logo.ts`. A migration is
  a founder decision and `wt-db` owns migrations.
- **`wt-jiban3` PR #32 restyles the topbar** and its deployment errored today. It
  touches the same bar as the brand mark and will conflict at integration.
- **The tint is chroma 0.006.** If it reads too faint on a real screen it is one
  number, and `brand-neutrals.test.ts` bounds what it may become.
- Yesterday's open items still stand: the dead second onboarding flow, the
  unreachable PDF door, the brand name never stored, and the Instagram login-wall
  document still in production.

---

## Links

- lane preview: https://sahodalabs-git-wt-girija2-development-4417s-projects.vercel.app
- **live**: https://app.sahodalabs.com — press the chevron beside the logo mark,
  then **Replace logo**, then press the logo itself to switch Brand Skin on.
