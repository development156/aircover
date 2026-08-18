'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChannelSchema, type Channel, type PostVariant } from '@sahoda/shared'

import { saveVariant } from '@/app/actions/posts'
import type { GeneratedVariant } from '@/lib/posts/state'
import { parseExtras, type VariantExtras } from '@/lib/posts/variant-extras'
import type { SaveConflict } from '@/lib/posts/state'

export interface VariantState {
  body: string
  extras: VariantExtras
  /** Local edits not yet written to `post_variants`. */
  dirty: boolean
  saving: boolean
  error: string | null
  /**
   * Another writer saved this channel while this one was editing. INERT until
   * `post_variants` has a version column — see docs/23_Concurrent_Edit_Plan.md.
   * Carried on the state rather than derived, because the losing tab has to keep
   * showing its own text alongside the stored one.
   */
  conflict: SaveConflict | null
  /**
   * The live URL on the platform, once it exists. Server-owned and never edited
   * here — it is written by the publisher, and its PRESENCE is the only thing that
   * makes a post real (doc 13 §5). Local edits do not clear it: the post that went
   * out is still out.
   */
  permalink: string | null
}

export type VariantStates = Record<Channel, VariantState>

const EMPTY: VariantState = {
  body: '',
  extras: {},
  dirty: false,
  saving: false,
  error: null,
  conflict: null,
  permalink: null,
}

function seed(variants: readonly PostVariant[]): VariantStates {
  const byChannel = new Map<Channel, PostVariant>()
  for (const variant of variants) byChannel.set(variant.channel, variant)

  const states = {} as VariantStates
  for (const channel of ChannelSchema.options) {
    const row = byChannel.get(channel)
    states[channel] =
      row === undefined
        ? EMPTY
        : {
            body: row.body,
            extras: parseExtras(row.extras),
            dirty: false,
            saving: false,
            error: null,
            conflict: null,
            permalink: row.permalink,
          }
  }
  return states
}

export interface VariantsApi {
  states: VariantStates
  setBody: (channel: Channel, body: string) => void
  setExtras: (channel: Channel, patch: VariantExtras) => void
  save: (channel: Channel) => void
  /** Save one channel and wait for the answer. Resolves false when the write failed. */
  saveNow: (channel: Channel) => Promise<boolean>
  applyGenerated: (items: readonly GeneratedVariant[]) => void
}

/**
 * Per-channel variant drafts.
 *
 * Lives above both the tab panel and the generate button because a generate run
 * writes into the same drafts the tabs edit. Every update produces a fresh
 * object — nothing is mutated in place.
 *
 * A ref mirrors the state because `save` must read the CURRENT draft at call
 * time: a `setStates` updater is not guaranteed to have run by the time the
 * transition body executes, so snapshotting from inside one would race.
 */
export function useVariants(postId: string, variants: readonly PostVariant[]): VariantsApi {
  const [states, setStates] = useState<VariantStates>(() => seed(variants))
  const latest = useRef<VariantStates>(states)
  const [, startTransition] = useTransition()

  const commit = useCallback((update: (current: VariantStates) => VariantStates) => {
    const next = update(latest.current)
    latest.current = next
    setStates(next)
  }, [])

  const patch = useCallback(
    (channel: Channel, next: Partial<VariantState>) => {
      commit((current) => ({ ...current, [channel]: { ...current[channel], ...next } }))
    },
    [commit],
  )

  const setBody = useCallback(
    (channel: Channel, body: string) => patch(channel, { body, dirty: true, error: null }),
    [patch],
  )

  const setExtras = useCallback(
    (channel: Channel, next: VariantExtras) => {
      commit((current) => ({
        ...current,
        [channel]: {
          ...current[channel],
          extras: { ...current[channel].extras, ...next },
          dirty: true,
          error: null,
        },
      }))
    },
    [commit],
  )

  /**
   * The write itself, awaitable. Extracted so `saveNow` can report whether the
   * variant actually landed — `save` is fire-and-forget inside a transition and
   * has no way to tell a caller anything.
   */
  const write = useCallback(
    async (channel: Channel): Promise<boolean> => {
      const draft = latest.current[channel]
      patch(channel, { saving: true, error: null })

      const result = await saveVariant(postId, channel, draft.body, draft.extras)
      commit((current) => {
        const now = current[channel]
        // What landed on the server is the SNAPSHOT, not whatever is in the
        // box now. Clearing `dirty` unconditionally would label edits made
        // during the write "Saved" and disable the only button that could
        // save them. Every setter builds a fresh extras object, so identity
        // is a sound comparison here.
        const unchanged = now.body === draft.body && now.extras === draft.extras
        return {
          ...current,
          [channel]: {
            ...now,
            saving: false,
            // Still dirty if the write failed, or if the draft moved on. A
            // conflict is emphatically a failed write: the row was NOT updated,
            // so clearing `dirty` here would mark unsaved work as saved.
            dirty: !result.ok || !unchanged,
            error: result.ok || result.conflict !== undefined ? null : result.message,
            // The notice replaces the generic error rather than joining it — two
            // messages about one refusal is how a writer learns to read neither.
            conflict: result.ok ? null : (result.conflict ?? null),
          },
        }
      })
      return result.ok
    },
    [commit, patch, postId],
  )

  const save = useCallback(
    (channel: Channel) => {
      if (latest.current[channel].saving) return
      startTransition(() => {
        void write(channel)
      })
    },
    [write],
  )

  /**
   * Save one channel's draft and wait for the answer.
   *
   * Publishing needs this. `useAutosave`'s `flush` writes the CANONICAL post —
   * title, body, channels, schedule — and never touches `post_variants`, which is
   * the row that actually goes to the platform. Publishing after a flush alone
   * would send whatever was last saved to the variant while the writer looks at
   * something newer on screen.
   *
   * Writes unconditionally rather than skipping a clean draft: `dirty` is this
   * component's belief about the server, and before a real, irreversible publish
   * the cheap round-trip that makes the row match the screen is worth more than
   * the saving.
   */
  const saveNow = useCallback(async (channel: Channel): Promise<boolean> => write(channel), [write])

  const applyGenerated = useCallback(
    (items: readonly GeneratedVariant[]) => {
      commit((current) => {
        const next = { ...current }
        for (const item of items) {
          next[item.channel] = {
            ...current[item.channel],
            body: item.body,
            dirty: true,
            error: null,
          }
        }
        return next
      })
    },
    [commit],
  )

  return { states, setBody, setExtras, save, saveNow, applyGenerated }
}
