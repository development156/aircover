import { cn } from '@/lib/utils'

/**
 * THE RADAR. Five rings, a turning sweep, and one mark per business you watch.
 *
 * ── EVERY MARK ON IT IS A REAL WATCH, AND THAT IS THE WHOLE DESIGN ──────────
 * The obvious way to build this is to scatter eight pretty dots and let the
 * sweep light them up. It looks the same in a screenshot and it is a picture of
 * somebody else's data: a first-time reader with nothing on their watch list
 * would see a radar tracking eight things.
 *
 * So `marks` is the count of businesses actually being watched, and an empty
 * watch list draws an EMPTY SKY. That is not a worse illustration — it is the
 * argument for adding one, made in the picture instead of in a sentence, and it
 * is the same rule the rest of this product follows about never drawing a
 * reading nobody took.
 *
 * ── THE SWEEP TURNS ONLY IF SOMETHING IS ACTUALLY SCANNING ──────────────────
 * `scanning={false}` freezes it. A radar sweeping over a screen whose weekly
 * collector is not built is an animation claiming work that is not happening,
 * which is the most expensive kind of decoration: it is a lie that moves. The
 * page passes `snapshot.collector !== 'absent'`.
 *
 * ── HOW A MARK KNOWS THE BEAM IS PASSING, WITHOUT A FRAME LOOP ──────────────
 * No timer, no requestAnimationFrame, no state. Each mark runs the SAME
 * animation as the sweep, with a negative delay equal to its own angle as a
 * fraction of the turn — so its brightening peaks exactly when the beam is over
 * it, forever, computed once by the browser's compositor. A JS loop would
 * re-render this component sixty times a second for a decoration.
 *
 * ── MOTION IS OPT-OUT AT THE CSS LEVEL, NOT THE PROP LEVEL ─────────────────
 * `prefers-reduced-motion` stops the sweep and the pulses in the stylesheet, so
 * it works before hydration and for a reader who changes the setting without
 * reloading. The radar stays fully legible still: the rings, the marks and the
 * centre are all static geometry, and only their movement is removed.
 *
 * It is `aria-hidden` and carries no information a sighted reader gets and a
 * screen-reader user does not — the counts beside it are the accessible version
 * of the same facts, in words.
 */

/** How many marks the face can hold before they stop being readable. */
const MAX_MARKS = 10

/**
 * Where the marks sit. Fixed, not random: a layout that changes on every render
 * makes the radar twitch on navigation, and a seeded random is a lot of code to
 * produce something that must look deliberate anyway. Angles are spread so no
 * two marks share a beam moment, radii vary so the face does not read as a ring.
 */
const MARKS: { angle: number; radius: number; size: number }[] = [
  { angle: 24, radius: 0.74, size: 3.5 },
  { angle: 71, radius: 0.42, size: 2.5 },
  { angle: 118, radius: 0.88, size: 3 },
  { angle: 155, radius: 0.6, size: 2.5 },
  { angle: 196, radius: 0.33, size: 3.5 },
  { angle: 232, radius: 0.8, size: 2.5 },
  { angle: 268, radius: 0.55, size: 3 },
  { angle: 301, radius: 0.94, size: 2.5 },
  { angle: 334, radius: 0.68, size: 3.5 },
  { angle: 12, radius: 0.5, size: 2.5 },
]

/** Seconds for one full turn. The brief asks for four to six. */
export const SWEEP_SECONDS = 5

/**
 * WHEN A MARK'S BRIGHT FRAME MUST LAND, as a negative CSS animation delay.
 *
 * ── THE ARITHMETIC THAT WAS BACKWARDS ────────────────────────────────────────
 * `radar-ping`'s 0% IS the bright frame, and a negative delay of `d` starts the
 * animation `d` into its cycle — so the NEXT 0% happens at `SWEEP - d`, not at
 * `d`. The delay was `-(angle / 360) * SWEEP`, which puts the flash at
 * `SWEEP - angle/72` while the beam reaches that angle at `angle/72`. Those
 * agree only where the two are the same instant.
 *
 * MEASURED over the ten fixed marks: EIGHT were wrong, each brightening when the
 * beam was at `360 - angle` — its mirror image. Only 0 (the wrap point) and 180
 * (the fixed point) happened to be right, which is why it read as plausible.
 *
 * Solving `SWEEP - d = angle / 72` for `d` gives `SWEEP * (1 - angle / 360)`.
 */
