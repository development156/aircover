'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, Post } from '@sahoda/shared'

import { savePost } from '@/app/actions/posts'
import { detectConflict, isNewer } from '@/lib/posts/detect-conflict'

const DEBOUNCE_MS = 2000

export interface PostDraft {
  title: string
  body: string
  channels: Channel[]
  scheduledAt: string | null
}

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

export interface ConflictState {
  message: string
  /**
   * The content from the SAME read that produced the conflicting timestamp —
   * the caller contract `detect-conflict.ts` spells out. There is no revision
   * table, so this read is the only copy of the other version that exists.
   */
  restore: PostDraft
}

export interface AutosaveApi {
  draft: PostDraft
  status: AutosaveStatus
  error: string | null
  conflict: ConflictState | null
  update: (patch: Partial<PostDraft>) => void
  /** The live draft, readable from inside an async callback without a stale closure. */
  read: () => PostDraft
  /** Write any pending edit now. Resolves false when the write failed. */
  flush: () => Promise<boolean>
  restore: () => void
  dismissConflict: () => void
}

function toDraft(post: Post): PostDraft {
  return {
    title: post.title ?? '',
    body: post.body ?? '',
    channels: post.channels,
    scheduledAt: post.scheduled_at,
  }
}

function sameDraft(a: PostDraft, b: PostDraft): boolean {
  return (
    a.title === b.title &&
    a.body === b.body &&
    a.scheduledAt === b.scheduledAt &&
    a.channels.length === b.channels.length &&
    a.channels.every((channel, index) => channel === b.channels[index])
  )
}

/**
 * Debounced last-write-wins autosave for the canonical post (FSD 3.1).
 *
 * CONCURRENCY. `posts` has no version column, so there is no compare-and-set.
 * Two things are therefore true and both are handled here:
 *
 *  1. `savePost` returns the row's POST-write `updated_at` — the trigger has
 *     already bumped it. Feeding that into `detectConflict` against the value we
 *     loaded at would report a conflict on EVERY save, so it is never done.
 *     Instead the response is only used to (a) drop out-of-order responses via
 *     `isNewer` and (b) become the new adopted timestamp.
 *  2. A genuine concurrent edit is only ever provable from a fresh server READ.
 *     When the route re-renders with a `post.updated_at` newer than the one our
 *     own last write produced, someone else wrote the row — that is the one case
 *     `detectConflict` is called with, and the pre-write snapshot we kept is
 *     offered as the restore buffer the copy promises.
 *
 * Writes are serialized on a promise chain so a flush can never race the timer.
 */
export function useAutosave(postId: string, post: Post): AutosaveApi {
  const [draft, setDraft] = useState<PostDraft>(() => toDraft(post))
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [conflict, setConflict] = useState<ConflictState | null>(null)

  const latest = useRef<PostDraft>(draft)
  const lastSaved = useRef<PostDraft>(draft)
  const adopted = useRef<string>(post.updated_at)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))

  const runSave = useCallback(async (): Promise<boolean> => {
    const snapshot = latest.current
    if (sameDraft(snapshot, lastSaved.current)) return true

    setStatus('saving')
    setError(null)

    const result = await savePost(postId, {
      title: snapshot.title === '' ? null : snapshot.title,
      body: snapshot.body,
      channels: snapshot.channels,
      scheduled_at: snapshot.scheduledAt,
    })

    if (!result.ok) {
      setStatus('error')
      setError(result.message)
      return false
    }

    // A response older than the one we already adopted arrived out of order —
    // its `updated_at` describes a write we have already superseded.
    if (!isNewer(adopted.current, result.updatedAt)) adopted.current = result.updatedAt

    lastSaved.current = snapshot
    setStatus(sameDraft(latest.current, snapshot) ? 'saved' : 'unsaved')
    return true
  }, [postId])

  const enqueue = useCallback((): Promise<boolean> => {
    const next = chain.current.then(runSave)
    chain.current = next.then(
      () => true,
      () => false,
    )
    return next
  }, [runSave])

  const update = useCallback(
    (patch: Partial<PostDraft>) => {
      const next = { ...latest.current, ...patch }
      latest.current = next
      setDraft(next)
      setStatus('unsaved')

      if (timer.current !== null) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        timer.current = null
        void enqueue()
      }, DEBOUNCE_MS)
    },
    [enqueue],
  )

  const flush = useCallback((): Promise<boolean> => {
    if (timer.current !== null) {
      clearTimeout(timer.current)
      timer.current = null
    }
    return enqueue()
  }, [enqueue])

  // A fresh server read newer than our own last write is the only PROOF of a
  // concurrent edit available without a version column. The restore payload is
  // the content that came with THAT read — holding a local snapshot instead
  // would offer to "restore" a version the other writer never had.
  useEffect(() => {
    const check = detectConflict(adopted.current, post.updated_at)
    if (!check.conflict) return
    adopted.current = check.theirsUpdatedAt
    setConflict({ message: check.message, restore: toDraft(post) })
  }, [post])

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const restore = useCallback(() => {
    const buffered = conflict?.restore
    if (buffered === undefined) return
    setConflict(null)
    update(buffered)
  }, [conflict, update])

  const dismissConflict = useCallback(() => setConflict(null), [])

  const read = useCallback(() => latest.current, [])

  return { draft, status, error, conflict, update, read, flush, restore, dismissConflict }
}
