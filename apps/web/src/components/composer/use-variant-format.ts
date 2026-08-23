'use client'

import { useCallback, useRef, useState } from 'react'
import { CONSTRAINTS, type Channel } from '@sahoda/shared'
// The LEAF entry point, not the barrel. Anything reachable from a `'use client'`
// module must not touch `node:crypto`, which the barrel reaches through the X
// OAuth helper — it fails the production BUILD, not the gate.
import { defaultFormatFor, type PostFormat } from '@sahoda/publishing/format'

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
  /**
   * Open any channel the writer has just ADDED on its most common format.
   *
   * ── WHY THIS IS NOT SIMPLY A DEFAULT ────────────────────────────────────────
   * Because `null` is a real answer and must stay one. Every variant written
   * before 2026-08-19 has no format, and publishing now holds a version to
   * whatever it declares — so stamping "One photo" over a stored null would
   * invent an intent the writer never expressed, on rows that would then start
   * being refused.
   *
   * The distinction is whether a ROW EXISTS. A channel with a variant row was
   * written at some point and its silence is its own; a channel the writer just
   * ticked has never been written and has no silence to respect.
   */
  seedNew: (channels: readonly Channel[]) => void
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
export function useVariantFormat(
  postId: string | null,
  initial: VariantFormats,
  /** Channels that already have a `post_variants` row. Their silence is theirs. */
  existing: ReadonlySet<Channel>,
): VariantFormatApi {
  const [chosen, setChosen] = useState<VariantFormats>(initial)
  const [error, setError] = useState<string | null>(null)
  /** What each row is KNOWN to hold, so a choice is not re-sent per render. */
  const applied = useRef<VariantFormats>({ ...initial })

  const write = useCallback(async (id: string, channel: Channel, format: PostFormat | null) => {
    const stored = await setVariantFormat(id, channel, format).catch(() => null)
    if (stored === null) {
      setError('Could not save that format. Try again.')
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

  /**
   * Channels this hook has already answered for, so a re-render or a channel
   * being toggled off and on again does not overwrite a deliberate "Not stated".
   * A ref rather than state: seeding must not itself cause a render, and the
   * decision has to be readable inside the same tick it is made.
   */
  const seeded = useRef<Set<Channel>>(new Set(Object.keys(initial) as Channel[]))

  const seedNew = useCallback(
    (channels: readonly Channel[]) => {
      for (const channel of channels) {
        if (seeded.current.has(channel)) continue
        seeded.current.add(channel)
        // A row already exists, so this channel has been written before and its
        // absent format is an answer rather than a gap.
        if (existing.has(channel)) continue
        set(channel, defaultFormatFor(CONSTRAINTS[channel]))
      }
    },
    [existing, set],
  )

  return { chosen, error, set, reapply, seedNew }
}
