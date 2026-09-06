'use client'

import { useCallback, useRef, useState, useTransition } from 'react'
import { ChannelSchema, type Channel, type PostVariant } from '@sahoda/shared'

import { saveVariant } from '@/app/actions/posts'
import type { GeneratedVariant } from '@/lib/posts/state'
import type { VariantExtras } from '@/lib/posts/variant-extras'
import { VERSIONS_UNSUPPORTED, type VariantVersions } from '@/lib/posts/variant-version'

import { seed, type VariantState, type VariantStates } from './variant-state'

export type { VariantState, VariantStates } from './variant-state'

export interface VariantsApi {
  states: VariantStates
  setBody: (channel: Channel, body: string) => void
  setExtras: (channel: Channel, patch: VariantExtras) => void
  save: (channel: Channel) => void
  /** Save one channel and wait for the answer. Resolves false when the write failed. */
  saveNow: (channel: Channel) => Promise<boolean>
  applyGenerated: (items: readonly GeneratedVariant[]) => void
  /**
   * The post's body moved. Every channel still FOLLOWING it moves with it;
   * every channel that has been written independently is left alone.
   */
  mirrorSource: (body: string) => void
  /** Channels with unsaved local edits, in schema order. */
  dirtyChannels: (channels: readonly Channel[]) => Channel[]
  /** Re-send this channel's local text against the version the refusal carried. */
  keepMine: (channel: Channel) => void
  /** Load the stored text INTO THE BOX. Writes nothing — see the notice's rule 3. */
  useTheirs: (channel: Channel, theirs: string) => void
  /**
   * RELINK — this channel follows the post again, from now on.
   *
   * FSD §3.1 has specified this since the editor was designed and it has never
   * existed: once a channel was typed into, `following` went false and nothing
   * anywhere could set it back. A writer who adapted Instagram, then rewrote the
   * post, had no way to bring Instagram along short of copying and pasting.
   *
   * Writes NOTHING. The post's body lands in the box marked unsaved, which is the
   * rule "Use the saved version" already follows, so the row keeps the original
   * until the writer saves. The replaced words are kept for `undoRelink`.
   */
  relink: (channel: Channel, canonicalBody: string) => void
  /** Put back the words a relink replaced, and detach again. */
  undoRelink: (channel: Channel) => void
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
  /**
   * Which row these variants belong to, read AT CALL TIME.
   *
   * A getter rather than a string because a post is created by its first save:
   * pressing Save on a brand new post creates the row and writes the variant in
   * the same tick, and a value captured at render time would still be null.
   * Returns null only when there is genuinely nowhere to write yet, which is
   * reported rather than swallowed.
   */
  getPostId: () => string | null,
  variants: readonly PostVariant[],
  /**
   * What each channel is at, from the server read. Defaults to "not tracked",
   * which is both the state of production today and the right answer for any
   * caller that has no way to find out — every save then behaves as it always has.
   */
  versions: VariantVersions = VERSIONS_UNSUPPORTED,
  /**
   * The post's body at first render. Seeds every channel that has no copy of its
   * own — see `following` on `VariantState`. Read once; later changes arrive
   * through `mirrorSource`.
   */
  canonicalBody = '',
): VariantsApi {
  const [states, setStates] = useState<VariantStates>(() => seed(variants, versions, canonicalBody))
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
    // Typing here ends the following relationship. It is not restored by deleting
    // the text again: an emptied channel is a deliberate choice, and silently
    // refilling it from the post would undo it on the next keystroke anywhere
    // else on the screen. `relink` is how a writer asks for it back, on purpose.
    //
    // It also clears `relinkedFrom`. Once the writer has typed on top of a
    // relinked body, an "Undo" that threw those keystrokes away would be a second
    // silent discard — the exact thing relink is built not to do.
    (channel: Channel, body: string) =>
      patch(channel, { body, dirty: true, error: null, following: false, relinkedFrom: null }),
    [patch],
  )

  const mirrorSource = useCallback(
    (body: string) => {
      commit((current) => {
        let changed = false
        const next = { ...current }
        for (const channel of ChannelSchema.options) {
          const state = current[channel]
          if (!state.following || state.body === body) continue
          next[channel] = { ...state, body, dirty: true, error: null }
          changed = true
        }
        return changed ? next : current
      })
    },
    [commit],
  )

  const dirtyChannels = useCallback(
    (channels: readonly Channel[]): Channel[] =>
      channels.filter((channel) => latest.current[channel].dirty),
    [],
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
      const postId = getPostId()
      if (postId === null) {
        patch(channel, {
          saving: false,
          error: 'This post has not been saved yet, so there is nowhere to keep this copy.',
        })
        return false
      }
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
    [commit, getPostId, patch],
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
      // `following: false` for the same reason `setBody` sets it: adopting the
      // stored copy is a decision about THIS channel, and a later edit to the
      // post must not overwrite the version just chosen.
      patch(channel, {
        body: theirs,
        conflict: null,
        error: null,
        dirty: true,
        following: false,
        relinkedFrom: null,
      })
    },
    [patch],
  )

  /**
   * Relink — follow the post again.
   *
   * ── THE WORDS ARE NOT THROWN AWAY, AND THAT IS THE WHOLE DESIGN ─────────────
   * The channel's current text is stashed on `relinkedFrom` before the post's
   * body replaces it, so `undoRelink` restores it character for character. And
   * nothing is written: the mirrored body is marked `dirty`, so the row still
   * holds what it held until the writer saves.
   *
   * A channel that is ALREADY following is left completely alone — including its
   * `relinkedFrom`, so an Undo offered a moment ago is not quietly withdrawn by a
   * second click on a button that had nothing to do.
   *
   * `canonicalBody` is passed in rather than captured at mount: the post's body
   * changes constantly, and relinking to the version that was on screen when the
   * page loaded would resync to the wrong words.
   */
  const relink = useCallback(
    (channel: Channel, canonicalBody: string) => {
      const current = latest.current[channel]
      if (current.following) return
      patch(channel, {
        body: canonicalBody,
        following: true,
        // True whatever the two strings are. `dirty` is a claim about the ROW,
        // and the row still holds this channel's own copy — which is precisely
        // what relinking is undoing.
        dirty: true,
        error: null,
        relinkedFrom: current.body,
      })
    },
    [patch],
  )

  const undoRelink = useCallback(
    (channel: Channel) => {
      const previous = latest.current[channel].relinkedFrom
      if (previous === null) return
      patch(channel, {
        body: previous,
        following: false,
        dirty: true,
        error: null,
        relinkedFrom: null,
      })
    },
    [patch],
  )

  const applyGenerated = useCallback(
    (items: readonly GeneratedVariant[]) => {
      commit((current) => {
        const next = { ...current }
        for (const item of items) {
          const channel = current[item.channel]
          // Fill the keyword field from the ones the model wrote FOR this
          // channel, so a generated version arrives ready rather than leaving the
          // writer to retype them. Only when the model returned some: an empty
          // list must not wipe keywords a person typed by hand (e.g. GBP, which
          // the model is told to leave bare). Preserves the bracket preference.
          const extras =
            item.hashtags && item.hashtags.length > 0
              ? { ...channel.extras, hashtags: item.hashtags }
              : channel.extras
          next[item.channel] = {
            ...channel,
            body: item.body,
            extras,
            dirty: true,
            error: null,
            // A generated variant is written FOR this channel. It is the clearest
            // possible statement that this one is no longer the post's body.
            following: false,
            // And it replaces whatever a relink put here, so an Undo pointing at
            // a body two steps back would restore something the writer never saw.
            relinkedFrom: null,
          }
        }
        return next
      })
    },
    [commit],
  )

  return {
    states,
    setBody,
    setExtras,
    save,
    saveNow,
    applyGenerated,
    keepMine,
    useTheirs,
    relink,
    undoRelink,
    mirrorSource,
    dirtyChannels,
  }
}
