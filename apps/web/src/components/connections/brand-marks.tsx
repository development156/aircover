/**
 * The five platform marks the founder supplied on 2026-08-29, drawn to the
 * official geometry rather than to an evocation of it.
 *
 * ── WHAT THIS FILE REPLACES, AND WHY IT IS A SEPARATE FILE ───────────────────
 * `drawn-marks.tsx` opens by saying its marks "are NOT copies of either
 * company's logo file, and neither is a trademark-accurate reproduction", and
 * ends with "⚠ REPLACE BOTH with the official assets when they are licensed".
 * That is a promise about the whole file and it stays true of what is left in
 * it. These five are the opposite claim — the official shapes, supplied — so
 * they live apart rather than under a header that disclaims them.
 *
 * | channel   | what it rendered before                                   |
 * | --------- | --------------------------------------------------------- |
 * | facebook  | `facebook.png`, a glossy circular "f" in the 2013 style    |
 * | instagram | `instagram.png`, a glossy 3D camera in the same style      |
 * | gbp       | a map pin holding a striped shop awning, invented here     |
 * | pinterest | a red disc at 92% of the frame, invented here              |
 * | reddit    | an orange disc at 92% of the frame, invented here          |
 *
 * The two PNGs are the reason this was worth doing: they were the only marks on
 * the screen carrying gloss and drop shadows, so on a grid of fifteen flat tiles
 * they read as older than everything beside them.
 *
 * ── THE ONE PLACE RAW HEX IS ALLOWED ─────────────────────────────────────────
 * `docs/26_Design_System_v4.md` §1.6: "Platform marks keep their own brand
 * colours. That is identity, not UI chrome, and it is the only exception. It
 * never leaks into a button, a surface or body text." Every colour below stays
 * inside this file and is never lifted into a token.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────
 * Decorative, always — `aria-hidden`, no title, no role. Every call site renders
 * the channel's name beside the mark, so a name here would make a screen reader
 * announce "Instagram Instagram".
 *
 * ── WHY THE GRADIENT IDS ARE FIXED AND NOT GENERATED ─────────────────────────
 * `ChannelLogo` renders inside server components, so `useId` is not available
 * without making this whole file a client component and pushing it into the
 * browser bundle for no other reason. Two Instagram marks on one page therefore
 * emit the same two gradient ids. A browser resolves `url(#id)` to the first
 * match, and both definitions are byte-identical, so every instance paints the
 * same — the duplicate is inert rather than a defect waiting to surface.
 */

/** Facebook's brand blue. */
const FACEBOOK_BLUE = '#0866FF'

/** Google's four brand colours. */
const GOOGLE_BLUE = '#4285F4'
const GOOGLE_GREEN = '#34A853'
const GOOGLE_YELLOW = '#FBBC05'
const GOOGLE_RED = '#EA4335'

/** Instagram's gradient stops, warm corner first. */
const IG_YELLOW = '#FFDD55'
const IG_ORANGE = '#FF543E'
const IG_MAGENTA = '#C837AB'
const IG_BLUE = '#3771C8'

/** Pinterest's brand red. */
const PINTEREST_RED = '#E60023'

/** Reddit's brand orange. */
const REDDIT_ORANGE = '#FF4500'

/** The corner radius the supplied Facebook and Instagram icons share, as a
 *  fraction of the frame. Both are app icons and both are cut to the same
 *  squircle, so a single number keeps them a matched pair on the grid. */
const APP_ICON_RADIUS = 5.6

interface MarkProps {
  size: number
  className?: string
}

/** The attributes every mark repeats. Decorative, square, and sized in both the
 *  SVG box and the style, because a bare `width` loses to a flex parent.
 *
 *  `data-mark` names WHICH platform this is, and it is the only way a test can
 *  say so: these marks carry no text, no title and no accessible name, by
 *  design. Without it a screen that swapped a brand mark for a grey glyph would
 *  pass every assertion anyone could write about it, and the alternative —
 *  matching on a brand hex in a test file — is refused outright by
 *  `design-lint.mjs`, correctly. */
