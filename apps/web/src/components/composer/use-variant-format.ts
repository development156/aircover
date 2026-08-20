'use client'

import { useCallback, useRef, useState } from 'react'
import type { Channel } from '@sahoda/shared'
// The LEAF entry point, not the barrel. Anything reachable from a `'use client'`
// module must not touch `node:crypto`, which the barrel reaches through the X
// OAuth helper — it fails the production BUILD, not the gate.
import type { PostFormat } from '@sahoda/publishing/format'

import { setVariantFormat } from '@/app/actions/posts'

export type VariantFormats = Partial<Record<Channel, PostFormat | null>>

export interface VariantFormatApi {
  /** What the writer has chosen, per channel. `null` means nobody has said. */
  chosen: VariantFormats
  error: string | null
  set: (channel: Channel, format: PostFormat | null) => void
  /**
   * Push a choice that could not be stored yet, now that the row exists.
   *
   * Called after a successful variant save. `post_variants.format` cannot ride
   * along with the body — the compare-and-set function applied to production has
   * a fixed signature with no format among its arguments, and the row schema that
   * would carry one is frozen — so the format is a second write, and a second
   * write is exactly the kind of thing that silently does nothing.
   */
  reapply: (channel: Channel) => Promise<void>
}

/**
 * Per-channel post format, backed by `post_variants.format`.
 *
 * ── WHY PER CHANNEL, WHEN THE DELETED WIZARD HAD ONE FOR THE WHOLE POST ──────
 * Because the column is per channel and the product is per channel. The wizard's
 * Format step collected ONE answer and wrote it to every variant, so a carousel
 * for Instagram forced a carousel on X. The same body/format/limit split that
 * makes this product different applies here.
 */
export function useVariantFormat(postId: string | null, initial: VariantFormats): VariantFormatApi {
  const [chosen, setChosen] = useState<VariantFormats>(initial)
  const [error, setError] = useState<string | null>(null)
  /** What each row is KNOWN to hold, so a choice is not re-sent per render. */
  const applied = useRef<VariantFormats>({ ...initial })

  const write = useCallback(async (id: string, channel: Channel, format: PostFormat | null) => {
    const stored = await setVariantFormat(id, channel, format).catch(() => null)
    if (stored === null) {
      setError('Could not save that format — try again.')
      return
    }
    if (!stored.ok) {
      setError(stored.message)
      return
    }
    setError(null)
    // What LANDED, not what was asked for. This write is not a compare-and-set,
    // so another tab can have won — and echoing the request back would show a
    // choice the row does not hold. A `null` here with a non-null request means
    // there is no row yet; `reapply` carries it once the first save makes one.
    applied.current[channel] = stored.format
    if (stored.format !== null) setChosen((prev) => ({ ...prev, [channel]: stored.format }))
  }, [])

  const set = useCallback(
    (channel: Channel, format: PostFormat | null) => {
      setChosen((prev) => ({ ...prev, [channel]: format }))
      setError(null)
      if (postId === null) return
      void write(postId, channel, format)
    },
    [postId, write],
  )

  const reapply = useCallback(
    async (channel: Channel) => {
      if (postId === null) return
      const want = chosen[channel] ?? null
      if (want === null || applied.current[channel] === want) return
      await write(postId, channel, want)
    },
    [chosen, postId, write],
  )

  return { chosen, error, set, reapply }
}
