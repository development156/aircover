'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Channel, Post } from '@sahoda/shared'

import { savePost } from '@/app/actions/posts'
import { detectConflict, isNewer } from '@/lib/posts/detect-conflict'

const DEBOUNCE_MS = 2000

/**
 * `savePost` is a server action: a dropped connection REJECTS the call instead of
 * resolving to `{ ok: false }`, so there is no server-authored message to show.
 */
const UNREACHABLE_MESSAGE = 'Could not reach the server to save this post.'

export interface PostDraft {
  title: string
  body: string
  channels: Channel[]
  scheduledAt: string | null
}

export type AutosaveStatus = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error'

export interface DivergenceState {
  message: string
  /**
   * The content from the SAME read that produced the diverging timestamp — the
   * caller contract `detect-conflict.ts` spells out. There is no revision table,
   * so this read is the only copy of the other version that exists.
   */
  theirs: PostDraft
}

export interface AutosaveApi {
  draft: PostDraft
  status: AutosaveStatus
  error: string | null
  /** Set when the row moved to a timestamp this editor did not produce. */
  divergence: DivergenceState | null
  update: (patch: Partial<PostDraft>) => void
  /** The live draft, readable from inside an async callback without a stale closure. */
  read: () => PostDraft
  /** Write any pending edit now. Resolves false when the write failed. */
  flush: () => Promise<boolean>
  /** Replace the draft with the version that came with the diverging read. */
  loadTheirs: () => void
  /** Dismiss the notice and write the local draft, making it the current row. */
  keepMine: () => void
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
 * CONCURRENCY — WHAT IS KNOWABLE. `posts` has no version column, so there is no
 * compare-and-set, and every `updated_at` this client ever sees is a POST-write
 * one: PostgREST returns the row after the trigger has already bumped it. From
 * post-write timestamps alone it is IMPOSSIBLE to say who overwrote whom, so
 * nothing here claims to. (A CAS-style `p_expected_version` on the post update —
 * the shape `resolve_brand_memory` already uses for the Brand Brain — is what
 * would make a true overwrite claim possible.)
 *
 * What IS knowable is DIVERGENCE: the row has moved to a timestamp we did not
 * produce. Two rules keep that verdict honest.
 *
 *  1. Our own write's `updated_at` is never fed to `detectConflict` as evidence —
 *     it would report divergence on every single save. It is used only to (a)
 *     drop out-of-order responses via `isNewer` and (b) become the new adopted
 *     timestamp.
 *  2. `savePost` calls `revalidatePath`, so every successful save re-renders this
 *     route with the timestamp OUR OWN write produced. If that re-render were
 *     evaluated before the action's promise resolved, our own save would be
 *     announced as an outside change. So a read that lands while a write is
 *     outstanding is DEFERRED and re-evaluated once the write has been adopted,
 *     at which point our own echo compares equal and stays silent.
 *
 * The limit this leaves, stated plainly: if someone else writes the row and we
 * then save over it without ever re-rendering in between, the row's post-write
 * timestamp is simply ours and nothing distinguishes it. That case is invisible
 * to any client without a version column, and we do not pretend otherwise.
 *
 * Writes are serialized on a promise chain so a flush can never race the timer.
 */
export function useAutosave(postId: string, post: Post): AutosaveApi {
  const [draft, setDraft] = useState<PostDraft>(() => toDraft(post))
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [divergence, setDivergence] = useState<DivergenceState | null>(null)

  const latest = useRef<PostDraft>(draft)
  const lastSaved = useRef<PostDraft>(draft)
  const adopted = useRef<string>(post.updated_at)
  const forceNext = useRef<boolean>(false)
  const inFlight = useRef<number>(0)
  const deferredRead = useRef<Post | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chain = useRef<Promise<boolean>>(Promise.resolve(true))

  /** Touches refs and one setter only, so it is stable and safe to call anywhere. */
  const evaluateRead = useCallback((fresh: Post) => {
    const check = detectConflict(adopted.current, fresh.updated_at)
    if (!check.conflict) return
    adopted.current = check.theirsUpdatedAt
    setDivergence({ message: check.message, theirs: toDraft(fresh) })
  }, [])

  const runSave = useCallback(async (): Promise<boolean> => {
    const snapshot = latest.current
    const forced = forceNext.current
    forceNext.current = false

    if (!forced && sameDraft(snapshot, lastSaved.current)) {
      // `lastSaved` only advances on a write the server confirmed, so a draft
      // that still matches it is already on the server — which makes an error
      // banner left over from an earlier attempt stale, not current.
      setError(null)
      setStatus((current) => (current === 'error' ? 'saved' : current))
      return true
    }

    setStatus('saving')
    setError(null)
    inFlight.current += 1

    try {
      // A server action REJECTS on a transport failure rather than resolving to
      // `{ ok: false }`. Without this catch the status sat on 'saving' forever
      // and `error` stayed null, so the editor showed "Saving…" with no retry —
      // telling the writer their text was on its way when nothing was.
      const result = await savePost(postId, {
        title: snapshot.title === '' ? null : snapshot.title,
        body: snapshot.body,
        channels: snapshot.channels,
        scheduled_at: snapshot.scheduledAt,
      }).catch(() => null)

      if (result === null) {
        setStatus('error')
        setError(UNREACHABLE_MESSAGE)
        return false
      }

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
    } finally {
      inFlight.current -= 1
      const pending = deferredRead.current
      deferredRead.current = null
      // Now that our own write has been adopted, a read held back during it can
      // be judged: our echo compares equal, anything newer is a real divergence.
      if (inFlight.current === 0 && pending !== null) evaluateRead(pending)
    }
  }, [postId, evaluateRead])

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

  // A fresh server read newer than everything we have accounted for is the only
  // evidence of an outside edit available without a version column — and only
  // once our own in-flight write is out of the picture, because `savePost`
  // revalidates this very route.
  useEffect(() => {
    if (inFlight.current > 0) {
      deferredRead.current = post
      return
    }
    evaluateRead(post)
  }, [post, evaluateRead])

  useEffect(() => {
    return () => {
      if (timer.current !== null) clearTimeout(timer.current)
    }
  }, [])

  const loadTheirs = useCallback(() => {
    const theirs = divergence?.theirs
    if (theirs === undefined) return
    setDivergence(null)
    update(theirs)
  }, [divergence, update])

  // Keeping the local draft only means anything if it actually reaches the row,
  // and the row now holds the other version — so this forces a write even when
  // the draft is unchanged, which the debounced path would otherwise skip.
  const keepMine = useCallback(() => {
    setDivergence(null)
    forceNext.current = true
    void flush()
  }, [flush])

  const read = useCallback(() => latest.current, [])

  return { draft, status, error, divergence, update, read, flush, loadTheirs, keepMine }
}
