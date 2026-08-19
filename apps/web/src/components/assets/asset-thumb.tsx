'use client'

import { ImageOff } from 'lucide-react'

import type { AssetCard } from '@/lib/assets/view'
import { previewAlt } from '@/lib/assets/view'
import { cn } from '@/lib/utils'

/**
 * One library file's picture.
 *
 * ── WHY A `<img>` AND NOT `next/image` ───────────────────────────────────────
 * The `media` bucket is private. The URL is a Supabase signed link minted per
 * request and dead within the hour, so `next/image` would need it in
 * `remotePatterns` and would then cache an address that expires — serving a
 * broken image from its own cache long after the real file is fine. Same
 * reasoning as the composer's media pane, which reaches the same conclusion.
 *
 * ── A MISSING PREVIEW IS NOT A MISSING FILE ──────────────────────────────────
 * Signing fails independently of storage. When it does, the tile says the
 * preview could not be loaded — it does not hide the file, and it does not show
 * a generic picture that would read as "this is what your photo looks like".
 */
export function AssetThumb({ card, className }: { card: AssetCard; className?: string }) {
  if (card.previewUrl === null) {
    return (
      <div
        className={cn(
          'flex flex-col items-center justify-center gap-1.5 bg-s2 px-3 py-6 text-center',
          className,
        )}
      >
        <ImageOff size={18} strokeWidth={1.6} className="text-muted" aria-hidden />
        <span className="text-[11px] leading-tight text-muted">Preview unavailable</span>
      </div>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={card.previewUrl}
      alt={previewAlt(card)}
      loading="lazy"
      decoding="async"
      className={cn('bg-s2 object-cover', className)}
    />
  )
}
