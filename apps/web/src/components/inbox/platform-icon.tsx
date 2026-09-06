import {
  AtSign,
  Building2,
  Camera,
  Cloud,
  MessageCircle,
  MessagesSquare,
  Send,
  Users,
} from 'lucide-react'
import type { InboxPlatform } from '@sahoda/shared'

import { platformLabel } from './platform-label'

/**
 * One glyph per platform an `/inbox/*` row can carry.
 *
 * `lucide-react` ships no brand marks (Instagram, Facebook and X were removed for
 * licensing), so these are generic shapes rather than logos — the same constraint
 * `ChannelStatusList` already lives with for publish status. Colour always comes from
 * `currentColor`, so a caller sets tone with `className`, never a hex value.
 */
const PLATFORM_ICONS: Readonly<Record<InboxPlatform, typeof Camera>> = {
  instagram: Camera,
  facebook: Users,
  whatsapp: MessageCircle,
  twitter: AtSign,
  bluesky: Cloud,
  reddit: MessagesSquare,
  telegram: Send,
  googlebusiness: Building2,
}

export function PlatformIcon({
  platform,
  size = 14,
  className,
}: {
  platform: string
  size?: number
  className?: string
}) {
  const Icon =
    (PLATFORM_ICONS as Partial<Record<string, typeof Camera>>)[platform] ?? MessagesSquare
  return (
    <Icon
      size={size}
      strokeWidth={1.8}
      aria-label={platformLabel(platform)}
      className={className}
    />
  )
}
