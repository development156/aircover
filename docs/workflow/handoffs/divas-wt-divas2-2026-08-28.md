# Handoff — divas — wt-divas2 — 2026-08-28

**Branch** `claude/divas-kickoff-03y2g2` at `90dfd922`. Lane `wt-divas2`. Pushed: yes.

Harness-pinned to a `claude/...` branch, so the lane was never checked out directly.
`sahoda.owner=divas` and `sahoda.lane=wt-divas2` both verified set at kickoff.

## The answer first

Phase 1 of the design studio exists as three pure modules in `packages/shared`, with
82 tests and **eight guards each mutated and watched go red**. No UI, no database,
no AI, no new dependency. The single most valuable thing found is not the code: it
is that **a brand colour handed to the renderer as an OKLCH string rasterises to
pure black, silently**, and this product stores brand colours as OKLCH.

## What shipped

| item | proof |
| --- | --- |
| `presets.ts` — canvas sizes, and the binding that makes the Constraint Engine their judge | `packages/shared/src/studio/presets.ts` · `presets.test.ts` 20 tests |
| `paint.ts` — colours as integers, so a colour string cannot reach a fill attribute | `packages/shared/src/studio/paint.ts` · `paint.test.ts` 26 tests |
| `svg.ts` — one serialiser read by both the browser preview and the server export | `packages/shared/src/studio/svg.ts` · `svg.test.ts` 28 tests |
| The real rasterisation proof: `renderSvg` output through sharp, pixels read back | `apps/web/src/lib/studio/raster.test.ts` 8 tests |
| Barrel exports | `packages/shared/src/index.ts:56-58` |

Commits: `08a180ca` (the modules), `90dfd922` (the adversarial-review fixes).

## Six measurements, all taken in this sandbox

Every one is reproducible with `sharp` 0.35.3 / libvips 8.18.3, already installed.

| what | result |
| --- | --- |
| Does sharp rasterise SVG here? | **Yes.** 400x500 PNG, 12,780 bytes; JPEG 10,044 |
| `fill="#E4572E"` and `fill="rgb(...)"` | correct — rgba 228,87,46,255 |
| **`fill="oklch(0.63 0.17 33)"`** | **rgba 0,0,0,255. Pure black, nothing thrown** |
| `fill="color(srgb ...)"` and `fill="notacolour"` | also black. The rasteriser cannot tell a modern colour function from a typo |
| Indic scripts (Devanagari, Tamil, Bengali, Telugu) | render as real glyphs, not tofu. Tofu has a measurably different signature: mean luma 25.07 / entropy 0.823 versus Devanagari 8.85 / 0.452. `fc-list` reports hi:9 ta:7 bn:8 te:4 |
| Two different font families, one installed and one invented | **identical ink to 5 decimal places.** fontconfig substitutes silently |

## The thing the next session most needs to know

**`imageDims` cannot produce a canvas size, and the build spec said it could.**

The research brief (line 37) says the studio's presets "should be driven from"
the Constraint Engine's `imageDims` so they stay in sync. MEASURED, that is not
possible:

| channel | what it declares |
| --- | --- |
| x | floor of **4x4 pixels**, no aspect rule |
| gbp | floor 250x250, no aspect rule |
| instagram | floor 320x320, aspect 0.75–1.91 |
| linkedin, facebook, telegram | **nothing at all** |

A floor is not a target. Building it as specified produces a 4x4 Instagram post.
So the relationship is **inverted**: the studio declares the sizes, and
`validateMedia` is the judge. Not one limit is restated in code.

This also matters because `apps/web/src/lib/media/targets.ts` already forbids
writing "1080x1080 for a feed post, 1200x628 for LinkedIn" — and `presets.ts`
contains both numbers. The distinction is argued in the file header at
`presets.ts:47-70`: `targets.ts` governs a size used as a JUDGE of an existing
photo, and no size in `presets.ts` ever judges anything. A future reader will
otherwise think the rule was broken.

## Guards written, and the mutation that proved each

Every one was applied, watched go red, and reverted. All eight.

