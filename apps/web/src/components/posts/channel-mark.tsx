import Image from 'next/image'
import { MapPin } from 'lucide-react'
import type { Channel } from '@sahoda/shared'

/**
 * A platform's own logo.
 *
 * ── THE ONE PLACE BRAND COLOUR IS ALLOWED IN ───────────────────────────────────
 * docs/26 §1.6: platform marks keep their own brand colours, because that is
 * IDENTITY rather than UI chrome. It is the only exception in the system, and it
 * never leaks into a button, a surface or body text — which is why this is a
 * component and not a class anybody can reach for.
 *
 * Extracted out of the deleted create flow, where it was a private helper. Two
 * screens needed it and only one had it.
 */
const MARK: Partial<Record<Channel, string>> = {
  instagram: '/channels/instagram.png',
  linkedin: '/channels/linkedin.png',
  x: '/channels/x.png',
}

export interface ChannelMarkProps {
  channel: Channel
  size?: number
}

/** GBP ships no mark in the package; `google-ads.png` is a different product. */
export function ChannelMark({ channel, size = 18 }: ChannelMarkProps) {
  const src = MARK[channel]
  if (src === undefined) {
    return (
      <span
        aria-hidden
        data-channel={channel}
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
      className="shrink-0 rounded-sm"
    />
  )
}
