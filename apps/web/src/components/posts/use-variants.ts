'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChannelSchema, type Channel, type PostVariant } from '@sahoda/shared'

import { saveVariant } from '@/app/actions/posts'
import type { GeneratedVariant } from '@/lib/posts/state'
import { parseExtras, type VariantExtras } from '@/lib/posts/variant-extras'
import type { SaveConflict } from '@/lib/posts/state'
import {
  expectedVersionFor,
  VERSIONS_UNSUPPORTED,
  type VariantVersions,
} from '@/lib/posts/variant-version'

export interface VariantState {
  body: string
  extras: VariantExtras
  /** Local edits not yet written to `post_variants`. */
  dirty: boolean
  saving: boolean
  error: string | null
  /**
   * Another writer saved this channel while this one was editing. Reachable only
   * once migration 20260819000000 gives `post_variants` its version column; before
   * that the save cannot detect a clash and this stays null.
   * Carried on the state rather than derived, because the losing tab has to keep
   * showing its own text alongside the stored one.
   */
  conflict: SaveConflict | null
  /**
   * What this channel's stored copy is at, for the compare-and-set save.
   *
   * `undefined` is the ordinary state until migration 20260819000000 is applied:
   * the column is not there, so there is nothing to compare and the save behaves
   * exactly as it always has. `null` means the column IS there and this channel
   * has no copy yet — a save then creates one, and a second tab creating at the
   * same moment loses and is told.
   *
   * Kept on the state rather than in a ref because it changes on every successful
   * save and on every refusal, and both of those already rebuild this object.
   */
  version: number | null | undefined
  /**
   * The live URL on the platform, once it exists. Server-owned and never edited
   * here — it is written by the publisher, and its PRESENCE is the only thing that
   * makes a post real (doc 13 §5). Local edits do not clear it: the post that went
   * out is still out.
   */
  permalink: string | null
}

export type VariantStates = Record<Channel, VariantState>

const EMPTY: Omit<VariantState, 'version'> = {
  body: '',
  extras: {},
  dirty: false,
  saving: false,
  error: null,
  conflict: null,
  permalink: null,
}

function seed(variants: readonly PostVariant[], versions: VariantVersions): VariantStates {
  const byChannel = new Map<Channel, PostVariant>()
  for (const variant of variants) byChannel.set(variant.channel, variant)

  const states = {} as VariantStates
  for (const channel of ChannelSchema.options) {
    const row = byChannel.get(channel)
    // Read from `versions` rather than from the row: `PostVariantSchema` is frozen
    // and strips the column, so the row genuinely does not have it. See
    // `lib/posts/variant-version.ts`.
    const version = expectedVersionFor(versions, channel)
    states[channel] =
      row === undefined
        ? { ...EMPTY, version }
        : {
            body: row.body,
            extras: parseExtras(row.extras),
            dirty: false,
            saving: false,
            error: null,
            conflict: null,
            version,
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
  /** Re-send this channel's local text against the version the refusal carried. */
  keepMine: (channel: Channel) => void
  /** Load the stored text INTO THE BOX. Writes nothing — see the notice's rule 3. */
  useTheirs: (channel: Channel, theirs: string) => void
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
export function useVariants(
  postId: string,
  variants: readonly PostVariant[],
  /**
   * What each channel is at, from the server read. Defaults to "not tracked",
   * which is both the state of production today and the right answer for any
   * caller that has no way to find out — every save then behaves as it always has.
   */
  versions: VariantVersions = VERSIONS_UNSUPPORTED,
): VariantsApi {
  const [states, setStates] = useState<VariantStates>(() => seed(variants, versions))
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

      const result = await saveVariant(postId, channel, draft.body, draft.extras, draft.version)
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
            // ── WHERE THE NEXT SAVE'S EXPECTATION COMES FROM ─────────────────
            // Three sources, in order. A successful save reports the row's new
            // number. A refusal carries the number the row is ACTUALLY at, which
            // is what makes "Keep mine" able to win rather than fail forever. And
            // anything else leaves it alone — notably, a save on a database with
            // no version column reports none, and `undefined` must stay
            // `undefined` there or the next save would start claiming to compare.
            version: result.ok
              ? (result.version ?? now.version)
              : (result.conflict?.version ?? now.version),
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

  /**
   * Keep mine — re-send the local text against the version the refusal carried.
   *
   * The conflict is cleared BEFORE the write rather than after it, and that is not
   * cosmetic: `write` sets the conflict from the result, so leaving the old one
   * standing would show a stale notice for the length of the round trip, with the
   * old stored text under it. If this attempt loses too, the write puts a fresh
   * notice back carrying the newer text.
   */
  const keepMine = useCallback(
    (channel: Channel) => {
      if (latest.current[channel].saving) return
      patch(channel, { conflict: null, error: null })
      startTransition(() => {
        void write(channel)
      })
    },
    [patch, write],
  )

  /**
   * Use the saved version — load their text INTO THE BOX, and write nothing.
   *
   * The whole point of the notice's third rule. Landing in the box means the
   * writer can still edit it, or press undo, or change their mind, before anything
   * reaches the row. Marked `dirty` for the same reason: nothing has been saved,
   * and a box that said "Saved" here would be lying about a decision the writer
   * has not made yet.
   *
   * The version is deliberately kept — it is the one the refusal reported, which
   * is what is actually stored, so the save that follows compares against the
   * right thing.
   */
  const useTheirs = useCallback(
    (channel: Channel, theirs: string) => {
      patch(channel, { body: theirs, conflict: null, error: null, dirty: true })
    },
    [patch],
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

  return { states, setBody, setExtras, save, saveNow, applyGenerated, keepMine, useTheirs }
}