| # | mutation | went red |
| --- | --- | --- |
| 1 | claim `instagram` on the 1200x628 link card | 2 tests |
| 2 | drop `telegram` from the square preset silently | 1 |
| 3 | excuse a channel the engine already refuses | 1 |
| 4 | let `paintFrom` accept `oklch(...)` | 3 |
| 5 | stop escaping text | 1 |
| 6 | drop the data-URI restriction on images | 7 |
| 7 | emit `oklch()` instead of hex | 3 in shared, **and the PIXEL guard in apps/web** |
| 8 | give every channel the first channel's refusal reason | 1 |

Plus two more after the review: removing `isPaint` from `hexOf` → 5 red; dropping
the anchor whitelist → 2 red.

**The preset guard caught three real defects in its own author's table before it
first went green** — `gbp` was left off `portrait`, `wide` and `link-card` with no
reason recorded. Two became written-down product decisions; one (`wide`) was a
channel being under-served and is now offered.

## What an adversarial review found, and what it cost

Six attackers were sent at commit `08a180ca` and told to refute its claims. They
produced 19 candidate findings. **Two were exploitable and I reproduced both
myself before fixing:**

1. **A `NaN` colour channel reached the fill attribute.** `Paint` is a structural
   interface, so `{ r: NaN, g: 0, b: 0, a: 1 }` satisfied the compiler. `hexOf`
   returned the string `#NaN0000`, the renderer emitted it, and the rasteriser
   painted it black — the exact failure `paint.ts` was written to prevent,
   arriving through `paint.ts`. Fixed with `isPaint`.

2. **`text-anchor` was a server-side request-forgery hole.** Typed as three string
   literals, it was the one interpolation with neither escaping nor number
   formatting. MEASURED: an anchor of
   `"/><image href="http://169.254.169.254/" .../><text a="` produced markup
   carrying a **live image element pointed at the cloud metadata endpoint**,
   walking past the data-URI check three functions below. Fixed with a whitelist.

Four claims were narrowed to what is actually proven, and one user-facing sentence
was wrong: `describeChannelFit` named every refusing channel then appended only the
FIRST one's reason, so two channels refusing for different reasons produced a
sentence true of one and false of the other. It also printed the raw enum key
("gbp"). It is now `summariseChannelFit` and returns data; the screen that owns
`CHANNEL_LABELS` writes the sentence.

**A methodological failure worth recording: I gave the review agents default tools,
which included write access.** One of them edited my working tree during a
supposedly read-only review, deleting a line from `paintFrom`. Caught by
`git diff`. The deletion happened to be defensible and I resolved that line on my
own terms, but the next session running a review workflow should constrain the
agents to read-only tools.

The 15 "refuted" findings are **not** evidence the attackers were wrong: I applied
fixes while the verify phase was still running, so the verifiers graded my patched
tree instead of the commit under review. Their refutations mostly read
"the guard the finding asks for is already in the code".

## Shared surfaces touched

- **`packages/shared/src/index.ts`** — three `export *` lines. **Additive only.**
  No existing export changed, renamed or removed. Nothing another lane consumes
  today has a different shape.
- **`packages/shared/src/studio/`** — a NEW directory. Nothing imports it yet
  except the one test in `apps/web`.
- **No migration, no contract change to an existing type, no price, no ledger
  path.** `packages/shared/CLAUDE.md` requires a zod schema for a new type and
  these are plain interfaces — see "not done" below.

## Contract, migration or money

**None.** Nothing here touches `pricing.config.json`, the ledger, a migration, or
any existing exported shape.

## Anything retracted

**Two, both mine, both corrected in `90dfd922`.**

1. I wrote that "not one number from `CONSTRAINTS` is copied into this file" while
   the same file's header listed the whole `imageDims` table fourteen lines above.
   True of the code, false of the prose. The claim now says which.
2. I wrote "the browser preview and the server export are the same string, so they
   cannot drift." That is true of LAYOUT and **false of TEXT** — font families
   resolve against different sets on each side and both substitute silently. The
   narrow true claim is now in `svg.ts`'s header: the layout cannot drift, the
   glyphs can.

