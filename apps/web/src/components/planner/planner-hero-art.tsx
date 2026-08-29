/**
 * The decorative banner behind the planner header.
 *
 * ── WHY IT IS DRAWN AND NOT A PNG ────────────────────────────────────────────
 * The founder supplied `a_clean_minimal_modern_ui_background_illustratio.png`
 * as the reference. The bytes never reached this sandbox, so this reproduces
 * its composition — a warm wave band sweeping from the right, a calendar with a
 * clock badge as the anchor, sparkles and a dot field — in vector.
 *
 * Vector is the better answer here even when the file IS available, for three
 * reasons this repo has already paid for:
 *
 *  1. `--brand-wash` and `--t50` FLIP between themes. A baked peach PNG stays
 *     peach in dark, where it becomes a bright slab on a dark ground. Every
 *     fill below is a token, so the art re-tints itself.
 *  2. `/planner` carries a JS and asset budget. The reference PNG is the same
 *     class of object as `public/brand/banner.png`, which is 1.1 MB. This is
 *     under 2 kB of markup and needs no request.
 *  3. Raw hex is banned in `apps/web/src` and design-lint enforces it at zero
 *     with no baseline. A PNG dodges that rule rather than satisfying it.
 *
 * If the founder wants the exact PNG, commit it to `public/brand/` and swap the
 * `<svg>` for an `<Image>` inside the same wrapper — the wrapper owns the
 * masking, the sizing and the reduced intensity, not this art.
 *
 * ── HOW IT STAYS OUT OF THE WAY ──────────────────────────────────────────────
 * `aria-hidden` and `pointer-events-none`: it is decoration and must never take
 * a tab stop or be read out. `preserveAspectRatio="xMaxYMid slice"` pins the
 * calendar glyph to the RIGHT edge, so narrowing the viewport crops the empty
 * left of the artwork rather than squashing the illustration — the founder's
 * "keep the proportions, do not crop the calendar" requirement, expressed as
 * the one attribute that actually decides it.
 */
export function PlannerHeroArt() {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 860 260"
      preserveAspectRatio="xMaxYMid slice"
      className="pointer-events-none absolute inset-0 size-full"
    >
      {/* The wave band. Two overlapping sweeps at low alpha rather than one at
          high: the reference's warmth comes from the OVERLAP, and a single
          flat fill reads as a coloured rectangle with a curved edge. */}
      <path
        d="M0 96 C 150 40, 300 12, 470 26 C 640 40, 740 8, 860 0 L860 260 L0 260 Z"
        fill="var(--t50)"
        opacity="0.55"
      />
      <path
        d="M300 260 C 430 190, 560 176, 700 150 C 780 136, 830 118, 860 96 L860 260 Z"
        fill="var(--brand-wash)"
        opacity="0.9"
      />

      {/* The dot field, left of the glyph — the reference's texture cue. */}
      <g fill="var(--t100)" opacity="0.7">
        {[0, 1, 2, 3, 4, 5].map((col) =>
          [0, 1, 2, 3].map((row) => (
            <circle key={`${col}-${row}`} cx={598 + col * 13} cy={92 + row * 13} r="1.6" />
          )),
        )}
      </g>

      {/* ── THE ANCHOR ──────────────────────────────────────────────────────
          A calendar with a clock badge, the one figurative object in the piece.
          Held to ~96px tall so it reads as a motif beside the heading rather
          than an illustration the heading sits on top of. */}
      <g transform="translate(700 74)">
        <rect x="0" y="10" width="96" height="86" rx="10" fill="var(--surface)" opacity="0.92" />
        <path
          d="M0 20 A10 10 0 0 1 10 10 H86 A10 10 0 0 1 96 20 V32 H0 Z"
          fill="var(--brand)"
          opacity="0.85"
        />
        <rect x="20" y="2" width="7" height="16" rx="3.5" fill="var(--brand-deep)" opacity="0.7" />
        <rect x="69" y="2" width="7" height="16" rx="3.5" fill="var(--brand-deep)" opacity="0.7" />
        {/* The day cells. Two rows of three, matching the reference. */}
        <g stroke="var(--brand)" strokeWidth="2" fill="none" opacity="0.55">
          {[0, 1, 2].map((col) =>
            [0, 1].map((row) => (
              <rect
                key={`${col}-${row}`}
                x={14 + col * 24}
                y={44 + row * 25}
                width="16"
                height="16"
                rx="4"
              />
            )),
          )}
        </g>
        {/* The clock badge, overlapping the lower-right corner. */}
        <circle cx="88" cy="88" r="18" fill="var(--brand)" />
        <path
          d="M88 78 V88 H96"
          stroke="var(--primary-foreground)"
          strokeWidth="2.6"
          strokeLinecap="round"
          fill="none"
        />
      </g>

      {/* Sparkles. Four-point stars, not circles — the reference's own mark. */}
      <g fill="var(--surface)" opacity="0.9">
        <path d="M812 60 l3.5 8.5 8.5 3.5 -8.5 3.5 -3.5 8.5 -3.5 -8.5 -8.5 -3.5 8.5 -3.5 Z" />
        <path d="M660 52 l2.2 5.4 5.4 2.2 -5.4 2.2 -2.2 5.4 -2.2 -5.4 -5.4 -2.2 5.4 -2.2 Z" />
      </g>
    </svg>
  )
}
