import Image from 'next/image'
import { CircleSlash } from 'lucide-react'

import { GoogleBusinessMark, PinterestMark } from '@/components/connections/drawn-marks'
import type { CatalogueChannel } from '@/lib/connections/catalogue'
import { cn } from '@/lib/utils'

/**
 * A platform mark, with NO container (RETHEME.md §4, item 2).
 *
 * "A logo inside a grey bordered box is a box inside a box." The mark sits
 * directly on the surface at its own size, and the row's own ring is the only
 * edge. This is one of the six things the kit calls out as what makes the
 * product look like itself rather than merely orange.
 *
 * Platform marks keep their own brand colours — the single exception to the
 * five-colour palette, because a logo is IDENTITY, not UI chrome. It never
 * leaks into buttons, text or surfaces (`docs/26_Design_System_v4.md` §1.6).
 *
 * ACCESSIBILITY: decorative, always. Every call site renders the channel name
 * beside it (SPECIFICATION.md §11), so an alt text here would make a screen
 * reader say "Instagram Instagram".
 *
 * ── EVERY CHANNEL IN THE CATALOGUE NOW HAS A MARK ────────────────────────────
 * This used to hold three PNGs and fall through to a grey map-pin for everything
 * else — which meant Google Business Profile rendered anonymously on the one
 * screen whose entire subject is telling channels apart. The package ships marks
 * for facebook, youtube and telegram that nothing was using; GBP and Pinterest
 * ship none and are drawn (`drawn-marks.tsx`).
 *
 * The fallback survives, and its glyph changed from a map-pin to `CircleSlash`.
 * A map-pin is a PLACE, so as a stand-in for a missing mark it read as a claim
 * about the channel rather than as an admission about us; the only channel it
 * ever actually stood in for was a listings product, which made the wrong reading
 * the plausible one. `CircleSlash` says "no mark", which is the true statement.
 */

const MARK: Partial<Record<CatalogueChannel, string>> = {
  instagram: '/channels/instagram.png',
  linkedin: '/channels/linkedin.png',
  x: '/channels/x.png',
  facebook: '/channels/facebook.png',
  youtube: '/channels/youtube.png',
  telegram: '/channels/telegram.png',
}

/** Marks with no shipped asset, drawn to scale instead of falling back. */
const DRAWN: Partial<Record<CatalogueChannel, typeof GoogleBusinessMark>> = {
  gbp: GoogleBusinessMark,
  pinterest: PinterestMark,
}

export function ChannelLogo({
  channel,
  size = 22,
  className,
}: {
  channel: CatalogueChannel
  size?: number
  className?: string
}) {
  const Drawn = DRAWN[channel]
  if (Drawn) {
    return <Drawn size={size} className={cn('block shrink-0', className)} />
  }

  const src = MARK[channel]
  if (!src) {
    return (
      <span
        aria-hidden
        data-channel={channel}
        data-placeholder="true"
        className={cn('grid shrink-0 place-items-center rounded-sm bg-s2 text-muted', className)}
        style={{ width: size, height: size }}
      >
        <CircleSlash size={Math.round(size * 0.62)} strokeWidth={1.8} />
      </span>
    )
  }

  return (
    <Image
      src={src}
      alt=""
      aria-hidden
      data-channel={channel}
      width={size}
      height={size}
      className={cn('block shrink-0 object-contain', className)}
      style={{ width: size, height: size }}
    />
  )
}