Also corrected: a boundary test whose name stated a false measurement ("accepts
1200x627, one pixel shorter") while asserting on 629. 627 is **refused**
(1.9139 > 1.91) and 629 is **taller**. Both directions are asserted now.

## What was NOT done, and why

- **No UI, no route change, no database.** `/studio` is untouched and remains a
  roadmap page. That is deliberate: making it real means retargeting six e2e specs
  that pin it (`roadmap-honesty.spec.ts:182` is the allowlist entry), and this
  session had no mandate to move `/studio` off the roadmap.
- **The research brief asks for a Canva-like canvas with a layer panel. I did not
  build one, and it needs a decision** — see below.
- **No zod schemas.** `packages/shared/CLAUDE.md` says adding a type means adding
  its zod schema. These are plain interfaces because nothing crosses a trust
  boundary yet: no row is parsed and no request body is read. The moment a design
  is persisted, `DesignDocument` needs a schema, and that is owed.
- **Playwright is UNRUN.** Not blocked any more: `127b29c4` arrived from `wt-core`
  mid-session and the probe now reads **`LOCAL_ONLY`** rather than `NO_BROWSER`,
  with `SAHODA_BROWSER_VIA_NODE=1`. I did not run it because this diff adds no UI,
  so smoke coverage of it is nil.
- **`next build` and the js-budget leg are UNRUN** — the command was denied by
  sandbox permissions. This is the leg that would catch a barrel export pulling
  code into routes that never use the studio, and `packages/shared`'s own history
  has that precedent. **Run it before this merges.**
- **No font is chosen or bundled**, so `fontFamily` is a free string resolved
  against whatever the renderer can see. This is the feature's largest unproven
  assumption and it is recorded in `svg.ts`'s header.
- **The two forked OKLCH modules were left alone.** `apps/web/src/lib/brand/oklch.ts`
  and `packages/sites/src/theme/oklch.ts` are copies of one another with different
  signatures (`parseOklch` returns null in one and throws in the other). Unifying
  them is a real refactor across two packages. `paint.ts` does no colour maths
  rather than becoming a third copy.
- **`ops/state/qa.pending.json` is deliberately NOT committed, and I had the
  reason wrong twice before getting it right.** The QA logger hook recorded this
  session's own typecheck, lint and vitest runs there, so an earlier draft
  calling it "not my authored work" was inaccurate. But committing it is still
  wrong, and a pre-commit hook refuses it: the file is SCRATCH. Every gate run
  rewrites it and attributes the run to whichever card happens to be open
  (REQUESTS §18), so committing it drops one session's local run into every
  other lane's tree. Reverted with `git checkout --`. Anyone changing its SHAPE
  rather than its contents needs `ALLOW_QA_PENDING=1`.

## Gate

| leg | result | evidence |
| --- | --- | --- |
| `turbo typecheck` (shared + web, `--force`) | **PASS** | 9 tasks successful, 0 cached. Not a replay |
| `turbo lint` (shared + web, `--force`) | **PASS** | design-lint 1374 files, `raw hex 0`, spacing baseline 129 unmoved |
| `vitest` @sahoda/shared | **PASS** | 29 files, **455 tests** |
| `vitest` @sahoda/web | **2 FAILED / 5729 passed**, 11 skipped | both failures are `getaddrinfo ENOTFOUND db.rloztdhzfliyvpvxsgjl.supabase.co` in `privacy/export-drift.test.ts` |
| `prettier --check` on the diff | **PASS** | |
| `next build` + js-budget | **UNRUN** | command denied by sandbox permissions |
| Playwright `@smoke` | **UNRUN** | probe is `LOCAL_ONLY`; no UI in this diff |

**The 2 failures are the environment, not this diff, and that is measured rather
than assumed:** with my work stashed (`git stash push -u`), the same two tests
fail with the same DNS error on a clean tree. Grouped by error message they are
one cause: this sandbox cannot resolve the Supabase host.

## What the next session in THIS lane should pick up

1. **Run `next build` + js-budget.** The one gate leg this diff could plausibly
   break and the one I could not run.
2. **The free-canvas decision** — see below. Everything downstream depends on it.
3. **Choose and bundle a font**, then write the ink-fingerprint guard: committed
   ink widths for known Latin, Devanagari and Tamil strings at known sizes. That
   closes the largest unproven assumption. `raster.test.ts` already contains the
   control that MEASURES substitution being invisible today, so the day it stops
   being invisible is detectable.
4. **A `DesignDocument` zod schema**, the moment anything is persisted.
5. The templates-and-slots layer, then the UI, then the export action into the
   assets library. `uploadAsset` is the only INSERT into `assets` and a
   deterministic renderer producing byte-identical output twice will trip
   `findByContentHash` with "You already have this file" — a `studio_exports`
   table keyed `unique (design_id, content_sha256)` is the clean answer.

## Needs a decision

**The research brief and the FSD contradict each other, and I built to the FSD.**

`docs/02_FSD_SAHODA_LABS.md` §3.4 says: *"editable text/image slots only (no free
canvas in v1 — predictable output, low support burden)"*. The `/studio` page tells
customers the same thing today, in those words. The research brief asks for a
Canva-like canvas with a layers panel.