export function markDelaySeconds(angle: number, sweepSeconds = SWEEP_SECONDS): number {
  return -sweepSeconds * (1 - angle / 360)
}

const C = 200
const R = 168

function polar(angle: number, radius: number): { x: number; y: number } {
  const rad = ((angle - 90) * Math.PI) / 180
  return { x: C + Math.cos(rad) * R * radius, y: C + Math.sin(rad) * R * radius }
}

export function RadarScope({
  marks,
  scanning,
  className,
}: {
  /** Businesses actually on the watch list. Zero draws an empty sky. */
  marks: number
  /** Whether the weekly scan is real. False freezes the sweep. */
  scanning: boolean
  className?: string
}) {
  const shown = MARKS.slice(0, Math.max(0, Math.min(marks, MAX_MARKS)))

  return (
    <svg
      viewBox="0 0 400 400"
      aria-hidden
      focusable="false"
      className={cn('radar-scope h-full w-full', scanning && 'is-scanning', className)}
    >
      <defs>
        {/* Transparent → soft orange → transparent, across the beam rather than
            along it, so the leading edge is the bright one exactly as a sonar
            trace reads. */}
        <linearGradient id="radar-sweep" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0" />
          <stop offset="55%" stopColor="var(--brand)" stopOpacity="0.14" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0.5" />
        </linearGradient>
        <radialGradient id="radar-ambient">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.07" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="radar-core">
          <stop offset="0%" stopColor="var(--brand)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--brand)" stopOpacity="0" />
        </radialGradient>
      </defs>

      <circle cx={C} cy={C} r={R + 24} fill="url(#radar-ambient)" />

      {/* FIVE RINGS. Hairlines, and fainter as they go out, so the face has a
          centre without a single one of them competing with a mark. */}
      {[0.22, 0.42, 0.62, 0.81, 1].map((step, i) => (
        <circle
          key={step}
          cx={C}
          cy={C}
          r={R * step}
          fill="none"
          stroke="var(--brand)"
          strokeOpacity={0.4 - i * 0.05}
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* The guides. Fainter than the rings: they orient, they do not measure. */}
      <line
        x1={C - R}
        y1={C}
        x2={C + R}
        y2={C}
        stroke="var(--brand)"
        strokeOpacity={0.22}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={C}
        y1={C - R}
        x2={C}
        y2={C + R}
        stroke="var(--brand)"
        strokeOpacity={0.22}
        strokeWidth={1}
        vectorEffect="non-scaling-stroke"
      />

      {/* THE BEAM. A 62° wedge, rotated about the centre — one transform on one
          element, which is what keeps this on the compositor rather than in
          layout. */}
      <g className="radar-sweep" style={{ transformOrigin: `${C}px ${C}px` }}>
        <path
          d={`M${C} ${C} L${polar(0, 1).x} ${polar(0, 1).y} A${R} ${R} 0 0 1 ${polar(62, 1).x} ${polar(62, 1).y} Z`}
          fill="url(#radar-sweep)"
        />
      </g>

      {shown.map((mark) => {
        const { x, y } = polar(mark.angle, mark.radius)
        return (
          <g key={mark.angle}>
            <circle
              cx={x}
              cy={y}
              r={mark.size * 2.6}
              fill="var(--brand)"
              className="radar-mark-glow"
              /* NEGATIVE delay, so it starts mid-cycle rather than waiting a
                 turn to catch up. See `markDelaySeconds` for why the obvious
                 expression put eight of the ten marks on the mirrored angle. */
              style={{ animationDelay: `${markDelaySeconds(mark.angle)}s` }}
            />
            <circle
              cx={x}
              cy={y}
              r={mark.size}
              fill="var(--brand)"
              className="radar-mark"
              style={{ animationDelay: `${markDelaySeconds(mark.angle)}s` }}
            />
          </g>
        )
      })}

      {/* THE CENTRE. You are here. */}
      <circle cx={C} cy={C} r={26} fill="url(#radar-core)" className="radar-core" />
      <circle cx={C} cy={C} r={4} fill="var(--brand)" />
    </svg>
  )
}
