/**
 * The platform marks the asset package does not ship, drawn rather than left as a
 * neutral placeholder.
 *
 * ── SIX MARKS NOW, NOT TWO ───────────────────────────────────────────────────
 * `public/channels/` ships ten PNGs and eight connect-only platforms landed on
 * 2026-08-26. Four of them — Discord, Reddit, Slack, Threads — have no shipped
 * asset, and Snapchat is named on the screen without being connectable. Every one
 * would otherwise have rendered as the same grey `CircleSlash`, which on a grid
 * of twenty tiles is not a placeholder, it is five tiles that look identical on a
 * screen whose entire job is telling platforms apart.
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

/** Brand colours for the four marks added 2026-08-26. Same rule: they never leave this file. */
const DISCORD_BLURPLE = '#5865F2'
const REDDIT_ORANGE = '#FF4500'
const SLACK_AUBERGINE = '#4A154B'
const THREADS_INK = '#101010'
const SNAPCHAT_YELLOW = '#FFFC00'

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

/**
 * Discord — a rounded speech tile with two eyes.
 *
 * Discord's identity is a face on a chat bubble. This keeps the bubble and the
 * two eyes, which is what makes it recognisable at 22px, without tracing the
 * company's own path data.
 */
export function DiscordMark({ size, className }: MarkProps) {
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
      <rect x="1" y="1" width="22" height="22" rx="6" fill={DISCORD_BLURPLE} />
      {/* The bubble, with a tail at the lower left so it reads as speech rather
          than as a plain rounded rectangle. */}
      <path
        d="M6 8.6c0-.9.72-1.6 1.6-1.6h8.8c.88 0 1.6.7 1.6 1.6v5.1c0 .9-.72 1.6-1.6 1.6h-4.7l-3.1 2.2c-.3.2-.7 0-.7-.36v-1.84H7.6c-.88 0-1.6-.7-1.6-1.6Z"
        fill="#FFFFFF"
      />
      <ellipse cx="10" cy="11.2" rx="1.15" ry="1.45" fill={DISCORD_BLURPLE} />
      <ellipse cx="14" cy="11.2" rx="1.15" ry="1.45" fill={DISCORD_BLURPLE} />
    </svg>
  )
}

/** Reddit — a round face with two antenna-less ears and a single aerial. */
export function RedditMark({ size, className }: MarkProps) {
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
      <circle cx="12" cy="12" r="11" fill={REDDIT_ORANGE} />
      {/* The aerial and its dot — the one feature that separates this from any
          other round white face. */}
      <path
        d="M14.3 5.4 15.1 9"
        stroke="#FFFFFF"
        strokeWidth="1.1"
        strokeLinecap="round"
        fill="none"
      />
      <circle cx="14.15" cy="5.2" r="1.35" fill="#FFFFFF" />
      <ellipse cx="12" cy="13.6" rx="6.4" ry="5" fill="#FFFFFF" />
      <circle cx="5.9" cy="12.2" r="1.9" fill="#FFFFFF" />
      <circle cx="18.1" cy="12.2" r="1.9" fill="#FFFFFF" />
      <circle cx="9.9" cy="13.1" r="1.05" fill={REDDIT_ORANGE} />
      <circle cx="14.1" cy="13.1" r="1.05" fill={REDDIT_ORANGE} />
      <path
        d="M9.5 15.7c.7.65 1.6.95 2.5.95s1.8-.3 2.5-.95"
        stroke={REDDIT_ORANGE}
        strokeWidth="1"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  )
}

/** Slack — four rounded bars pinwheeled around a centre. */
export function SlackMark({ size, className }: MarkProps) {
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
      <rect x="1" y="1" width="22" height="22" rx="6" fill={SLACK_AUBERGINE} />
      {/* The pinwheel: four identical capsules, each rotated a quarter turn about
          the centre. Rotational symmetry is the whole read at this size. */}
      <g fill="#FFFFFF">
        <rect x="10.75" y="4.5" width="2.5" height="8" rx="1.25" />
        <rect x="10.75" y="11.5" width="2.5" height="8" rx="1.25" />
        <rect x="4.5" y="10.75" width="8" height="2.5" rx="1.25" />
        <rect x="11.5" y="10.75" width="8" height="2.5" rx="1.25" />
      </g>
      <circle cx="12" cy="12" r="1.7" fill={SLACK_AUBERGINE} />
    </svg>
  )
}

/** Threads — the looping "@"-like stroke, drawn as one open path. */
export function ThreadsMark({ size, className }: MarkProps) {
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
      <rect x="1" y="1" width="22" height="22" rx="6" fill={THREADS_INK} />
      {/* Stroked, not filled: the mark is a single ribbon of constant width and a
          filled outline of it loses that at small sizes. */}
      <path
        d="M15.4 11.6c-1.9-.5-4.2-.4-4.2 1.2 0 1 .9 1.6 1.9 1.6 1.6 0 2.5-1.2 2.5-3.4 0-2.6-1.3-4.1-3.5-4.1-2.7 0-4.4 2-4.4 5.1 0 3.2 1.8 5.2 4.6 5.2 1.6 0 2.8-.5 3.7-1.4"
        stroke="#FFFFFF"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  )
}

/**
 * Snapchat — the ghost outline.
 *
 * Drawn even though Snapchat cannot be connected (403 `PLATFORM_BETA_RESTRICTED`),
 * because a named platform with no mark reads as a rendering fault rather than as
 * a door that is shut. The tile says why; the mark just has to be recognisable.
 */
export function SnapchatMark({ size, className }: MarkProps) {
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
      <rect x="1" y="1" width="22" height="22" rx="6" fill={SNAPCHAT_YELLOW} />
      {/* Ink, not white: the brand yellow is far too light to carry a white mark,
          and a mark nobody can see is the defect this whole file exists to fix. */}
      <path
        d="M12 5.2c2.3 0 3.6 1.7 3.6 3.9 0 .5-.05 1-.1 1.4.5.25 1 .1 1.35 0 .4-.12.75.15.75.5 0 .5-.75.8-1.35 1-.3.1-.5.2-.5.45 0 .55 1.6 2.35 3.05 2.75.3.08.4.35.25.6-.3.5-1.4.75-2.15.85-.15.25-.15.75-.35.95-.2.2-.7.08-1.25.02-.8-.08-1.65.05-2.35.6-.6.48-1.1.78-1.95.78s-1.35-.3-1.95-.78c-.7-.55-1.55-.68-2.35-.6-.55.06-1.05.18-1.25-.02-.2-.2-.2-.7-.35-.95-.75-.1-1.85-.35-2.15-.85-.15-.25-.05-.52.25-.6C4.65 15.1 6.25 13.3 6.25 12.75c0-.25-.2-.35-.5-.45-.6-.2-1.35-.5-1.35-1 0-.35.35-.62.75-.5.35.1.85.25 1.35 0-.05-.4-.1-.9-.1-1.4 0-2.2 1.3-3.9 3.6-3.9Z"
        fill="#111111"
      />
    </svg>
  )
}
