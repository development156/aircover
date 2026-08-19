/**
 * The two platform marks the asset package does not ship, drawn rather than left
 * as a neutral placeholder.
 *
 * ── WHY THESE ARE DRAWN AND NOT DOWNLOADED ───────────────────────────────────
 * `public/channels/` ships nine PNGs. Google Business Profile is not among them —
 * `google-ads.png` is a DIFFERENT Google product, and using it would mislabel the
 * channel, which is worse than having no logo. Pinterest is not among them either.
 * Both previously fell back to a grey map-pin, so on a screen whose whole subject
 * is "which channel is this", two of eight tiles rendered as the same anonymous
 * glyph.
 *
 * These are original SVGs evoking each platform's identity — they are NOT copies
 * of either company's logo file, and neither is a trademark-accurate reproduction.
 * ⚠ REPLACE BOTH with the official assets when they are licensed; nothing else
 * needs to change, because `ChannelLogo` is the only call site.
 *
 * ── THE ONE PLACE RAW HEX IS ALLOWED ─────────────────────────────────────────
 * `docs/26_Design_System_v4.md` §1.6: "Platform marks keep their own brand
 * colours. That is identity, not UI chrome, and it is the only exception. It never
 * leaks into a button, a surface or body text." These colours therefore stay
 * inside these two components and are never lifted into a token.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────
 * Decorative, always — `aria-hidden`, no title, no role. Every call site renders
 * the channel's name beside the mark, so a name here would make a screen reader
 * announce "Pinterest Pinterest".
 */

/** Google's four brand colours, used only inside the mark below. */
const GOOGLE_BLUE = '#4285F4'
const GOOGLE_RED = '#EA4335'
const GOOGLE_YELLOW = '#FBBC05'
const GOOGLE_GREEN = '#34A853'

/** Pinterest's brand red, used only inside the mark below. */
const PINTEREST_RED = '#E60023'

interface MarkProps {
  size: number
  className?: string
}

/**
 * Google Business Profile — a location pin holding a shop awning, striped in
 * Google's four colours.
 *
 * The pin says "a place on a map" and the awning says "a business", which between
 * them are the two things that distinguish this channel from every feed in the
 * list: it is where customers FIND you, not somewhere you post INTO.
 */
export function GoogleBusinessMark({ size, className }: MarkProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    >
      {/* The pin body: a teardrop, flat-bottomed so the storefront can sit in it. */}
      <path
        d="M12 1.6c-4.28 0-7.75 3.4-7.75 7.6 0 5.24 6.02 11.62 7.2 12.82a.77.77 0 0 0 1.1 0c1.18-1.2 7.2-7.58 7.2-12.82 0-4.2-3.47-7.6-7.75-7.6Z"
        fill={GOOGLE_BLUE}
      />
      {/* The awning, in the four colours, reading left to right. */}
      <path d="M6.6 7.3h2.7v2.02a1.35 1.01 0 0 1-2.7 0Z" fill={GOOGLE_RED} />
      <path d="M9.3 7.3H12v2.02a1.35 1.01 0 0 1-2.7 0Z" fill={GOOGLE_YELLOW} />
      <path d="M12 7.3h2.7v2.02a1.35 1.01 0 0 1-2.7 0Z" fill={GOOGLE_GREEN} />
      <path d="M14.7 7.3h2.7v2.02a1.35 1.01 0 0 1-2.7 0Z" fill={GOOGLE_RED} />
      {/* The shopfront below it, in the pin's own white so it reads as a cut-out. */}
      <path d="M7.35 10.5h9.3v4.6h-9.3Z" fill="#FFFFFF" />
      {/* The doorway — the detail that makes it a shop rather than a box. */}
      <path d="M13.1 11.6h2.4v3.5h-2.4Z" fill={GOOGLE_BLUE} />
      <path d="M8.5 11.6h3.4v2.1H8.5Z" fill={GOOGLE_BLUE} opacity="0.35" />
    </svg>
  )
}

/**
 * Pinterest — the brand's red disc carrying a white "P".
 *
 * Drawn as a disc rather than as the bare glyph because at 22px an outline "P"
 * loses against the Instagram and Facebook marks beside it, which are both solid
 * discs; a mark that disappears at tile size is not a mark.
 */
export function PinterestMark({ size, className }: MarkProps) {
  return (
    <svg
      aria-hidden
      focusable="false"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size }}
    >
      <circle cx="12" cy="12" r="11" fill={PINTEREST_RED} />
      {/* The "P": a bowl on a stem whose tail falls below the baseline, which is
          the one feature that separates this letterform from a plain sans "P". */}
      <path
        d="M12.4 5.6c-3.6 0-5.6 2.3-5.6 4.8 0 1.16.62 2.6 1.62 3.06.15.07.24.04.27-.11l.23-.9c.02-.09.01-.16-.06-.24-.36-.44-.58-1.06-.58-1.7 0-2.06 1.55-3.9 4.03-3.9 2.2 0 3.4 1.34 3.4 3.13 0 2.35-1.04 4.34-2.59 4.34-.85 0-1.49-.7-1.28-1.57.25-1.03.72-2.15.72-2.9 0-.67-.36-1.22-1.1-1.22-.88 0-1.58.9-1.58 2.11 0 .77.26 1.3.26 1.3l-1.05 4.44c-.31 1.32-.05 2.93-.03 3.09.01.1.14.12.2.05.08-.11 1.14-1.41 1.5-2.71.1-.37.58-2.26.58-2.26.29.55 1.13 1.03 2.02 1.03 2.66 0 4.47-2.42 4.47-5.67 0-2.45-2.08-4.75-5.24-4.75Z"
        fill="#FFFFFF"
      />
    </svg>
  )
}
