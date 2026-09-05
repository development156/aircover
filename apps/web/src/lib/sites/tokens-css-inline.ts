/**
 * Byte-for-byte inline of `packages/shared/tokens.css` (Design Tokens v4.0).
 *
 * The /sites preview needs this stylesheet as a STRING to inject into
 * `renderBundle`'s RenderContext. It used to be read from disk at request time
 * via `readFileSync(require.resolve('@sahoda/shared/tokens.css'))`, which works
 * in dev and FAILS in the deployed Vercel function: pnpm links
 * `node_modules/@sahoda/shared` as a symlink that the serverless bundle does
 * not recreate, so `require.resolve` cannot find the package. That threw, and
 * the throw took the whole /sites route down with a 500 on the first real
 * generated site (2026-07-20).
 *
 * Inlining removes the failure class outright — no filesystem, no module
 * resolution, no tracing config — and works identically under Turbopack (dev)
 * and webpack (build).
 *
 * DO NOT hand-edit. `tokens.css` remains the single source of truth;
 * `tokens-css-inline.test.ts` reads it from disk and fails if this copy drifts.
 * Regenerate with scripts/gen-tokens-inline.mjs rather than patching by hand.
 */
export const TOKENS_CSS = `/* ============================================================
   SAHODA LABS — Design Tokens v5.0

   Lives at: packages/shared/tokens.css — the SOURCE OF TRUTH for values.

   ── THE CANON, IN ONE PLACE ──────────────────────────────────────────
   SPEC:       docs/37_Design_System_v5.md  ← read this first
   SOLVER:     scripts/design/solve-v5.mjs  ← every ratio below is printed by it
   REFERENCE:  docs/design-inspiration/runey/ ← the named target
   LIVE REF:   /design-system                ← every primitive, every state

   v5 SUPERSEDES docs/26_Design_System_v4.md, which supersedes docs/08 and
   docs/ui-package/. docs/26 is kept, marked superseded in its header, because
   its REASONING is still the record of why several values are what they are —
   the Certainty System, the absence vocabulary, the two-tone focus ring and the
   reduced-motion delay fix all survive v5 unchanged and are documented there.

   ── WHAT v5 IS ──────────────────────────────────────────────────────
   A new system built to a named target: runey.app. Not a port of v4 and not a
   comparison. The values below marked MEASURED were sampled off the reference
   screenshots with Pillow; the values marked SOLVED are printed by
   scripts/design/solve-v5.mjs. Nothing here is a remembered number.

   THE FOUR MECHANISMS TAKEN FROM THE REFERENCE, each measured:

     1. SURFACES SEPARATE BY FILL, NOT BY LINE.  Page #fafafa, card #ffffff,
        and a border so faint it measured #fdfdfd — 1px of anti-aliasing. v4
        did the exact opposite (canvas == surface, separated by a hairline) and
        wrote a rationale for it; that rationale served a different target and
        is why the app reads flat and dense rather than calm. This single pair
        is the largest visual change in v5.

     2. VERY LARGE RADII, AS A LADDER.  Card 24px and rail 28px, both measured.
        Buttons are pills, always.

     3. A SOLID NEAR-BLACK RAIL AGAINST A VERY LIGHT CONTENT AREA. #171717,
        measured — and it is the same hex as dark mode's card, which is why the
        rail needs no second value when the theme flips. See INVERSE SURFACE.

     4. A RATIONED ACCENT.  See the COLOUR BUDGET note below; the measurement
        there is the most load-bearing number in this file.

   ── WHAT v5 DELIBERATELY DOES NOT TAKE FROM THE REFERENCE ───────────
   Runey codes deltas green-up / red-down. v5 does not, and this is not a
   preference. Severity and certainty here are carried by FILL WEIGHT, GLYPH and
   LABEL so they survive greyscale, re-theming and colour blindness (see THE
   CERTAINTY SYSTEM below). Orange replaces the reference's green; no red is
   introduced. What ports is the reference's RATION, not its hue-coding.

   ── NAMES ARE STABLE; VALUES MOVED ──────────────────────────────────
   Every token NAME in v4 survives, so every \`bg-s1\` / \`text-muted\` / \`type-h1\`
   call site in apps/web keeps compiling. This is the same contract v4 made with
   v3 and it is what makes a system change shippable in one lane. New names are
   ADDED (--r-xs, --r-xl, --t-xs, the glass block, the gradient block, the
   inverse-surface scope); none is removed.

   SPACING IS --space-N, NOT --s-N. --s1 / --s2 are SURFACE COLOURS here.
   ============================================================ */

:root {
  /* ---------- L1 · BRAND SOURCES (7 names — never rename) ---------- */
  --p: #ff6600; /* Sahoda Orange — the one brand colour. Unchanged from v4. */
  /* Text/icon ON the brand fill. MEASURED 7.15:1 against #ffffff's 2.94:1.
     This is not a taste call: \`brandSkinVars()\` — the Readability Guard every
     CUSTOMER theme passes through — returns ink when handed Sahoda's own
     orange. own-medicine.test.ts grades this file against that guard. */
  --pfg: #000000;
  --pstrong: #000000; /* primary hovers to BLACK: orange is the resting state,
                         black is the commitment. */

  /* THE HOVER'S OWN FOREGROUND, WHICH USED TO BE HARDCODED IN NINE COMPONENTS.
     \`--pfg\` is #000000 and stays #000000 in every theme, so it cannot label the
     hover fill on LIGHT: black on black. Every call site solved that the same
     way, by writing \`hover:text-white\` beside \`hover:bg-primary-strong\` — nine
     of them, in eight files, all correct and all light-only.
     That is docs/37 §19's warning exactly ("guards that grade TOKENS cannot see
     what COMPONENTS write"), and it is what made the dark fix below more than a
     one-line change: lightening \`--pstrong\` in dark while nine components still
     force white would have put white on #ff893e at 2.57:1. Now the pair moves
     together, per theme, and no component decides a colour. */
  --pstrong-fg: #ffffff; /* 21.0:1 on the black light-theme hover fill */

  /* Accent TEXT — links, and any orange word on a light surface.

     ── FOUNDER'S RULING, 2026-08-26: BRAND BRIGHTNESS OVER THE AA FLOOR ──────
     This token was #bd4b00 from v5 until now, and #bd4b00 was SOLVED rather
     than picked: it was the brightest orange that still cleared AA on all
     three light grounds. It was replaced with the brand orange on an explicit
     instruction, given with these measurements in hand and reaffirmed after
     they were put in writing. It is a deliberate trade, not an oversight, and
     it must not be quietly reverted by anyone who reads only the numbers.

     WHAT THE TRADE COSTS, MEASURED — every one of these is a real shortfall.

     THE FLAT GROUNDS:

       #ff6600  (SHIPPED) on #ffffff 2.94:1 · #fafafa 2.81:1 · #f2f2f3 2.62:1
       #bd4b00  (was)         5.04:1 / 4.82:1 / 4.50:1 — cleared AA on all three
       #c95100  (v4's value)  4.51:1 / 4.32:1 / 4.03:1 — rejected for v5 as BELOW AA

     AND THE TINTED GROUNDS, WHICH ARE WHERE ACCENT TEXT MOST OFTEN SITS — the
     settings section nav, badges, empty states, the palette, status marks. An
     earlier draft of this note listed only the flat three and read as complete;
     it understated the real floor by 0.39 and named 2.62 as the worst case when
     the worst case is 2.23. Composited, SHIPPED value first, (was) second:

       --t50  6%  over #ffffff → #fff6f0   2.75:1   (4.72:1)  ← the settings pill
       --t50  6%  over #fafafa → #faf1eb   2.63:1   (4.52:1)
       --t100 16% over #ffffff → #ffe7d6   2.47:1   (4.23:1)
       --t100 16% over #f2f2f3 → #f4dccc   2.23:1   (3.83:1)  ← the real floor

     WCAG AA body text wants 4.5:1 and large text wants 3:1. The shipped value
     clears NEITHER on ANY ground, flat or tinted. Accent text is therefore a
     legibility risk wherever it carries meaning a reader must actually read,
     and it is no longer safe to treat "it is orange, so it is a link" as an
     accessible affordance on its own — pair it with an underline, a weight
     step or an icon anywhere the colour is the only signal.

     NOT ONLY TEXT. \`--acc\` also paints a few BORDERS and focus outlines
     (\`border-accent\`, \`outline-accent\` — four admin call sites at the time of
     the ruling). Those are non-text UI boundaries: WCAG 1.4.11 wants 3:1 and
     they now measure 2.94:1 on white, having been 5.04:1. That is the same
     0.06 miss the FOCUS RING note further down this file cites as the reason
     the global ring is an ink core plus an orange halo rather than plain
     orange. Those four sites now do what that note forbids, and no spec covers
     the admin routes. Left standing pending a ruling — do not "fix" it by
     darkening --acc, which would reverse the ruling above by the back door.

     Dark is unaffected and always was: --acc is #ff6600 there too, and on
     #171717 it measures 6.11:1. This ruling closes the gap between the themes
     by moving light DOWN to dark's value, not by moving dark. */
  --acc: #ff6600;

  /* Tints are orange AT ALPHA, not solid steps, so they composite correctly on
     #ffffff, on #fafafa, on a well and on dark without a second set of values.
     Keep them in lightness order — an earlier pass inverted 100 and 300 and
     would have rendered orange text on 40% orange. */
  --t50: rgba(255, 102, 0, 0.06); /* light wash FILL */
  --t100: rgba(255, 102, 0, 0.16); /* stronger FILL — badge grounds */
  --t300: rgba(255, 102, 0, 0.4); /* BORDER / ring */

  /* ---------- L2 · BRAND (aliases into L1) ---------- */
  --brand: var(--p);
  --brand-ink: var(--pfg);
  --brand-deep: var(--pstrong);
  --brand-text: var(--acc);
  --brand-wash: var(--t50);
  --brand-tint: var(--t100);
  --brand-lift: var(--t300);

  /* ---------- L2 · ACHROMATIC NEUTRALS — THE LIGHT LADDER ----------
     MEASURED off docs/design-inspiration/runey/ (light captures):
       page ground #fafafa · card #ffffff · rail #171717 · divider #ebebeb

     THE RULE THIS LADDER ENCODES: a card is a card because it is BRIGHTER than
     the page, not because it has a line around it. The hairline is a backstop
     for the case where two surfaces meet at an angle the fill cannot describe.

     ADJACENT-PAIR FLOOR — light 1.03:1, measured by solve-v5.mjs:
       canvas    → surface    1.04:1
       surface   → surface-2  1.12:1
       surface-3 → surface-3  1.08:1
     The floor is DERIVED from the reference's own worst pair (1.04:1), not
     asserted. tonal-ladder.test.ts fails the build if any pair drops under it.
     v4's dark theme shipped --surface-2 BYTE-IDENTICAL to --surface (1.000:1);
     that is the defect this floor exists to catch. */
  --canvas: #fafafa; /* the page ground — NO LONGER white */
  --surface: #ffffff; /* cards, panels, sheets */
  --surface-2: #f2f2f3; /* a well INSIDE a card — inputs, code, table heads */

  /* ── INK DRAWN ON A CUSTOMER'S PHOTOGRAPH ──────────────────────────────────
     Not app chrome. These are the marks somebody draws ON their own picture in
     the Studio, and they are DELIBERATELY THEME-INDEPENDENT: a photograph does
     not follow our light and dark modes, so ink that flipped with the interface
     would vanish on half of everybody's pictures. A brand accent is worse still,
     since an orange arrow on a photograph of a sunset is invisible.

     Two of them, always drawn as a pair: the light stroke carries the edge
     behind it, so the mark reads on a night sky and on a white wall alike. They
     live here rather than as literals in the renderer because a colour anywhere
     in this product is a token, including one that lands on a canvas. */
  --photo-ink: #ffffff;
  --photo-ink-edge: #111111;
  --surface-3: #e9e9eb; /* hover / pressed */
  /* Hairlines. Softer than v4's #dcdcdc because they are no longer doing the
     structural work — the fill is. A line at v4's weight over the new fill
     ladder reads as a drawn box, which is the look v5 is moving away from. */
  --line: #e9e9ec;
  --line-firm: rgba(0, 0, 0, 0.28); /* dashed borders, deliberate dividers */
  --line-soft: rgba(0, 0, 0, 0.05); /* card inset rings */

  --ink: #000000; /* headings. 21:1 on --surface. */
  --ink-body: #000000; /* body text */
  /* SOLVED against all three light grounds: 7.20 / 6.90 / 6.44:1.
     Nudged from v4's #575756 to a neutral #57575a — the warm cast was a v3
     residue and this palette is achromatic. */
  --ink-mute: #57575a;
  /* DISABLED + DECORATIVE ONLY — 3.36:1 on --surface, never content text.
     Flattened to hex rather than left as rgba(): the Readability Guard mirrors
     this token as decimal RGB and can only parse 6-digit hex. */
  --ink-faint: #8c8c8c;
  --white: #ffffff;

  /* ---------- L2 · SEMANTIC ----------
     Strokes, icons and text only. NEVER large fills.
     THERE IS NO RED, GREEN OR AMBER IN THIS PALETTE. --danger and --warn are
     BOTH orange; they are told apart by fill weight and by the label, which is
     what survives a photocopier and a colour-blind reader. --ok and --info are
     achromatic, because "it worked" and "here is some context" are the two
     states that never need to shout. */
  --ok: #000000;
  --ok-bg: rgba(0, 0, 0, 0.04);
  --warn: #ff6600;
  --warn-bg: rgba(255, 102, 0, 0.06);
  --danger: #ff6600;
  --danger-bg: rgba(255, 102, 0, 0.06);
  --info: #57575a;
  --info-bg: rgba(0, 0, 0, 0.04);

  /* ---------- L2 · CHANNEL ACCENTS (platform-owned; marks only) ----------
     The one place a non-palette colour is allowed: a platform mark is identity,
     not UI chrome. It never leaks into buttons, text or surfaces. */
  --channel-instagram: #e1306c;
  --channel-google: #1a73e8;
  --channel-whatsapp: #25d366;
  --channel-x: #000000;
  --channel-linkedin: #0a66c2;

  /* ---------- L2 · CERTAINTY ---------- */
  --hatch: rgba(0, 0, 0, 0.16); /* simulated-state diagonal */

  /* ---------- L2 · TYPE ----------
     THE SCALE IS SIZED TO MEASURED DEMAND, which is the one thing v4's was not.

     MEASURED across apps/web/src on 2026-08-23: 859 hand-written \`text-[Npx]\`
     classes in 19 distinct values against a scale of 8 steps. Reading the
     distribution rather than the total changes the diagnosis completely:

        13px 290   12px 211   12.5px 110   11px 90   14px 52   15px 35
        10px 17    11.5px 13   20px 9      13.5px 8  … 9 more under 7 each

     636 of 859 — 74% — hand-write a size that ALREADY HAS A STEP. That is not
     a missing rung, it is a rung nobody reached for, and adding steps cannot
     fix it. The other 26% IS real gap: 12.5px is the third most-used size in
     the entire codebase and had no step at all.

     So v5 does two different things for two different defects:
       · the 74%  — design-lint rule 5 stays ratcheted, and the utilities are
                    named for the JOB (type-body, type-meta) not the size
       · the 26%  — the base moves 13px → 14px, which pulls 12.5/13 together
                    onto one step and gives 14px (52 uses) a home

     HALF-PIXEL SIZES ARE BANNED, and the reason is mechanical rather than
     tidy: 12.5px does not rasterise as half a pixel. The engine rounds per
     glyph run, so two adjacent 12.5px labels can land a whole pixel apart and
     a baseline can shift under a hover. 132 uses across four half-pixel values
     is the largest single source of the app's uneven vertical rhythm.

     WHY 14px AND NOT 13px. v4 chose 13px and wrote "the density is most of the
     look" — true, for the reference v4 was built to. v5's reference is not
     dense; it is generous, and the user is a shop owner meeting a marketing
     tool for the first time on a mid-range Android, not an operator scanning a
     terminal. 14px is the smallest step that stays comfortable on a cheap
     720p panel in daylight. 16px was rejected: this product has tables. */
  --sans:
    'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Devanagari',
    sans-serif;
  --mono: var(--sans);

  /* THE SCALE. Eleven steps, each named for its JOB.
     Weight is part of the step: the UI separates a label from its value with a
     half-step (550/650) instead of jumping to bold, and those weights exist
     only on a VARIABLE axis. Pin the weights in next/font and they round to
     500/600 and the whole hierarchy flattens. */
  --t-hero-num: 650 44px/44px var(--sans); /* the ONE big number per view */
  --t-display: 700 30px/36px var(--sans); /* a screen that is one statement */
  --t-h1: 650 24px/30px var(--sans); /* page title */
  --t-h2: 650 20px/26px var(--sans); /* section title */
  --t-h3: 650 16px/22px var(--sans); /* card title — was 15px */
  --t-body: 400 14px/22px var(--sans); /* THE BASE */
  --t-sm: 400 13px/18px var(--sans); /* secondary — absorbs 12.5px */
  --t-xs: 400 12px/16px var(--sans); /* meta, captions, table cells */
  --t-chip: 600 12px/16px var(--sans); /* a chip's own label */
  --t-eyebrow: 600 11px/14px var(--sans); /* uppercase section label */
  --t-eyebrow-ls: 0.06em;
  /* THE EMBED FIELD STEP. 16px is a constraint, not a taste: iOS Safari zooms
     the viewport on focus for any input below 16px, and the embeddable forms
     render inside somebody else's mobile page where that zoom cannot be
     undone. This is the one rung that exists because a browser insists on it. */
  --t-input-embed: 400 16px/22px var(--sans);

  /* ---------- L2 · TRACKING ----------
     Optical, not decorative: type set large needs NEGATIVE tracking to stop
     looking loose, type set at 11px uppercase needs positive tracking to stop
     looking cramped. One value per size band, never per component. */
  --ls-display: -0.022em; /* >=24px */
  --ls-heading: -0.008em; /* 16-20px */
  --ls-body: 0em; /* 12-14px */
  --ls-hero-num: -0.03em; /* figures are wide; the hero number needs the most */

  /* ---------- L2 · WORD SPACING — A CORRECTION, NOT A STYLE ----------
     THE FACE'S ONE DEFECT, MEASURED AND FIXED.

     Plus Jakarta Sans was chosen for its letterforms. Its WORD SPACE is too
     narrow to ship as-is, and the measurement is unambiguous — space advance as
     a fraction of the font size, read off the live document:

        Arial              14px/400              3.89px   27.8%   (a normal face)
        Plus Jakarta Sans  14px/400              2.00px   14.3%
        Plus Jakarta Sans  16px/650  -0.014em    2.77px   17.3%
        Plus Jakarta Sans  16px/650   0          3.00px   18.8%

     At 14.3% of an em the words run together: "Needs your attention" renders as
     one word at a glance, which was visible in a 3x crop of the shipped frame
     before this token existed. It matters most for the reader this product is
     for — someone meeting a marketing tool for the first time, on a phone.

     NEGATIVE TRACKING IS NOT THE CAUSE, and that is why the fix is not "stop
     tracking". Removing it entirely moves 17.3% -> 18.8%, still far under a
     normal face. The narrow space is the typeface's own metric.

     So the correction uses the one property that targets word gaps and leaves
     every letterform alone.

     IT MUST BE RE-DECLARED ON EVERY TYPE STEP, AND THAT IS NOT BELT-AND-BRACES.
     An \`em\` length in \`word-spacing\` computes to ABSOLUTE PIXELS against the
     element it is declared on, and what inherits is that computed pixel value —
     not the em. Declared once on \`html\` (16px) it becomes a flat 1.6px for the
     whole document, which is a different fraction at every step. MEASURED, and
     the tell is that three steps came back byte-identical:

        body 14px  3.61px  25.8%     h1  24px  5.08px  21.2%   <- under the floor
        sm   13px  3.61px  27.8%     meta 12px 3.61px  30.1%   <- and over it

     Three sizes, one advance. So each \`@utility type-*\` in globals.css carries
     its own \`word-spacing: var(--ws-word)\`, where the em resolves against that
     step's own size, and the root declaration stays only as the baseline for
     text that uses no type step. \`type-space.spec.ts\` measures the advance in a
     real browser — the only place a font's metrics exist — and fails below 22%
     of the size. It caught this. */
  --ws-word: 0.1em;

  /* ---------- L2 · SPACE (4pt scale) ---------- */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  /* NEW in v5. The reference's page rhythm is 64px between major regions and
     v4's ladder stopped at 48, so every screen that wanted more wrote it by
     hand. Two steps, not five — the gap between 48 and 64 is where a layout
     stops being spacing and starts being composition. */
  --space-16: 64px;
  --space-20: 80px;

  /* ---------- L2 · RADIUS ----------
     LOAD-BEARING FOR THE LOOK. MEASURED off the reference: card 24px (corner
     profile x112→x90 over 22 rows), rail 28px, buttons fully round.

     THE LADDER IS BY SURFACE SIZE, NOT BY IMPORTANCE. A chip inside a card
     takes a smaller radius than the card, always, or the two curves fight. The
     rule of thumb the ladder encodes: a nested surface's radius is the parent's
     minus one step. */
  --r-xs: 8px; /* a mark, a swatch, a 20px square */
  --r-sm: 12px; /* chips, badges, inputs, small buttons */
  --r: 16px; /* tiles, list rows, nav items */
  --r-md: 20px; /* segmented controls, wells, media */
  --r-lg: 24px; /* CARDS — measured */
  --r-xl: 28px; /* modals, drawers, the rail — measured */
  --r-full: 999px; /* every button, every pill */

  /* ---------- L2 · ELEVATION ----------
     The reference separates by FILL and the faintest border, not by shadow, and
     the measurement is unambiguous: at a card's edge the pixel reads #fdfdfd
     against a #fafafa page — one step, which is anti-aliasing, not a shadow.

     So a resting card gets NO shadow. A shadow means "this floats above the
     page", and only overlays float. */
  --sh-card: 0 1px 2px rgba(0, 0, 0, 0.03); /* barely there, and that is right */

  /* ---------- THE RESTING CARD'S LIFT, AND IT REVERSES THE RULING ABOVE ------
     The paragraph above says a resting card gets NO shadow, and that WAS the
     ruling. Founder's ruling, 2026-09-03, reverses it for the light theme only:
     the boxes should sit slightly above the white page. The value is his, to
     the digit.

     It is a separate token from \`--sh-card\` on purpose. \`--sh-card\` is 1px of
     contact shadow used by the /admin screens and by the interactive card's
     hover; this is a 18px diffusion used at REST by container cards. Folding
     them together would have moved the hover state and every admin panel with
     one edit, which is not what was asked for.

     ── AND IT IS EXACTLY ZERO IN DARK ────────────────────────────────────────
     Not a dimmer black: a fully transparent layer, so \`surface-ring-lift\`
     composites to the
     inset hairline alone and dark is byte-identical to what it renders today.
     A soft black bloom on a #0d0d0d ground is invisible at best, and at worst
     it muddies the edge the hairline is there to draw. The brief said light
     theme; this is what that means in a file that has two. */
  --sh-rest: 0 4px 18px rgba(0, 0, 0, 0.05);
  --sh-pop: 0 8px 28px rgba(0, 0, 0, 0.1); /* popovers, dropdowns */
  --sh-lg: 0 24px 64px rgba(0, 0, 0, 0.16); /* modals, drawers */
  --sh-brand: 0 8px 24px color-mix(in srgb, var(--p) 24%, transparent);

  /* ---------- L2 · GLASS ----------
     THE ONE PLACE THE BRIEF'S TWO WISHES COLLIDE, RESOLVED BY SURFACE ROLE.

     "Glassy and transparent" and "exactly like the reference" are not the same
     instruction: the reference's APP is not glass. Its rail is solid, its cards
     are opaque, its buttons are solid. The only glass in the whole product is
     its auth card floating over a gradient.

     THE RULE — GLASS ON CHROME, OPAQUE ON DATA:
       ALLOWED   topbar · rail · mobile bottom bar · command palette · modal
                 and drawer panels · toasts · the gradient layer itself
       FORBIDDEN every card, table, stat, chart, list row, form well — anything
                 that carries a value, a status or a certainty mark

     Two reasons, neither aesthetic:

     1. COST. backdrop-filter forces the compositor to re-read and re-blur the
        content behind the element on every frame it changes. On the mid-range
        Android these users are on, that is among the most expensive things a
        page can ask for. Chrome on chrome is a handful of fixed elements; glass
        on data is one per row.

     2. THE CERTAINTY SYSTEM SEPARATES MEASURED FROM INFERRED BY FILL WEIGHT.
        Translucency muddies fill weight by definition — a hatched inference
        over a busy background stops reading as hatched. A glass surface that
        must host a status-bearing element gives it an OPAQUE WELL
        (\`.glass-well\`) rather than letting the mark sit on the blur.

     --glass-blur is 20px because that is where the reference's own auth card
     lands; --glass-sat lifts saturation back because a blur desaturates what it
     samples and the result otherwise reads grey. */
  --glass-bg: rgba(255, 255, 255, 0.72);
  --glass-blur: 20px;
  --glass-sat: 1.6;
  --glass-line: rgba(0, 0, 0, 0.06);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.08);

  /* ---------- L2 · THE GRADIENT GROUND ----------
     A soft mesh behind everything, fixed, built in CSS rather than shipped as
     an image — an image cannot follow the theme, cannot scale to a 1920 canvas
     without banding, and costs a request on a phone.

     IT MUST NEVER COMPETE WITH CONTENT, and that is a measurable claim rather
     than a feeling: the gradient's strongest point must sit CLOSER to --canvas
     than one deliberate ladder step. solve-v5.mjs prints the ceiling —
     canvas→surface is 1.04:1 in light, so a wash measuring 1.03:1 against
     --canvas can never be mistaken for a surface edge. Light and dark are
     different gradients, not one inverted: in light the brand hue is the warm
     one and a cool counterpoint keeps it from reading as a stain; in dark the
     orange is nearly absent because on a #0d0d0d ground even 2% of it glows. */
  /* THE ALPHAS ARE SOLVED, NOT CHOSEN, and the first set FAILED the ceiling
     this file states. They shipped at 0.05 / 0.045 / 0.035, which composites to
     1.056:1 against --canvas — over the 1.03 ceiling AND over one whole ladder
     step (canvas->surface is 1.04), so the wash could read as a surface edge.
     \`glass-and-gradient.spec.ts\` measured it and refused.

     THE ALPHAS ARE QUANTISED TO n/255, BECAUSE THAT IS WHAT SHIPS. The second
     attempt solved to three decimals and dark came back at 1.031:1 — one
     thousandth over. CSS serialises a colour's alpha to 8 bits, so \`0.034\`
     leaves the build as \`#...09\`, i.e. 9/255 = 0.0353, a LARGER value than the
     one solved for. Solving in the units the browser stores is the difference
     between a value that passes on paper and one that passes in the document.
     These are the largest n/255 alphas whose composite stays at or under
     1.03:1. */
  --grad-1: rgba(255, 102, 0, 0.0275); /* warm — brand hue, top left. 7/255 */
  --grad-2: rgba(120, 140, 255, 0.0314); /* cool counterpoint, right. 8/255 */
  --grad-3: rgba(255, 160, 60, 0.0431); /* a second warm, low. 11/255 */
  --grad-base: var(--canvas);

  /* ---------- L2 · LAYOUT ---------- */
  --sidebar-w: 240px; /* labelled rail, >=1180 */
  /* Icon rail, the 700-1179 band. The reference measures 62px at a 1844px
     viewport; this is narrower because the constraint is different and it was
     MEASURED, not chosen: the rail is no longer flush, so its grid column costs
     its width PLUS two insets. At 68px + 2x10 that column took 88px where v4's
     flush 64px rail took 64 — 24px removed from the content column, at the one
     width where there is none to spare. The topbar overflowed by exactly 16px
     at 700px and \`connections-widths.spec.ts\` caught it.
     56 + 2x8 = 72px gives the 16px back and keeps the float visible. */
  --sidebar-w-collapsed: 56px;
  /* THE READER'S OWN COLLAPSE, and it is a different number for a stated
     reason rather than an inconsistency. Everything above is an argument about
     the 700-1179 band, where the content column has no spare pixels and the
     rail is collapsed whether anyone asked or not. At >=1180 nobody is short:
     a 62px rail plus two 8px insets is 78px out of at least 1180, and the
     founder's ruling names the reference's own 62 explicitly.
     So the forced collapse keeps the measured 56 and the CHOSEN one takes the
     reference's 62. Same idea as docs/37 sec 13's "take the reference's
     proportion, not its pixels" — the pixels are only wrong where the
     constraint is. */
  --sidebar-w-user-collapsed: 62px;
  /* THE RAIL FLOATS. The reference measures a 10px inset; this is 8px for the
     same reason the collapsed width is 56 — the inset is paid TWICE out of the
     content column, and at 700px there are no spare pixels. Still a visible
     float, and it is what makes the rail read as an object on the page rather
     than a wall beside it. Radius 28px, measured. */
  --rail-inset: 8px;
  --rail-r: var(--r-xl);
  --topbar-h: 60px;
  /* Widened from v4's 1080. The reference does not cap its content at all — at
     1844px it uses ~1710 of it. 1320 does not bind at 1440 (the width most of
     this product is looked at) and only starts working at 1920, where an
     uncapped table would otherwise run to a length nobody can track a row
     across. Prose is capped separately by --measure-prose. */
  --content-max: 1320px;
  --content-pad: 24px;
  --rail-w: 280px; /* Home only */
  --control-h: 38px; /* buttons, segmented controls — up from 34 */
  --input-h: 42px; /* text inputs, selects — up from 38 */
  /* The touch floor. The two above are correct for a mouse and too small for a
     thumb, so at narrow widths every INTERACTIVE control grows to this. It is a
     token rather than a literal because it must be the same number in the
     button, the input, the tab and the icon button. */
  --control-h-touch: 44px;

  /* ---------- L2 · SCRIM ---------- */
  --scrim: rgb(0 0 0 / 0.4);

  /* ---------- L2 · MEASURE ----------
     Space is the gap BETWEEN things; measure is the cap on ONE thing. */
  --measure-form: 720px; /* a label/control pair */
  --measure-prose: 640px; /* running prose — roughly 66ch at the 14px base */

  /* ---------- L2 · MOTION ---------- */
  --ease: cubic-bezier(0.2, 0, 0.2, 1);
  --ease-sweep: cubic-bezier(0.16, 1, 0.3, 1); /* blade-sweep signature only */
  --dur-fast: 140ms;
  --dur-base: 180ms;
  --dur-slow: 280ms;
  --stagger: 40ms;
  --stagger-cap: 8;
  --enter-lift: 6px;
  /* The ONE duration longer than --dur-slow, and it is not a transition. A
     count-up is a REVEAL of one settled value, not a move between two states. */
  --dur-count: 560ms;

  /* ---------- L3 · LEGACY ALIASES ----------
     Existing components only. NOTE --s1/--s2 stay SURFACE COLOURS. */
  --bg: var(--surface);
  --s1: var(--canvas);
  --s2: var(--surface-2);
  --muted: var(--ink-mute);
  --faint: var(--ink-faint);
  --ff: var(--sans);
  --r-input: var(--r-sm);
  --r-card: var(--r-lg);
  --r-pill: var(--r-full);
  --dur-1: var(--dur-fast);
  --dur-2: var(--dur-base);
}

/* ---------- DARK — A PEER, NOT AN INVERSION ----------
   Responds to [data-theme='dark'] AND .dark, because next-themes and Tailwind
   reach for the class while the app's own toggle sets the attribute. Running
   only one of the two is how a light dropdown ends up inside a dark panel.

   THE LADDER IS MEASURED OFF THE REFERENCE'S OWN DARK CAPTURE, not derived from
   the light one:  page #0d0d0d · card #171717 · raised #212121 · hover #292929

   ADJACENT-PAIR FLOOR — dark 1.06:1, and it is a DIFFERENT number from light's
   1.03 for a physical reason. In ΔL/1000 the light steps measure 44-111 and the
   dark steps 4.5-7.0: a 10-20x difference for pairs doing the same job, because
   sRGB is compressed near black. In CONTRAST they measure 1.04 and 1.08 — the
   same order. A floor written in ΔL would condemn a dark ladder that is fine,
   which is why the spec and the guard both use contrast.

     canvas → surface    1.08:1
     surface → surface-2 1.11:1
     surface-2 → -3      1.11:1

   v4 shipped --surface-2 BYTE-IDENTICAL to --surface here (1.000:1). 117 of 120
   frames carried a fill that separated nothing, and nothing could go red
   because a missing 4% fill reads as a design choice. tonal-ladder.test.ts is
   the guard that would have caught it. */
:root[data-theme='dark'],
[data-theme='dark'],
.dark {
  --canvas: #0d0d0d;
  --surface: #171717;
  --surface-2: #212121;
  --surface-3: #292929;
  --line: #333333;
  --line-firm: rgba(255, 255, 255, 0.3);
  --line-soft: rgba(255, 255, 255, 0.08);
  --ink: #ffffff;
  --ink-body: #ffffff;
  /* SOLVED, not picked. Light earns its hierarchy from the GAP between ink and
     mute — 21.0:1 vs 7.2:1, a 2.90x ratio-of-ratios. This reproduces that
     separation on #171717: 17.93:1 vs 6.14:1 is 2.92x, and 6.14:1 still clears
     AA body. A grey chosen by eye here makes secondary text nearly as loud as
     primary and every card reads flat. */
  --ink-mute: #979797;
  --ink-faint: #6f6f6f; /* 3.57:1 — decorative only, same ban as light */

  /* Orange does not shift between themes — the one fixed point in the palette.
     On #171717 it measures 6.11:1, so accent TEXT needs no darkened step here;
     --acc returns to the brand value. It is NOT re-pointed at a tint: a
     24%-alpha focus ring is invisible. */
  --acc: #ff6600;

  /* ── AND NEITHER DOES THE PRIMARY. ITS HOVER DID, AND POINTED AT THE PAGE ──
     \`--p\` and \`--pfg\` are deliberately absent from this block: orange is the
     fixed point above, and ink on it is 7.15:1 in both themes. \`--pstrong\` was
     absent too, and that was not the same decision — it was an omission. It
     inherited \`:root\`'s #000000, which on this theme's own \`--surface\` #171717
     measures 1.23:1, so every primary button in dark mode became a hole in its
     card at the moment somebody reached for it.

     \`brand-theme.ts\` states the rule beside the line implementing it: "The
     hover step moves AWAY from the page, in whichever direction that is.
     Darkening a dark-theme button on hover moved it towards its own background,
     so the loudest control in the product got quieter when you reached for it."
     Every CUSTOMER theme has followed it since the 2026-08-30 rail ruling. This
     one did not, which is the own-medicine defect in the theme most people use.

     SOLVED, NOT PICKED — \`brandSkinVars([], 'dark')['--pstrong']\`, the product's
     own solver asked about Sahoda orange on a dark ground:
     \`oklch(0.8008 0.2043 43.5)\`, which is L + (0.03 x 3.5) from \`--p\`.

       fill on --surface #171717   7.60:1   (was 1.23:1)
       fill on --canvas  #0d0d0d   8.24:1
       resting --p on #171717      6.11:1 -> 7.60:1 on hover

     The foreground flips WITH it. White cannot label this fill (2.57:1), and no
     fill white can label is brighter than the resting orange — which would make
     the button quieter on hover and reintroduce the defect from the other side.
     So dark's hover keeps INK, at 8.90:1, better than the resting 7.15:1.

     \`--brand-deep\` is NOT re-declared here, and that asymmetry with
     \`[data-surface='inverse']\` is the point: this selector matches <html>, the
     same element \`:root\` declares the alias on, so the var() substitution picks
     up the value below. Only a scope on a DESCENDANT needs the alias repeated.
     See the six-alias paragraph in that scope. */
  --pstrong: #ff893e;
  --pstrong-fg: #000000; /* 8.90:1 on the fill above */

  --channel-x: #ffffff; /* the X glyph is invisible on dark otherwise */

  --ok: #ffffff;
  --ok-bg: rgba(255, 255, 255, 0.06);
  --warn: #ff6600;
  --warn-bg: rgba(255, 102, 0, 0.12);
  --danger: #ff6600;
  --danger-bg: rgba(255, 102, 0, 0.12);
  --info: #979797;
  --info-bg: rgba(255, 255, 255, 0.06);

  --hatch: rgba(255, 255, 255, 0.2);

  /* Heavier than light's 0.4. Black at 40% over a #0d0d0d canvas is close to no
     scrim at all; the overlay has to separate from the page it covers, and in
     dark the fill cannot do that on its own. */
  --scrim: rgb(0 0 0 / 0.62);

  --sh-card: 0 1px 2px rgba(0, 0, 0, 0.5);
  --sh-pop: 0 8px 28px rgba(0, 0, 0, 0.6);
  --sh-lg: 0 24px 64px rgba(0, 0, 0, 0.7);
  /* OFF in dark, deliberately. See the light block for why it is zero rather
     than a dimmer black. */
  --sh-rest: 0 0 rgba(0, 0, 0, 0);

  /* Glass over a near-black ground needs a LIGHTENING veil, not a white one at
     lower alpha: white at 72% over #0d0d0d is a white panel. */
  --glass-bg: rgba(32, 32, 34, 0.72);
  --glass-line: rgba(255, 255, 255, 0.08);
  --glass-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);

  /* A DIFFERENT gradient, not the light one inverted. On a #0d0d0d ground even
     2% orange glows, so the warm stop drops to a third of its light value and
     the cool one carries most of the movement. */
  --grad-1: rgba(255, 102, 0, 0.0314); /* 8/255 */
  --grad-2: rgba(90, 110, 220, 0.0392); /* 10/255 */
  --grad-3: rgba(255, 140, 40, 0.0275); /* 7/255 */
}

/* ============================================================
   THE INVERSE SURFACE — a dark panel inside a light document.

   THE TRAP THIS EXISTS TO CLOSE. The rail is #171717 in BOTH themes. In dark
   that is simply --surface. In LIGHT it is an inverted context, and every token
   inside it is wrong: --ink is #000000, so \`text-ink\` on the rail is black on
   near-black, and --line is #e9e9ec, so a divider is a bright white scratch.
   The mirror-image failure — pairing --ink with a dark fill and getting
   white-on-white when the theme flips — is the same bug from the other side.

   Anything painted with a fill that does not follow the theme MUST re-declare
   its text tokens. This scope is that declaration, written once.

     <aside data-surface="inverse">   →  ink #ffffff (17.93:1)
                                         mute #979797 (6.14:1, AA body)
                                         acc  #ff6600 (6.11:1)

   The mute value is SOLVED the same way dark's is: it reproduces the light
   theme's 2.90x separation between primary and secondary text, landing at
   2.92x. Copying light's #57575a here would measure 1.6:1 and be unreadable;
   using #ffffff for both would remove the hierarchy entirely.
   ============================================================ */
[data-surface='inverse'] {
  /* The inverse scope IS the dark ladder, scoped to a subtree — not a
     one-colour patch. It shipped for ten minutes with --canvas equal to
     --surface, on the reasoning that a rail has no page behind it, and
     tonal-ladder.test.ts refused it. The guard was right: the moment anything
     nests inside the rail (an active pill, a well, a count badge) it needs a
     ground to sit on, and a scope with three rungs where the system promises
     four is the same hole in a smaller room. */
  --canvas: #0d0d0d;
  --surface: #171717;
  --surface-2: #212121;
  --surface-3: #292929;
  /* The inverse scope IS the dark ladder, so it takes dark's answer to the
     resting lift as well: off. Without this line a card nested inside an
     inverse subtree would inherit the LIGHT theme's soft black bloom onto a
     near-black ground. Nothing renders one there today; the line is here so
     that stays true rather than staying lucky. */
  --sh-rest: 0 0 rgba(0, 0, 0, 0);
  --line: rgba(255, 255, 255, 0.1);
  --line-firm: rgba(255, 255, 255, 0.3);
  --line-soft: rgba(255, 255, 255, 0.07);
  --ink: #ffffff;
  --ink-body: #ffffff;
  --ink-mute: #979797;
  --ink-faint: #6f6f6f;
  --acc: #ff6600;

  /* ── THE PRIMARY'S HOVER, WHICH POINTED AT THE GROUND ─────────────────────
     \`:root\` sets \`--pstrong: #000000\` and says why: "orange is the resting
     state, black is the commitment." That is right on a white page and exactly
     backwards here. Black on this scope's \`#171717\` measures **1.23:1** — the
     loudest control in the product becomes a hole in the panel at the moment
     somebody reaches for it. \`--p\` and \`--pfg\` are unaffected: orange is the
     one fixed point in the palette and \`--pfg\` is already ink.

     THE RULE IS NOT NEW AND NOT MINE. \`brand-theme.ts\` states it beside the
     line that implements it: "The hover step moves AWAY from the page, in
     whichever direction that is. Darkening a dark-theme button on hover moved
     it towards its own background, so the loudest control in the product got
     quieter when you reached for it." Every CUSTOMER theme has had this since
     the 2026-08-30 rail ruling — \`skin-css.ts\` builds this very scope from
     \`brandSkinVars(colors, 'dark')\`, which carries a lightened \`--pstrong\`.
     A workspace with no Brand Skin fell through to \`:root\` and got the black.
     So the app applied the rule to every tenant and not to itself, which is
     the defect \`own-medicine.test.ts\` exists for, in a scope it did not read.

     SOLVED, NOT PICKED. This is \`brandSkinVars([], 'dark')['--pstrong']\` — the
     product's own solver, asked about Sahoda orange on a dark ground:
     \`oklch(0.8008 0.2043 43.5)\`, which is L + (0.03 x 3.5) from \`--p\`.
     Flattened to hex like \`--ink-faint\`, because the Readability Guard mirrors
     these as decimal RGB and parses 6-digit hex only.

       fill on --surface #171717   7.60:1   (was 1.23:1)
       fill on --canvas  #0d0d0d   8.24:1
       --pfg #000000 on the fill   8.90:1   (resting orange is 7.15:1)
       resting --p on #171717      6.11:1 → 7.60:1 on hover

     The control gets LOUDER when reached for, and its own label gets more
     readable, not less. Graded by \`own-medicine.test.ts\`.

     STILL OPEN, deliberately out of this change: \`[data-theme='dark']\`
     declares none of \`--p\`, \`--pfg\` or \`--pstrong\`, so full dark mode inherits
     the same \`#000000\` on its own \`#171717\` cards. Same defect, wider blast
     radius, and it changes shipping pixels for real users. Reported, not
     silently fixed here. */
  --pstrong: #ff893e;
  --pstrong-fg: #000000; /* 8.90:1 on the fill above, the same pair dark uses */

  --ok: #ffffff;
  --info: #979797;
  --hatch: rgba(255, 255, 255, 0.2);
  --channel-x: #ffffff;

  /* ── THE SIX ALIASES, RE-DECLARED — AND THIS IS NOT TIDINESS ───────────────
     MEASURED 2026-08-23 by \`rail-collapse.spec.ts\`, in a browser, on the
     rendered colours: every label in the rail read **#57575a on #171717 —
     2.49:1** in LIGHT. That is the app's primary navigation, at every width,
     below the WCAG AA floor of 4.5, in the theme most people use. It is the
     founder's "the text is too faded", and it was a real defect rather than a
     preference.

     WHY IT SURVIVED EVERY CHECK. The block above already declares
     \`--ink-mute: #979797\` and the note beside it does the contrast arithmetic
     correctly. But components do not write \`--ink-mute\`; they write
     \`text-muted\`, which resolves \`--muted\`, which is declared in L3 as
     \`--muted: var(--ink-mute)\` — ON \`:root\`. A custom property whose value
     contains \`var()\` is substituted at computed-value time ON THE ELEMENT THAT
     DECLARES IT, and then inherits as that fixed colour. So \`--muted\` was
     already #57575a before the rail existed, and re-declaring \`--ink-mute\` on a
     DESCENDANT could not reach it.

     DARK NEVER SHOWED IT, which is why five audits of the dark frames came back
     clean: \`[data-theme='dark']\` matches <html>, the SAME element the alias is
     declared on, so there the substitution picks up the dark value and measures
     6.14:1. Only a scope on a descendant — this one — is affected, and this is
     the only such scope in the product.

     This is docs/37 §19's own warning arriving a second time: "Guards that
     grade TOKENS cannot see what COMPONENTS write. \`--pfg\` was correct for
     weeks while three components wrote \`text-white\` on a brand fill."
     \`tonal-ladder.test.ts\` grades this scope and passes, because every token it
     reads IS correct. The rendered guard is in \`rail-collapse.spec.ts\`.

     All six are listed, not just the one that was measured failing. \`--s2\` is
     the rail foot's hover fill and would have painted the LIGHT #f4f4f5 inside
     a dark panel; \`--s1\` is \`--canvas\`; \`--bg\` is \`--surface\`; \`--faint\` is
     \`--ink-faint\`. Every alias in L3 whose source this scope re-declares is
     re-declared here, because the next one to be reached for is the one nobody
     measured.

     \`--brand-deep\` is the sixth, added with \`--pstrong\` above and for exactly
     the reason this comment already gives: it is declared as
     \`--brand-deep: var(--pstrong)\` on \`:root\`, so it was substituted there and
     froze at #000000 before this scope existed. Re-declaring \`--pstrong\` alone
     would have fixed \`bg-primary-strong\` — \`@theme inline\` in
     \`apps/web/globals.css\` inlines the value, so that utility resolves here —
     and left \`bg-brand-deep\` black, which is the SAME bug in half the call
     sites. That is the "next one to be reached for" this paragraph warns
     about, caught on the paragraph that warns about it. */
  --bg: var(--surface);
  --s1: var(--canvas);
  --s2: var(--surface-2);
  --muted: var(--ink-mute);
  --faint: var(--ink-faint);
  --brand-deep: var(--pstrong);

  color: var(--ink-body);
}

/* ---------- GLOBAL FOCUS — one treatment, no per-component overrides ----------
   TWO-TONE, and that is a requirement rather than a flourish. WCAG 1.4.11 asks
   3:1 of a focus indicator against what surrounds it, and the brand orange
   measures 2.94:1 on white — it misses by 0.06. A near-identical darker orange
   (3.02:1) would pass the letter of the rule while being invisibly different,
   which is gaming the check rather than clearing it.

   So the ring is an INK core with an orange halo. The core carries the contrast
   (21:1 on light, and on the inverse surface --ink is white and carries it
   there), the halo carries the brand. It also reads on top of an orange fill,
   where a pure orange ring would disappear entirely — the one case a
   single-colour ring can never solve.

   --r-sm, not --r-full: the ring follows the CONTROL's radius via the element's
   own border-radius wherever one is set, and this is only the fallback. */
:focus-visible {
  outline: 2px solid var(--ink);
  outline-offset: 2px;
  box-shadow: 0 0 0 4px var(--brand-lift);
  border-radius: var(--r-sm);
}

::selection {
  background: rgba(255, 102, 0, 0.16);
  color: var(--ink);
}

/* The word-space correction, applied once at the root so every step inherits it.
   See --ws-word for the measurement.

   It CANNOT live in the \`--t-*\` steps: those are \`font\` shorthands, and the
   shorthand has no word-spacing slot at all — \`font:\` sets family, size,
   line-height, weight, style, stretch and variant, and word-spacing is a CSS
   Text property that simply is not part of it. Writing it there would not
   compile. One inherited declaration at the root reaches every step instead,
   and \`type-space.spec.ts\` proves it arrives. */
html {
  word-spacing: var(--ws-word);
}

/* ============================================================
   THE CERTAINTY SYSTEM — the signature. UNCHANGED FROM v4.

   Four levels of how real a thing is, each with a STRUCTURAL signature that
   survives recolour, greyscale and colour blindness. Apply to any status-
   bearing element: post chips, planner pills, publish logs, wallet entries.

   CERTAINTY IS NOT URGENCY. These four say how REAL a thing is, not how much it
   NEEDS YOU. A published post is maximally real and minimally urgent.

   IT IS SEPARATION BY FILL WEIGHT, AND THAT IS WHY IT MAY NOT SIT ON GLASS.
   solid → wash+ring → dashed → hatched is a ladder of INK COVERAGE. A
   translucent surface changes the coverage of everything on it, so the ladder
   stops being a ladder. A glass surface hosting one of these must put it in an
   opaque well. greyscale-certainty.test.ts proves the four rungs stay distinct
   by COMPOSITED LUMINANCE — comparing the colour strings would let two rungs
   pass on hue alone, which is the whole thing this system refuses to rely on.
   ============================================================ */

/* REAL — it happened. Solid fill, no border. Settled. */
.is-real {
  background: var(--brand);
  color: var(--brand-ink);
  border: 1px solid transparent;
}

/* COMMITTED — it will happen. Hairline + tint. Locked in.
   The ring is --brand-lift (orange 40%), not --brand-tint (16%): at 16% the
   border is invisible against the 6% wash it sits on, and the state would then
   rest on text colour alone. */
.is-committed {
  background: var(--brand-wash);
  color: var(--brand-text);
  border: 1px solid var(--brand-lift);
}

/* PROPOSED — Sahoda suggests. Dashed. Visibly provisional.
   Approving turns the dash solid: approval becomes a visible event. */
.is-proposed {
  background: transparent;
  color: var(--ink-mute);
  border: 1px dashed var(--line-firm);
}

/* SIMULATED — not real. Hatched, and ALWAYS carries a text label.
   Never render this without the label; the hatch alone is not a claim. */
.is-simulated {
  background-color: transparent;
  background-image: repeating-linear-gradient(-45deg, transparent 0 5px, var(--hatch) 5px 6px);
  color: var(--ink-mute);
  border: 1px solid var(--line-firm);
}

/* ============================================================
   THE ABSENCE VOCABULARY — three states, three treatments. UNCHANGED FROM v4.

   The most-rendered glyph in this product was an em dash meaning "nothing", and
   it was doing three different jobs at once:

     1. NOT YET MEASURED  the slot is real, the reading has not arrived
     2. UNREADABLE        we asked and the answer did not come back
     3. DOES NOT EXIST    there is no such quantity — OMIT THE SLOT

   Rendering 1 and 2 identically is the defect: "you have nothing yet" and
   "something is broken" led to the same dash. Rendering 3 at all is the other
   defect — \`100 of —\` invents a fraction with no denominator. There is no class
   for 3, on purpose.

   Both marks are RULES, not characters, so the difference is structural and
   survives greyscale. Both REQUIRE an accessible name: a rule with no name is a
   decoration a screen reader skips, which makes the absence invisible rather
   than legible.
   ============================================================ */

/* 1 · NOT YET MEASURED — a quiet solid rule. */
.is-unmeasured {
  display: inline-block;
  width: 14px;
  height: 2px;
  vertical-align: middle;
  border-radius: 1px;
  background: var(--line);
}

/* 2 · UNREADABLE — the same rule, BROKEN. Not an error state; an honest gap. */
.is-unreadable {
  display: inline-block;
  width: 14px;
  height: 2px;
  vertical-align: middle;
  background-image: linear-gradient(
    to right,
    var(--line-firm) 0 4px,
    transparent 4px 6px,
    var(--line-firm) 6px 10px,
    transparent 10px 12px,
    var(--line-firm) 12px 14px
  );
}

/* The blade marks AGENCY — Sahoda acted, rather than the user. One meaning. */
.blade {
  display: inline-block;
  width: 9px;
  height: 15px;
  background: var(--brand);
  border-radius: 100% 0 100% 0;
  flex: none;
}

/* Anything countable that the user is accountable for.
   Plus Jakarta Sans carries tabular figures, so this needs no second family. */
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
  font-feature-settings: 'tnum' 1;
}

/* ============================================================
   ENTRANCE — how content arrives.
   ONE keyframe for the whole product. A screen that fades, a screen that slides
   and a screen that scales read as three products. Travel is --enter-lift (6px)
   and it is deliberately small: an entrance you can watch is one you wait for.
   ============================================================ */
@keyframes sl-enter {
  from {
    opacity: 0;
    transform: translateY(var(--enter-lift));
  }
  to {
    opacity: 1;
    transform: none;
  }
}

.enter {
  animation: sl-enter var(--dur-base) var(--ease) both;
}

.enter-step {
  animation: sl-enter var(--dur-base) var(--ease) both;
  /* The cap lives HERE, in CSS, not mirrored in TypeScript. A call site passes
     its raw index and min() clamps it, so --stagger-cap stays the one place the
     ceiling is written. */
  animation-delay: calc(min(var(--i, 0), var(--stagger-cap)) * var(--stagger));
}

/* ---------- REDUCED MOTION ----------
   A STILL interface, and a FAST one. Zeroing the DURATION alone leaves the
   DELAY intact, so a staggered row with \`animation-delay: 320ms\` and
   \`fill: both\` stays invisible for 320ms and then snaps in — the person who
   asked for less motion gets a SLOWER, jumpier screen than everyone else. A
   stagger is a motion and its delay has to die with it.

   The gradient never animates in the first place (see .grad-ground), so there
   is nothing here to switch off for it — but if a later lane animates it, this
   block already stops it. */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
    animation-delay: 0ms !important;
    transition-delay: 0ms !important;
  }
}
`
