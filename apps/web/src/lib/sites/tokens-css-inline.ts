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
   SAHODA LABS — Design Tokens v4.0 "The Kit"
   Supersedes v3.0 "The Ledger" (warm neutrals + Outfit).

   Lives at: packages/shared/tokens.css
   Reference: docs/ui-package/sahoda-labs/ — the RENDERED output of
              theme/sahoda-tokens.css + theme/sahoda-components.css.
   Retheme guide: docs/ui-package/sahoda-labs/theme/RETHEME.md

   WHAT CHANGED FROM v3 — values only, no names.
   Every token NAME in v3 survives, so every \`bg-s1\` / \`text-muted\` /
   \`type-h1\` call site in apps/web keeps compiling and simply renders
   in the new palette. What moved is what the names RESOLVE TO:
     · warm neutrals (#fbfaf9 / #171514) -> achromatic (white / black)
     · Sahoda Orange #ff4b00 -> #ff6600
     · Outfit -> Inter (variable axis; 550 + 650 are load-bearing)
     · base body type 14px -> 13px (the density is most of the look)
     · solid brand tints -> orange at alpha (composites on any surface)

   THE PALETTE IS FIVE COLOURS. Everything else is one of them at
   reduced alpha. Platform marks (Instagram, LinkedIn, ...) keep their
   own brand colours because they are identity, not UI chrome — that is
   the only exception, and it never leaks into buttons, text or surfaces.

   THERE IS NO RED. Severity is carried by fill weight + glyph + label,
   never by hue (RETHEME.md §5). --danger and --warn are both orange on
   purpose; the four-rung ladder separates them by FILL, and the label
   does the rest. This survives greyscale and colour-blind viewers.

   THREE LAYERS — read before editing:
   L1  Brand Skin sources (--p ...). Brand Skin is CUT, but the seven
       names stay: apps/web/src/lib/brand/* still imports them and the
       whole L2 brand block aliases into them.
   L2  Semantic names. Brand-linked ones ALIAS INTO L1 so one flip
       retunes every surface. Neutrals and semantics are sources.
   L3  Legacy names (--bg, --s1, --muted ...) alias into L2 so existing
       components keep rendering. Delete an alias only when nothing
       references it.

   SPACING IS --space-N, NOT --s-N.
   The portable kit calls its spacing scale --sl-s1 ... --sl-s9. This
   file must NOT copy those names: --s1 / --s2 are SURFACE COLOURS here
   (158 references across apps/web), and redefining them as spacing
   turns \`background: var(--s1)\` into \`background: 4px\` and blanks every
   card in the app. The two scales are identical in value anyway
   (4/8/12/16/20/24/32/40/48) — use --space-N.
   ============================================================ */

:root {
  /* ---------- L1 · BRAND SOURCES (7 names — never rename) ---------- */
  --p: #ff6600; /* Sahoda Orange — the one brand colour */
  --pfg: #ffffff; /* text/icon ON primary. 3.13:1 — see NOTE below */
  --pstrong: #000000; /* primary hovers to BLACK, not a darker orange:
                             orange is the resting state, black is the
                             commitment (RETHEME.md §3) */
  --acc: #ff6600; /* links, accent text, FOCUS RING */
  /* Tints are orange AT ALPHA, not solid steps: they composite correctly
     on white, on --surface-2 and on dark without a second set of values.
     Chosen by USE, not by lightness —
       --t50  washes   (committed backgrounds)
       --t100 rings    (committed borders — must stay visible)
       --t300 lifts    (hover fills, dark-mode accents) */
  --t50: rgba(255, 102, 0, 0.06);
  --t100: rgba(255, 102, 0, 0.4);
  --t300: rgba(255, 102, 0, 0.24);

  /* ---------- L2 · BRAND (aliases into L1) ---------- */
  --brand: var(--p);
  --brand-ink: var(--pfg);
  --brand-deep: var(--pstrong);
  --brand-text: var(--acc);
  --brand-wash: var(--t50);
  --brand-tint: var(--t100);
  --brand-lift: var(--t300);

  /* ---------- L2 · ACHROMATIC NEUTRALS ----------
     Ground and card are the SAME white, separated by a hairline. That
     is deliberate: a card tinted off the page ground reads as a box
     inside a box, and it is why this UI reads flat and dense rather
     than puffy. Depth comes from the ring, not from a fill step. */
  --canvas: #ffffff; /* app background */
  --surface: #ffffff; /* cards, sidebar, topbar */
  --surface-2: #fafafa; /* wells, subtle fills, chrome */
  --surface-3: #f4f4f4; /* hover wash, pressed states */
  --line: #dcdcdc; /* hairlines — these do the structural work */
  --line-firm: rgba(0, 0, 0, 0.3); /* dashed borders, stronger dividers */
  --line-soft: rgba(0, 0, 0, 0.08); /* card inset rings */
  --ink: #000000; /* headings */
  --ink-body: #000000; /* body text */
  --ink-mute: #575756; /* secondary text — 7.0:1 on white */
  /* DISABLED + DECORATIVE ONLY — 3.54:1, never content text.
     Flattened to hex rather than left as rgba(0,0,0,.45): the Readability
     Guard mirrors this token as decimal RGB and can only parse 6-digit hex
     (guard-neutrals.test.ts). #8c8c8c IS black-45 composited on white. */
  --ink-faint: #8c8c8c;
  --white: #ffffff; /* was the one sanctioned hex in globals.css */

  /* ---------- L2 · SEMANTIC ----------
     Strokes, icons and text only. NEVER large fills.
     There is no red, green or amber in this palette (RETHEME.md §5).
     --danger and --warn are BOTH orange; they are told apart by fill
     weight and by the label, which is what survives a photocopier.
     --ok and --info are achromatic, because "it worked" and "here is
     some context" are the two states that never need to shout. */
  --ok: #000000;
  --ok-bg: rgba(0, 0, 0, 0.04);
  --warn: #ff6600;
  --warn-bg: rgba(255, 102, 0, 0.06);
  --danger: #ff6600;
  --danger-bg: rgba(255, 102, 0, 0.06);
  --info: #575756;
  --info-bg: rgba(0, 0, 0, 0.04);

  /* ---------- L2 · CHANNEL ACCENTS (platform-owned; chips only) ----------
     The one place a non-palette colour is allowed: a platform mark is
     identity, not UI chrome. It never leaks into buttons or text. */
  --channel-instagram: #e1306c;
  --channel-google: #1a73e8;
  --channel-whatsapp: #25d366;
  --channel-x: #000000;
  --channel-linkedin: #0a66c2;

  /* ---------- L2 · CERTAINTY ---------- */
  --hatch: rgba(0, 0, 0, 0.16); /* simulated-state diagonal */

  /* ---------- L2 · TYPE ----------
     Inter, variable axis. 550 and 650 are load-bearing, not decoration:
     the UI separates a label from its value with a half-step instead of
     jumping to bold. Load it as a VARIABLE font or they round to
     500/600 and the whole hierarchy flattens (RETHEME.md §2).

     The kit ships NO mono family, so --mono aliases --sans. The three
     places v3 used mono — the topbar credit pill, the Credits balance
     and eyebrow labels — are sans here; anything countable still gets
     tabular-nums, which Inter provides. */
  --sans:
    'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans Devanagari', sans-serif;
  --mono: var(--sans);

  /* Base is 13px, not 16px. This is the second biggest reason the
     reference reads denser than a stock dashboard (RETHEME.md §2). */
  --t-display: 700 30px/36px var(--sans);
  --t-h1: 600 24px/30px var(--sans);
  --t-h2: 600 20px/26px var(--sans);
  --t-body: 400 13px/20px var(--sans);
  --t-sm: 400 12px/18px var(--sans);
  --t-eyebrow: 600 11px/14px var(--sans);
  --t-eyebrow-ls: 0.06em;

  /* ---------- L2 · SPACE (4pt scale) ----------
     --space-N. Do NOT introduce --s1/--s2 — see header. */
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;

  /* ---------- L2 · RADIUS ---------- */
  --r-sm: 6px; /* buttons, inputs, badges, chips */
  --r: 8px; /* tiles, small surfaces */
  --r-md: 10px; /* segmented controls, larger controls */
  --r-lg: 12px; /* cards, nav items, wells */
  --r-full: 999px;

  /* ---------- L2 · ELEVATION ----------
     Hairline first. A shadow means "this floats above the page", so
     only overlays get one. Resting cards use an inset ring. */
  --sh-card: 0 1px 2px rgba(0, 0, 0, 0.04);
  --sh-pop: 0 4px 16px rgba(0, 0, 0, 0.08);
  --sh-lg: 0 16px 48px rgba(0, 0, 0, 0.14);
  /* Credits balance hero ONLY. color-mix keeps it tied to --p. */
  --sh-brand: 0 8px 24px color-mix(in srgb, var(--p) 24%, transparent);

  /* ---------- L2 · LAYOUT ---------- */
  --sidebar-w: 232px; /* collapses to 64px at 1180px and below */
  --sidebar-w-collapsed: 64px;
  --topbar-h: 56px;
  --content-max: 1080px; /* left-aligned; caps, leaves right whitespace */
  --content-pad: 24px;
  --rail-w: 280px; /* Home only */
  --control-h: 34px; /* buttons, segmented controls */
  --input-h: 38px; /* text inputs, selects */

  /* ---------- L2 · MOTION ---------- */
  --ease: cubic-bezier(0.2, 0, 0.2, 1);
  --ease-sweep: cubic-bezier(0.16, 1, 0.3, 1); /* blade-sweep signature only */
  --dur-fast: 140ms;
  --dur-base: 180ms;
  --dur-slow: 280ms;

  /* ---------- L3 · LEGACY ALIASES ----------
     Existing components only. Remove one at a time as surfaces migrate.
     NOTE --s1/--s2 stay SURFACE COLOURS here. That is deliberate. */
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
  /* --ink, --line, --ok, --warn, --danger, --info, --mono, --sh-card
     and --sh-pop already carry their legacy names above — no alias needed. */
}

/* ---------- DARK ----------
   Responds to [data-theme='dark'] AND .dark, because next-themes and
   Tailwind reach for the class while the app's own toggle sets the
   attribute. Running only one of the two is how a light dropdown ends
   up inside a dark panel (RETHEME.md §6). */
:root[data-theme='dark'],
[data-theme='dark'],
.dark {
  --canvas: #0b0b0c;
  --surface: #131315;
  --surface-2: #17171a;
  --surface-3: #1f1f23;
  --line: rgba(255, 255, 255, 0.14);
  --line-firm: rgba(255, 255, 255, 0.3);
  --line-soft: rgba(255, 255, 255, 0.1);
  --ink: #ffffff;
  --ink-body: #ffffff;
  --ink-mute: #dcdcdc; /* not #575756 — grey dies on black */
  --ink-faint: rgba(255, 255, 255, 0.45);

  /* Orange does not shift between themes — the one fixed point. It is
     NOT re-pointed at a tint here: a 24%-alpha focus ring is invisible. */
  --acc: #ff6600;
  --channel-x: #ffffff; /* the X glyph is invisible on dark otherwise */

  --ok: #ffffff;
  --ok-bg: rgba(255, 255, 255, 0.06);
  --warn: #ff6600;
  --warn-bg: rgba(255, 102, 0, 0.12);
  --danger: #ff6600;
  --danger-bg: rgba(255, 102, 0, 0.12);
  --info: #dcdcdc;
  --info-bg: rgba(255, 255, 255, 0.06);

  --hatch: rgba(255, 255, 255, 0.2);
  --sh-card: 0 1px 2px rgba(0, 0, 0, 0.5);
  --sh-pop: 0 4px 16px rgba(0, 0, 0, 0.6);
  --sh-lg: 0 16px 48px rgba(0, 0, 0, 0.7);
}

/* ---------- GLOBAL FOCUS — one treatment, no per-component overrides ---------- */
:focus-visible {
  outline: 2px solid var(--acc);
  outline-offset: 2px;
  border-radius: var(--r-sm);
}

::selection {
  background: rgba(255, 102, 0, 0.16);
  color: var(--ink);
}

/* ============================================================
   THE CERTAINTY SYSTEM — the signature.
   Four levels of how real a thing is, each with a STRUCTURAL
   signature that survives recolour, greyscale and colourblindness.
   Apply to any status-bearing element: post chips, planner pills,
   publish logs, wallet entries.

   These now line up 1:1 with the kit's four-rung ladder
   (RETHEME.md §5), so a Certainty state and an .sl-badge rung are
   the same object seen from two angles:
     .is-real      = rung 1 urgent   solid orange
     .is-committed = rung 3 pending  orange ring on a wash
     .is-proposed  = rung 4 calm     grey outline, dashed
     .is-simulated = (no rung)       hatched, always labelled
   ============================================================ */

/* REAL — it happened. Solid fill, no border. Settled. */
.is-real {
  background: var(--brand);
  color: var(--brand-ink);
  border: 1px solid transparent;
}

/* COMMITTED — it will happen. Hairline + tint. Locked in. */
.is-committed {
  background: var(--brand-wash);
  color: var(--brand-text);
  border: 1px solid var(--brand-tint);
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

/* The blade marks AGENCY — Sahoda acted, rather than the user.
   One meaning only. */
.blade {
  display: inline-block;
  width: 9px;
  height: 15px;
  background: var(--brand);
  border-radius: 100% 0 100% 0;
  flex: none;
}

/* Anything countable that the user is accountable for. Inter carries
   tabular figures, so this no longer needs a second family. */
.num {
  font-family: var(--mono);
  font-variant-numeric: tabular-nums;
}

/* ---------- REDUCED MOTION — suppresses blade-sweep, mascot, confetti ---------- */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
`