The brief's own core recommendation — deterministic layout and typography, with
generation only for imagery — is fully compatible with the FSD, and that is the
intersection I built. But `SvgScene` has free x/y positioning on every node, so
the machinery for a free canvas now exists even though nothing exposes it.

Four judges scored three architectures. SVG-first and slots-only tied at 31/40;
Konva lost at 17/40 with three fatal flaws, one of them that
`@napi-rs/canvas` is not a backend Konva supports. Each winner's fatal flaw is
fixed by the other, which is what I built: slots as data, rendered through a pure
SVG serialiser.

**The decision: does v1 expose a free canvas?** If yes, the `/studio` page's
promise to customers has to change in the same commit. If no, the editable surface
stays typed slots and `SvgScene` remains an internal representation only.

Second, smaller: **Polotno is $899/month and nobody has decided.** Nothing built
here depends on that decision — the serialiser is a pure function with no runtime,
so it can keep running alongside any engine that gets licensed later.

---

# Session 5 — the design studio, built (2026-08-28, later)

**Branch** `claude/divas-kickoff-03y2g2` at `e17b3f8a`. Lane `wt-divas2`. Pushed: yes.

## The answer first

**`/studio` is live.** It was a roadmap page this morning; it now saves designs,
renders them, and lets a person edit one. Six commits, and the single most
valuable thing found in the whole day is not a feature: **a brand colour handed
to the renderer as an OKLCH string rasterises to pure black, silently**, and
this product stores brand colours as OKLCH.

## What shipped, by commit

| SHA | what |
| --- | --- |
| `08a180ca` | `presets.ts`, `paint.ts`, `svg.ts` — the renderer and the colour rail |
| `90dfd922` | two runtime holes an adversarial review found, and four overclaims narrowed |
| `7c2127b5` | `[contract]` two tables, the document schema, the RLS test |
| `a9e2519f` | three templates, and two defects only a rendered PNG could find |
| `621859ee` | the brand palette, the read layer, the server actions |
| `e17b3f8a` | the gallery, the editor, and the six guards retargeted |

## Founder's rulings this session, all applied

| # | ruling | where it lives now |
| --- | --- | --- |
| 1 | slots, not a free canvas (my call, they deferred) | `document.ts` — there is nowhere to store a position |
| 2 | font, my call | Noto Sans + Indic, named in `TEMPLATE_FONT`. **Not yet bundled** |
| 4 | customers save their own templates | `studio_designs.is_template` |
| 5 | designs get saved | `20260828100000_studio_designs.sql` |
| 7 | 2 to 10 slides | `MAX_CAROUSEL_PAGES` |
| 8 | Polotno killed | nothing depends on it. It also removed the judges' main objection to layout-as-code |
| 9 | exports stay free | the page says so and it is true: no model call |
| 10 | /studio goes live | done, six guards retargeted |

## Guards, and the mutation that proved each

Fifteen mutations this session, every one applied, watched go red, reverted.