function frame(mark: string, size: number, className?: string) {
  return {
    'aria-hidden': true,
    'data-mark': mark,
    focusable: 'false' as const,
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    className,
    style: { width: size, height: size },
  }
}

/**
 * Facebook — the blue app icon with the white "f".
 *
 * The stem runs off the bottom edge of the tile rather than sitting inside it.
 * That is the mark as Facebook draws it, and it is also the detail that keeps
 * the glyph large enough to read at 22px.
 */
export function FacebookMark({ size, className }: MarkProps) {
  return (
    <svg {...frame('facebook', size, className)}>
      <rect width="24" height="24" rx={APP_ICON_RADIUS} fill={FACEBOOK_BLUE} />
      <path
        d="M15.36 24v-9.06h3.04l.46-3.53h-3.5V9.15c0-1.02.28-1.72 1.75-1.72h1.87V4.27a25 25 0 0 0-2.72-.14c-2.7 0-4.54 1.64-4.54 4.66v2.62H8.7v3.53h3.02V24Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

/**
 * Google — the four-colour "G", used for Google Business Profile.
 *
 * The mark it replaces was a map pin with a shop awning, drawn here to say "a
 * place, not a feed". It was doing honest work and it is still the more precise
 * idea, but it was also the one tile on the screen nobody recognised at a
 * glance, because it was not a logo anybody had seen before. Recognition beats
 * precision on a grid whose entire job is telling platforms apart.
 */
export function GoogleMark({ size, className }: MarkProps) {
  return (
    <svg {...frame('google', size, className)}>
      <path
        d="M23.52 12.27c0-.79-.07-1.55-.2-2.27H12v4.51h6.47a5.54 5.54 0 0 1-2.4 3.58v3h3.87c2.26-2.09 3.58-5.17 3.58-8.82Z"
        fill={GOOGLE_BLUE}
      />
      <path
        d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3A7.2 7.2 0 0 1 12 19.24a7.14 7.14 0 0 1-6.71-4.94l-4 3.1A12 12 0 0 0 12 24Z"
        fill={GOOGLE_GREEN}
      />
      <path d="M5.29 14.3a7.2 7.2 0 0 1 0-4.6l-4-3.1a12 12 0 0 0 0 10.8Z" fill={GOOGLE_YELLOW} />
      <path
        d="M12 4.77c1.77 0 3.35.61 4.6 1.8l3.44-3.44C17.95 1.19 15.23 0 12 0A12 12 0 0 0 1.29 6.6l4 3.1A7.14 7.14 0 0 1 12 4.77Z"
        fill={GOOGLE_RED}
      />
    </svg>
  )
}

/**
 * Instagram — the gradient app icon with the outlined camera.
 *
 * Two radial gradients, not one: the warm sweep runs from the bottom-left
 * corner, and a second blue wash sits over the top-left and fades out. A single
 * linear gradient gets the colours right and the corner wrong, which is the
 * whole character of this mark.
 */
export function InstagramMark({ size, className }: MarkProps) {
  return (
    <svg {...frame('instagram', size, className)}>
      <defs>
        <radialGradient id="sahoda-ig-warm" cx="0.28" cy="1.05" r="1.32">
          <stop offset="0" stopColor={IG_YELLOW} />
          <stop offset="0.1" stopColor={IG_YELLOW} />
          <stop offset="0.5" stopColor={IG_ORANGE} />
          <stop offset="1" stopColor={IG_MAGENTA} />
        </radialGradient>
        <radialGradient id="sahoda-ig-cool" cx="0.12" cy="0.04" r="0.92">
          <stop offset="0" stopColor={IG_BLUE} />
          <stop offset="1" stopColor={IG_BLUE} stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect width="24" height="24" rx={APP_ICON_RADIUS} fill="url(#sahoda-ig-warm)" />
      <rect width="24" height="24" rx={APP_ICON_RADIUS} fill="url(#sahoda-ig-cool)" />
      {/* The camera body, the lens and the flash. Stroked at 1.9 so the three
          shapes hold their weight against each other down at 22px. */}
      <rect
        x="5.1"
        y="5.1"
        width="13.8"
        height="13.8"
        rx="4.4"
        fill="none"
        stroke="#FFFFFF"
        strokeWidth="1.9"
      />
      <circle cx="12" cy="12" r="3.5" fill="none" stroke="#FFFFFF" strokeWidth="1.9" />
      <circle cx="16.65" cy="7.4" r="1.15" fill="#FFFFFF" />
    </svg>
  )
}

/**
 * Pinterest — the brand red disc carrying the white "P".
 *
 * Full-bleed, like the icon supplied. The disc it replaces sat at 92% of the
 * frame, which put a ring of surface around it that no other mark on the row
 * had, so it read a size smaller than everything beside it.
 */
export function PinterestMark({ size, className }: MarkProps) {
  return (
    <svg {...frame('pinterest', size, className)}>
      <circle cx="12" cy="12" r="12" fill={PINTEREST_RED} />
      {/* The letterform: a bowl on a stem whose tail falls below the baseline and
          curls left, which is the one feature separating it from a plain sans P. */}
      <path
        d="M12.45 4.6c-4.02 0-6.26 2.57-6.26 5.37 0 1.3.69 2.9 1.81 3.42.17.08.27.04.3-.13l.26-1c.02-.1.01-.18-.07-.27-.4-.49-.65-1.18-.65-1.9 0-2.3 1.73-4.35 4.5-4.35 2.46 0 3.8 1.5 3.8 3.5 0 2.62-1.16 4.84-2.89 4.84-.95 0-1.66-.78-1.43-1.75.28-1.15.8-2.4.8-3.23 0-.75-.4-1.37-1.23-1.37-.98 0-1.76 1.01-1.76 2.36 0 .86.29 1.44.29 1.44l-1.17 4.96c-.35 1.47-.06 3.26-.03 3.44.01.11.15.14.22.06.1-.13 1.27-1.58 1.67-3.03.11-.4.65-2.52.65-2.52.33.62 1.27 1.15 2.26 1.15 2.97 0 4.99-2.7 4.99-6.33 0-2.73-2.32-5.3-5.85-5.3Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}

/**
 * Reddit — the brand orange disc carrying the white face.
 *
 * Full-bleed for the same reason as Pinterest above. The aerial and its dot are
 * the feature that stops this reading as any other round white face, so they
 * keep their full length even though it costs headroom inside the disc.
 */
export function RedditMark({ size, className }: MarkProps) {
  return (
    <svg {...frame('reddit', size, className)}>
      <circle cx="12" cy="12" r="12" fill={REDDIT_ORANGE} />
      <path
        d="M14.55 4.9 15.4 8.7"
        stroke="#FFFFFF"
        strokeWidth="1.15"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14.4" cy="4.7" r="1.45" fill="#FFFFFF" />
      <ellipse cx="12" cy="13.7" rx="6.9" ry="5.35" fill="#FFFFFF" />
      <circle cx="5.3" cy="12.2" r="2.05" fill="#FFFFFF" />
      <circle cx="18.7" cy="12.2" r="2.05" fill="#FFFFFF" />
      <circle cx="9.75" cy="13.15" r="1.15" fill={REDDIT_ORANGE} />
      <circle cx="14.25" cy="13.15" r="1.15" fill={REDDIT_ORANGE} />
      <path
        d="M9.3 16c.75.7 1.7 1.03 2.7 1.03s1.95-.33 2.7-1.03"
        stroke={REDDIT_ORANGE}
        strokeWidth="1.05"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}
