'use client'

import { useCallback, useState, type RefObject } from 'react'
import type { Channel, ChannelSet } from '@sahoda/shared'

import { cancelSchedule, schedulePost } from '@/app/actions/posts-schedule'
import type { AutosaveApi } from '@/components/posts/use-autosave'
import type { VariantsApi } from '@/components/posts/use-variants'

import type { VariantFormatApi } from './use-variant-format'

export interface ComposerActions {
  /** Write the post now and report WHICH ROW it landed in, or null on failure. */
  flushAndResolve: () => Promise<string | null>
  /** The same write, as a yes/no — the shape `PublishNow` and `ScheduleField` take. */
  flush: () => Promise<boolean>
  /** Save one channel's copy, and its format, in the order the row requires. */
  saveVersion: (channel: Channel) => Promise<boolean>
  saveAll: () => void
  savingAll: boolean
  /** Channels whose copy is not in their row yet, in the post's own order. */
  unsaved: Channel[]
  changeSchedule: (iso: string | null) => void
  scheduleError: string | null
}

/**
 * Everything the composer DOES, separated from what it shows.
 *
 * Extracted from `composer.tsx` when that file crossed the 300-line rule, and the
 * seam is not arbitrary: below is every write the screen can make, and the order
 * each one has to happen in. Those orderings are the part that breaks.
 */
export function useComposerActions(
  autosave: AutosaveApi,
  variants: VariantsApi,
  formats: VariantFormatApi,
  channels: ChannelSet,
  /** The row being written to, read at call time. See `composer.tsx`. */
  postIdRef: RefObject<string | null>,
): ComposerActions {
  const [scheduleError, setScheduleError] = useState<string | null>(null)
  const [savingAll, setSavingAll] = useState(false)

  const flushAndResolve = useCallback(async (): Promise<string | null> => {
    const ok = await autosave.flush({ create: true })
    return ok ? postIdRef.current : null
  }, [autosave, postIdRef])

  const flush = useCallback(async () => (await flushAndResolve()) !== null, [flushAndResolve])

  /**
   * ── THE ORDER HERE IS THE WHOLE FUNCTION ─────────────────────────────────────
   * The post is written first and unconditionally, because the row has to exist
   * before a variant can point at it — on a brand new post this call is what
   * creates it. The format is written last, because `post_variants.format` cannot
   * ride along with the body: the compare-and-set applied to production has a
   * fixed signature with no format among its arguments, and the row schema that
   * would carry one is frozen. So it is a second write, and it needs a row.
   */
  const saveVersion = useCallback(
    async (channel: Channel): Promise<boolean> => {
      const id = await flushAndResolve()
      if (id === null) return false
      const saved = await variants.saveNow(channel)
      if (saved) await formats.reapply(channel)
      return saved
    },
    [flushAndResolve, formats, variants],
  )

  const saveAll = useCallback(() => {
    setSavingAll(true)
    void (async () => {
      // Sequentially, not in parallel: each save is a compare-and-set against a
      // version this client is holding, and four concurrent writes to one post
      // make a refusal impossible to attribute to a channel.
      for (const channel of variants.dirtyChannels(channels)) {
        await saveVersion(channel)
      }
      setSavingAll(false)
    })()
  }, [channels, saveVersion, variants])

  /**
   * Setting a time is a STATUS change, and `savePost` refuses `status` on purpose
   * — accepting it would let a hand-rolled call mark a post published. So the
   * transition goes through the RPCs, which enforce the role and refuse a post
   * that is already going out.
   *
   * The local update runs FIRST so the picker stays responsive, and the server's
   * refusal is surfaced rather than swallowed: a picker that showed a time the
   * database never accepted is a promise nothing will keep.
   */
  const changeSchedule = useCallback(
    (iso: string | null) => {
      const hadSchedule = autosave.read().scheduledAt !== null
      autosave.update({ scheduledAt: iso })
      setScheduleError(null)
      void (async () => {
        const id = await flushAndResolve()
        if (id === null) {
          setScheduleError('Could not save the post, so the time was not set.')
          return
        }
        const result = await (iso === null
          ? cancelSchedule(id)
          : schedulePost(id, iso, hadSchedule))
        if (!result.ok) setScheduleError(result.message)
      })()
    },
    [autosave, flushAndResolve],
  )

  return {
    flushAndResolve,
    flush,
    saveVersion,
    saveAll,
    savingAll,
    unsaved: variants.dirtyChannels(channels),
    changeSchedule,
    scheduleError,
  }
}
