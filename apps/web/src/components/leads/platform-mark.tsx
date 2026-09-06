import type { InboxPlatform } from '@sahoda/shared'

import {
  FacebookMark,
  GoogleMark,
  InstagramMark,
  RedditMark,
} from '@/components/connections/brand-marks'
import { PLATFORM_LABELS } from '@/components/inbox/platform-label'

/**
 * The mark that says where a lead came from, at a glance.
 *
 * ── THE REAL LOGO WHERE ONE EXISTS, THE MONOGRAM WHERE IT DOES NOT ──────────
 * This file used to ship monograms for everything, and its own header explained
 * why: `lucide-react@1.25` carries no brand icons — still true, VERIFIED against
 * its type declarations, where `Instagram`, `Facebook` and `Twitter` are all
 * absent — so a real logo meant committing brand artwork, and hand-drawing a
 * trademarked mark from memory produces something visibly not-quite-right
 * sitting beside a customer's own enquiries.
 *
 * That artwork now exists. The founder supplied four of these on 2026-08-29 and
 * `connections/brand-marks.tsx` has drawn them to the official geometry ever
 * since, so the Connections screen showed a person the real Instagram icon while
 * this one showed them the letters "ig" for the same account. That header ended
 * "Real assets later touch this file only", and this is that edit.
 *
 * ── AND THE MONOGRAM STAYS FOR THE FOUR WITH NO ARTWORK ─────────────────────
 * WhatsApp, X, Bluesky and Telegram have no supplied mark, and a hand-drawn
 * approximation of one is the thing the original header refused. A monogram is
 * an honest stand-in; a wrong logo is not. So the fallback is not dead code kept
 * for tidiness — it is what half this list actually renders.
 *
 * ── EVERY PLATFORM GETS A DIFFERENT MARK, WHICH IS THE POINT ─────────────────
 * One generic bubble icon for all of them would be worse than no mark: it looks
 * like information and carries none. Names come from `PLATFORM_LABELS`, so a
 * platform added to the shared union is labelled here rather than falling
 * through to a default nobody notices.
 */

/**
 * The four platforms whose official mark this product actually holds.
 *
 * `googlebusiness` takes the Google mark: a Google Business Profile lead came
 * through Google, and the four-colour G is the mark a reader recognises. It is
 * the same pairing `connections/channel-logo.tsx` makes for the `gbp` channel,
 * so the two screens cannot disagree about what a Google listing looks like.
 */
const BRAND_MARK: Partial<Record<InboxPlatform, typeof InstagramMark>> = {
  instagram: InstagramMark,
  facebook: FacebookMark,
  reddit: RedditMark,
  googlebusiness: GoogleMark,
}

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
  const Mark = BRAND_MARK[platform as InboxPlatform]

  if (Mark) {
    return (
      // NO ring and no fill around it. docs/26 §1.6 lets a platform mark keep
      // its own brand colours because a logo is identity rather than UI chrome,
      // and RETHEME §4 then says a logo inside a bordered box is a box inside a
      // box. The monogram below needs both, because two grey letters with no
      // edge do not read as an object; a full-bleed brand tile already does.
      <span className="inline-flex size-6 shrink-0 items-center justify-center" title={label}>
        <Mark size={22} />
        <span className="sr-only">{label}</span>
      </span>
    )
  }

  return (
    <span
      /**
       * `surface-ring` because `bg-s2` is a 1.04:1 step from the surface beneath
       * it — chrome, not separation. Anything that must read as a distinct
       * object carries its own edge (apps/web/CLAUDE.md).
       */
      className="surface-ring inline-flex size-6 shrink-0 select-none items-center justify-center rounded-pill bg-s2 type-sm font-[550] text-muted"
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