| guard | mutation | red |
| --- | --- | --- |
| preset table | claim a channel that refuses / drop one silently / excuse one the engine refuses | 2 / 1 / 1 |
| paint | accept `oklch(...)` | 3 |
| svg | stop escaping text / drop the data-URI rule / skip a refused node | 1 / 7 / 4 |
| the pixel guard | emit `oklch()` instead of hex | 3 in shared **and the PNG went black** |
| review fixes | remove `isPaint` / drop the anchor whitelist | 5 / 2 |
| RLS | no policies / a policy of `using (true)` | 4 / 4 |
| document | allow a layout / raise the cap / read empty as `''` | 1 / 1 / 3 |
| template | shrink the caption box / stop counting descenders / narrow a slot | 1 / 0 then 2 / 1 |
| emptiness | a failed read that says "no designs" / unreadable rows as empty | 1 / 2 |

**Two mutations taught more than the guards did.**

The RLS one: stripping the policies made four tests red but left "the other
tenant sees nothing" GREEN. `relrowsecurity` is true schema-wide regardless, so
removing policies denies *everything* and that assertion passed for entirely the
wrong reason. Only an over-permissive `using (true)` policy proves the read
guards. **Neither mutation alone proves that test.**

The descender one: zeroing the constant left all 35 template tests green,
because the fixed frames carry slack. A guard that passes for two values of its
own constant is not testing it, so the constant is pinned separately.

## What rendering found that no test had

I rendered the three templates to PNG and looked at them. Two real defects, both
invisible to every test that existed:

1. **The photo caption collided with the line beneath it.** Every number in the
   template was self-consistent. Descenders are not counted by a baseline.
   `textBlockFits` now catches it from the data, and immediately found a SECOND
   overflow no picture had shown: `statement`'s footnote only collides at two
   lines and every sample had one.
2. **Every `maxChars` was wrong.** `statement` offered 80 characters for a box
   that holds about 38. Nothing could have caught it: the limit was declared
   beside the geometry with no relationship a test could check. It is DERIVED
   now, from a character width MEASURED through the real rasteriser (mixed case
   0.61-0.64 em, ALL CAPS 0.753, Devanagari 0.395; the bound is 0.75 because a
   shop owner really does type "CLOSED TODAY").

**Looking at output is a check nothing else performs.** That is the lesson.

## Shared surfaces touched

- **`packages/shared/src/index.ts`** — six `export *` lines. Additive only.
- **`packages/shared/src/studio/`** and **`src/db/studio.ts`** — new.
- **`packages/db/tests/helpers/pglite-tenant.ts`** — ONE new key in
  `SHAPE_OVERRIDES`. Other lanes use this helper. Additive; the first override
  whose problem is a composite FOREIGN KEY rather than a CHECK.
- **`apps/web/src/lib/perf/read-waterfall.baseline.json`** — rewritten. It
  records /studio 6→7 and the new /studio/[id], AND picks up two routes I did
  not touch: `/assets` and `/report` each LOST a sequential read when
  `a64c1f88` moved them into a `Promise.all`. The ratchet only fails on growth,
  so that improvement sat unrecorded. **Real, correct, and not mine.**
- **`apps/web/src/lib/privacy/export-manifest.ts`**, **`docs/38`** — two tables
  added, count 52 → 54.
- **Four e2e specs** — see below.

## Contract, migration or money

- **`[contract]`** in `7c2127b5`: `DesignDocumentSchema` and two row schemas are
  new exports from `@sahoda/shared`. Additive; nothing existing changed shape.
- **A migration is WRITTEN AND NOT APPLIED.** `supabase db push` cannot run from
  this sandbox: DNS for `db.<ref>.supabase.co` does not resolve here, which is
  the same failure that fails two tests all day on a clean tree. The CLI is
  present (2.109.1) and no project is linked. **This push needs a human on a
  machine with network.**
- **No money.** Nothing touches `pricing.config.json` or the ledger. The page's
  "exports are free" claim is true: drawing is our own code.

## The six guards that pinned /studio, and what happened to each

