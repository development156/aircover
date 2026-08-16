import Image from 'next/image'
import type { Channel } from '@sahoda/shared'
import { MapPin } from 'lucide-react'

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
 * leaks into buttons, text or surfaces.
 *
 * ACCESSIBILITY: decorative, always. Every call site renders the channel name
 * beside it (SPECIFICATION.md §11), so an alt text here would make a screen
 * reader say "Instagram Instagram".
 *
 * ── GOOGLE BUSINESS PROFILE HAS NO ASSET ─────────────────────────────────────
 * The package ships nine marks and GBP is not among them. `google-ads.png` is
 * Google ADS — a different product — so using it would mislabel the channel,
 * which is worse than having no logo. GBP therefore falls back to a neutral
 * glyph on a plain surface: obviously a placeholder, and never a wrong claim.
 * Replace it the moment a real mark exists; nothing else needs to change.
 */

const MARK: Partial<Record<Channel, string>> = {
  instagram: '/channels/instagram.png',
  linkedin: '/channels/linkedin.png',
  x: '/channels/x.png',
}

export function ChannelLogo({ channel, size = 22 }: { channel: Channel; size?: number }) {
  const src = MARK[channel]

  if (!src) {
    return (
      <span
        aria-hidden
        data-channel={channel}
        data-placeholder="true"
        className="grid shrink-0 place-items-center rounded-sm bg-s2 text-muted"
        style={{ width: size, height: size }}
      >
        <MapPin size={Math.round(size * 0.62)} strokeWidth={1.8} />
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
      className={cn('block shrink-0 object-contain')}
      style={{ width: size, height: size }}
    />
  )
}
