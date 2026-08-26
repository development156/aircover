import type { InboxPlatform } from '@sahoda/shared'

import { PLATFORM_LABELS } from '@/components/inbox/platform-label'

/**
 * The mark that says where a lead came from, at a glance.
 *
 * ── WHY A MONOGRAM AND NOT THE REAL LOGO ─────────────────────────────────────
 * The brief asked for the platform's logo. This ships a monogram instead, and
 * the substitution is stated rather than made quietly.
 *
 * `lucide-react@1.25` carries NO brand icons — MEASURED against its own type
 * declarations, `Instagram`, `Facebook` and `Twitter` are absent and only
 * generic marks (`AtSign`, `Globe`, `MessageCircle`, `Send`, `Store`) remain. So
 * a real logo means committing brand SVG assets, and hand-drawing a trademarked
 * mark from memory produces something visibly not-quite-right sitting beside a
 * customer's own enquiries.
 *
 * A monogram does the job the logo was asked to do — tell platforms apart in a
 * 24px square — without inventing artwork. Real assets later touch this file
 * only.
 *
 * ── EVERY PLATFORM GETS A DIFFERENT MARK, WHICH IS THE POINT ─────────────────
 * One generic bubble icon for all of them would be worse than no mark: it looks
 * like information and carries none. Names come from `PLATFORM_LABELS`, so a
 * platform added to the shared union is labelled here rather than falling
 * through to a default nobody notices.
 */

/**
 * Two characters at most — longer is unreadable at this size, and the full name
 * is in the expanded card, the `title` and the accessible name.
 */
const MONOGRAMS: Readonly<Record<InboxPlatform, string>> = {
  facebook: 'f',
  instagram: 'ig',
  whatsapp: 'wa',
  twitter: 'X',
  bluesky: 'bs',
  reddit: 'r',
  telegram: 'tg',
  googlebusiness: 'G',
}

/**
 * A platform this product has not modelled still gets a mark, built from its own
 * name. `platformLabel` takes the same view: the real string is more use to
 * somebody reporting a problem than our failure to recognise it.
 */
function monogramFor(platform: string): string {
  return MONOGRAMS[platform as InboxPlatform] ?? platform.slice(0, 2).toLowerCase()
}

export interface PlatformMarkProps {
  /** The raw platform key. Null renders nothing — a lead with no platform has none. */
  platform: string | null
}

export function PlatformMark({ platform }: PlatformMarkProps) {
  // Null is not a failure and gets no placeholder. A site-form lead genuinely
  // arrived on no platform, and a grey question mark would invent a gap.
  if (platform === null) return null

  const label = PLATFORM_LABELS[platform as InboxPlatform] ?? platform

  return (
    <span
      /**
       * `surface-ring` because `bg-s2` is a 1.04:1 step from the surface beneath
       * it — chrome, not separation. Anything that must read as a distinct
       * object carries its own edge (apps/web/CLAUDE.md).
       */
      className="surface-ring inline-flex size-6 shrink-0 select-none items-center justify-center rounded-full bg-s2 type-sm font-[550] text-muted"
      title={label}
    >
      {/*
        The monogram is decorative; the NAME is the fact. A screen reader gets
        the full platform name and never the initials, which would be read out
        letter by letter as noise.
      */}
      <span aria-hidden>{monogramFor(platform)}</span>
      <span className="sr-only">{label}</span>
    </span>
  )
}
