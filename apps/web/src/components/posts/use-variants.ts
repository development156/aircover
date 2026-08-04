'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChannelSchema, type Channel, type PostVariant } from '@sahoda/shared'

import { saveVariant } from '@/app/actions/posts'
import type { GeneratedVariant } from '@/lib/posts/state'
import { parseExtras, type VariantExtras } from '@/lib/posts/variant-extras'

export interface VariantState {
  body: string
  extras: VariantExtras
  /** Local edits not yet written to `post_variants`. */
  dirty: boolean
  saving: boolean
  error: string | null
}

export type VariantStates = Record<Channel, VariantState>

const EMPTY: VariantState = { body: '', extras: {}, dirty: false, saving: false, error: null }

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
          }
  }
  return states
}

export interface VariantsApi {
  states: VariantStates
  setBody: (channel: Channel, body: string) => void
  setExtras: (channel: Channel, patch: VariantExtras) => void
  save: (channel: Channel) => void
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

  const save = useCallback(
    (channel: Channel) => {
      const draft = latest.current[channel]
      if (draft.saving) return
      patch(channel, { saving: true, error: null })

      startTransition(async () => {
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
              // Still dirty if the write failed, or if the draft moved on.
              dirty: !result.ok || !unchanged,
              error: result.ok ? null : result.message,
            },
          }
        })
      })
    },
    [commit, patch, postId],
  )

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

  return { states, setBody, setExtras, save, applyGenerated }
}
