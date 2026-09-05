/**
 * THE WARM DECORATION BEHIND A BAND, WRITTEN ONCE FOR BOTH OF THEM.
 *
 * ── THE DEFECT IT REPLACES ───────────────────────────────────────────────────
 * `planner-hero-art.tsx` drew a figurative calendar glyph with a clock badge,
 * sparkles and a dot field, in a `viewBox` of 860x260 — an aspect of 3.3:1 —
 * anchored with `preserveAspectRatio="xMaxYMid slice"`. Its own header promised
 * "keep the proportions, do not crop the calendar".
 *
 * MEASURED in Chromium at 1440: the hero band is 1352x118, an aspect of 11.5:1.
 * `slice` scales to COVER, so the art renders 1350px wide and 408px tall and the
 * band shows a 118px horizontal strip through its middle — straight through the
 * calendar. What reaches the screen is an orange bar and three floating rounded
 * rectangles that read as a rendering fault. This is not a regression from the
 * redesign: it renders identically at the band's ORIGINAL height, so the glyph
 * has never once been whole on this screen. No guard could see it, because
 * nothing measures a decoration and jsdom computes no layout.
 *
 * A glyph cannot be made to fit an 11.5:1 strip. Shrinking it to `meet` would
 * render it 118px wide in a 1352px band. So the band gets what a band can
 * actually hold, and what the redesign brief asks for in its own words: "very
 * light flowing light streaks".
 *
 * ── ONE DECORATION, TWO BANDS ────────────────────────────────────────────────
 * /planner carries two warm bands — the page header and the Plan my week card.
 * Written separately they drift, which is the whole complaint this redesign
 * answers. The sweep, the streaks and the stops live here.
 *
 * ── WHY THE GRADIENT IS ORANGE INTO NOTHING ──────────────────────────────────
 * The brief asks for "orange to peach to soft pink". This palette holds exactly
 * ONE chromatic colour for chrome: `--p`, #ff6600. There is no peach token and
 * no pink token, and the only pink in `tokens.css` is `--channel-instagram`,
 * whose own comment says it "never leaks into buttons, text or surfaces". So the
 * sweep runs `--t100` (orange at 16%) through `--t50` (6%) to transparent, which
 * reads as orange fading to peach on the warm ground and stops there. A third
 * hue means inventing a token, and a brand gaining a second colour is the
 * founder's decision, not a page's.
 *
 * The stops are `var()` in a style attribute rather than Tailwind's
 * `from-`/`via-`/`to-`: those emit `--tw-gradient-*` custom properties that have
 * to agree across four classes, and one declaration is easier to read. Raw hex
 * is banned in this tree and none is used.
 */
export function WarmBand({ strength = 'full' }: { strength?: 'full' | 'quiet' }) {
  const quiet = strength === 'quiet'
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: quiet
            ? 'linear-gradient(100deg, var(--t50) 0%, var(--t50) 38%, transparent 82%)'
            : 'linear-gradient(100deg, var(--t100) 0%, var(--t50) 46%, transparent 78%)',
        }}
      />
      {/* The streaks. Long, almost-flat arcs stroked in `--surface`, so they
          lighten the warm ground in light and lighten the dark ground in dark
          without a second token. `slice` crops rather than squashing, and the
          arcs are flat enough that a crop takes nothing recognisable away —
          which is exactly what the calendar glyph could not survive. */}
      <svg
        focusable="false"
        viewBox="0 0 900 160"
        preserveAspectRatio="xMidYMid slice"
        className="absolute inset-0 size-full"
        style={{ opacity: quiet ? 0.55 : 1 }}
      >
        <path
          d="M0 128 C 220 92, 380 74, 560 62 C 700 52, 820 40, 900 22"
          stroke="var(--surface)"
          strokeWidth="16"
          fill="none"
          opacity="0.5"
        />
        <path
          d="M0 152 C 240 122, 420 108, 610 96 C 760 86, 850 76, 900 64"
          stroke="var(--surface)"
          strokeWidth="9"
          fill="none"
          opacity="0.35"
        />
      </svg>
    </div>
  )
}