| spec | what I did |
| --- | --- |
| `page.test.tsx` | **RETARGETED, not deleted.** Its sentence is gone; its claim inverted and moved to `lib/studio/emptiness.ts` |
| `roadmap-honesty.spec.ts` | **REPOINTED.** `/studio` was its ONLY entry, so removing it would have left the scan looping over zero routes reporting green. Now guards the five `/ads/*` screens; header word ONE → FIVE and still self-checks |
| `roadmap-figures-scan.spec.ts` | `/studio` removed; a stale comment about it quoting `carousel` corrected |
| `no-impossible-remedy.spec.ts` | `/studio` KEPT. The property is stronger on a real screen, not weaker. Its comment corrected |
| `every-section-loads.spec.ts` | unchanged; the title is still "Studio" |
| `design-audit.spec.ts` | archetype `roadmap · gallery` → `gallery · editor` |

## Anything retracted

**Three, all mine.**

1. "Not one number from `CONSTRAINTS` is copied" — false of my own header's
   explanatory table. True of the code; the claim now says which.
2. "The preview and the export cannot drift" — true of LAYOUT, **false of
   TEXT**. Two font families produce identical ink here; the renderer's header
   now states the narrow version.
3. `ops/state/qa.pending.json` — I said it was "not my authored work", then that
   it should be committed. Both wrong. It is scratch by policy and a pre-commit
   hook refuses it.

## What was NOT done, and why

- **`next build` and the JS-size check are UNRUN.** The command is denied by
  sandbox permissions. This is the leg most likely to catch a problem from six
  new barrel exports, and `packages/shared`'s own history has that precedent.
  **Run it before this merges.**
- **Playwright is UNRUN.** 277 tests in 72 files still COLLECT, unchanged, so my
  four spec edits parse. But no browser here reaches the network. The four
  edited specs are reasoned, not executed. **The repointed
  `roadmap-honesty` list is the one to watch:** I inferred the five `/ads/*`
  screens quote no figure from `grep` finding no `creditCost` call, which is
  strong but is not a run.
- **No export to the assets library yet.** `studio_exports` exists and nothing
  writes to it. The button is not built.
- **No carousels in the editor.** The schema holds 1-10 pages; the editor edits
  page one.
- **No image slots in the editor.** `photo-bottom` renders a picture when given
  bytes, and there is no picker yet.
- **No font is bundled.** `TEMPLATE_FONT` names Noto; nothing ships it. Until it
  does, the server and the browser may substitute differently and neither will
  say so. This is the feature's largest unproven assumption.
- **The two forked OKLCH modules were left alone.** Unifying them is a real
  refactor across two packages.

## Gate

| leg | result | evidence |
| --- | --- | --- |
| `turbo typecheck` (9 packages, `--force`) | **PASS** | 9 of 9, 0 cached |
| `turbo lint` (9 packages, `--force`) | **PASS** | design-lint 1379 files, raw hex 0 |
| `vitest` @sahoda/shared | **PASS** | 31 files, **509 tests** |
| `vitest` @sahoda/db | **1 FAIL / 681 pass** | the failure is `live-guard.test.ts`, PRE-EXISTING (proved by stash) |
| `vitest` @sahoda/web | **2 FAIL / 5748 pass** | both `export-drift.test.ts`, both `ENOTFOUND db.<ref>.supabase.co`, PRE-EXISTING |
| `prettier --check .` | **PASS** | |
| `next build` + js-budget | **UNRUN** | denied by sandbox permissions |
| Playwright `@smoke` | **UNRUN** | 277 tests collect; no browser network |

## What the next session in THIS lane should pick up

1. **Apply the migration.** Nothing works against a real database until then.
2. **Run `next build` and the smoke suite.** Both UNRUN and both mine to owe.
3. **Bundle the font**, then write the ink-fingerprint guard. `raster.test.ts`
   already holds the control that MEASURES substitution being invisible today.
4. **Export to the library.** `studio_exports` and its unique key are waiting;
   `uploadAsset` will refuse the second identical export and that table is the
   answer.
5. Image slots, then carousels.

## Needs a decision

- **A live database password is printed into test output** by
  `packages/db/tests/live-guard.test.ts`, which fails on a clean tree. Not mine
  and not from this work. Rotate the credential and stop the assertion echoing
  the value. Raised three times today, still open.
- **The free canvas.** I built slots per FSD 3.4 and you left the call to me.
  `SvgScene` already takes free positions, so a canvas is additive rather than a
  rewrite — but shipping one changes what `/studio` promises customers.
