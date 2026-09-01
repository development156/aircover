/**
 * The platform marks the asset package does not ship, drawn rather than left as a
 * neutral placeholder.
 *
 * ── FOUR MARKS NOW, NOT SEVEN ────────────────────────────────────────────────
 * Eight connect-only platforms landed on 2026-08-26 and several shipped no
 * asset, so every one would have rendered as the same grey `CircleSlash` — on a
 * screen whose entire job is telling platforms apart, five identical tiles is
 * not a placeholder.
 *
 * On 2026-08-29 the founder supplied official logos for Facebook, Google,
 * Instagram, Pinterest and Reddit. Google Business Profile, Pinterest and Reddit
 * therefore left this file for `brand-marks.tsx`, and what remains is the four
 * nobody has supplied: Discord, Slack, Threads and Snapchat.
 *
 * ── WHY THESE ARE DRAWN AND NOT DOWNLOADED ───────────────────────────────────
 * These are original SVGs evoking each platform's identity — they are NOT copies
 * of any company's logo file, and none is a trademark-accurate reproduction.
 * ⚠ REPLACE EACH with the official asset when it is supplied or licensed; the
 * pattern to follow is the file named above, and nothing else needs to change,
 * because `ChannelLogo` is the only call site.
 *
 * ── THE ONE PLACE RAW HEX IS ALLOWED ─────────────────────────────────────────
 * `docs/26_Design_System_v4.md` §1.6: "Platform marks keep their own brand
 * colours. That is identity, not UI chrome, and it is the only exception. It never
 * leaks into a button, a surface or body text." These colours therefore stay
 * inside these components and are never lifted into a token.
 *
 * ── ACCESSIBILITY ────────────────────────────────────────────────────────────
 * Decorative, always — `aria-hidden`, no title, no role. Every call site renders
 * the channel's name beside the mark, so a name here would make a screen reader
 * announce "Discord Discord".
 */

/** Brand colours for the four marks left here. They never leave this file. */
const DISCORD_BLURPLE = '#5865F2'
const SLACK_AUBERGINE = '#4A154B'
const THREADS_INK = '#101010'
const SNAPCHAT_YELLOW = '#FFFC00'

interface MarkProps {
  size: number
  className?: string
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
