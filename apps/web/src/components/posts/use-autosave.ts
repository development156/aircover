'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { clearStash, readStash, stashDraft } from './draft-recovery'
import { useFlushOnLeave } from './use-flush-on-leave'
import type { ChannelSet, Post } from '@sahoda/shared'

import { savePost } from '@/app/actions/posts'
import { detectConflict, isNewer } from '@/lib/posts/detect-conflict'

const DEBOUNCE_MS = 2000

/**
 * Where a draft is buffered before its row exists.
 *
 * The stash is keyed by post id so two posts cannot overwrite each other's
 * recovery buffer, and a post being written for the first time has no id — so it
 * gets a reserved key. A real key is a uuid, so nothing can collide with this.
 */
export const NEW_POST_STASH_KEY = 'new'

/** Create the row this draft belongs to. Called once, from inside the save. */
export type EnsurePostId = () => Promise<
  { ok: true; postId: string } | { ok: false; message: string }
>

const NO_CREATOR_MESSAGE = 'This post has nowhere to be saved yet.'

/**
 * `savePost` is a server action: a dropped connection REJECTS the call instead of
 * resolving to `{ ok: false }`, so there is no server-authored message to show.
 */
const UNREACHABLE_MESSAGE = 'Could not reach the server to save this post.'

export interface PostDraft {
  title: string
  body: string
  channels: ChannelSet
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

const EMPTY_DRAFT: PostDraft = {
  title: '',
  body: '',
  channels: [] as unknown as ChannelSet,
  scheduledAt: null,
}

function toDraft(post: Post | null): PostDraft {
  if (post === null) return EMPTY_DRAFT
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
export function useAutosave(
  /**
   * The row this draft belongs to, or null when it does not exist yet.
   *
   * NULL IS A FIRST-CLASS STATE, not a placeholder. A post being written for the
   * first time has no row until the first save creates one — opening a screen is
   * not intent, and creating on open is what left "Untitled post" debris behind
   * every abandoned click. The composer therefore renders identically either way
   * and this hook resolves the id inside the save.
   */
  postId: string | null,
  post: Post | null,
  /**
   * Create the row, on the first save that has something to write. Required
   * whenever `postId` can be null; without it a null id fails the save honestly
   * rather than silently discarding the text.
   */
  ensurePostId?: EnsurePostId,
): AutosaveApi {
  const [draft, setDraft] = useState<PostDraft>(() => toDraft(post))
  const [status, setStatus] = useState<AutosaveStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [divergence, setDivergence] = useState<DivergenceState | null>(null)

  const latest = useRef<PostDraft>(draft)
  const lastSaved = useRef<PostDraft>(draft)
  /**
   * The id this hook is actually writing to.
   *
   * A ref, not the prop, because the create happens INSIDE a save: the parent
   * learns the id one render later, and a second save queued in between would
   * otherwise create a second row. Writes are serialised on `chain`, so this is
   * only ever read and written by one save at a time.
   */
  const writingTo = useRef<string | null>(postId)
  if (postId !== null) writingTo.current = postId
  const adopted = useRef<string>(post?.updated_at ?? '')
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
      // ── THE ROW IS CREATED HERE, BY THE FIRST SAVE THAT HAS SOMETHING TO SAY ──
      // Not on mount, and not by the button that opened the screen. `sameDraft`
      // above already returned for an untouched draft, so reaching this line
      // means there are real words (or a real channel choice) to keep.
      let id = writingTo.current
      if (id === null) {
        if (ensurePostId === undefined) {
          setStatus('error')
          setError(NO_CREATOR_MESSAGE)
          return false
        }
        const created = await ensurePostId().catch(() => null)
        if (created === null) {
          setStatus('error')
          setError(UNREACHABLE_MESSAGE)
          return false
        }
        if (!created.ok) {
          setStatus('error')
          setError(created.message)
          return false
        }
        id = created.postId
        writingTo.current = id
        // The pre-row buffer has a new home. Cleared rather than left behind, or
        // the next visit to a blank composer would restore this post's words
        // into a different post.
        clearStash(NEW_POST_STASH_KEY)
      }

      // A server action REJECTS on a transport failure rather than resolving to
      // `{ ok: false }`. Without this catch the status sat on 'saving' forever
      // and `error` stayed null, so the editor showed "Saving…" with no retry —
      // telling the writer their text was on its way when nothing was.
      const result = await savePost(id, {
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
      // Confirmed by the server: the buffer has nothing left to protect. Cleared
      // only on the arm where `result.ok` is true, so a failed write keeps it.
      if (sameDraft(latest.current, snapshot)) clearStash(id)
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
  }, [ensurePostId, evaluateRead])

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
      // Synchronous, local, and impossible to abort. The debounced write below is
      // still the primary path; this is what survives a navigation cancelling it.
      stashDraft(writingTo.current ?? NEW_POST_STASH_KEY, next)

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
    // No row means nothing can have diverged from anything: there is no other
    // version of a post that does not exist yet.
    if (post === null) return
    if (inFlight.current > 0) {
      deferredRead.current = post
      return
    }
    evaluateRead(post)
  }, [post, evaluateRead])

  /**
   * ── THE CLEANUP CANCELLED THE WRITE INSTEAD OF MAKING IT ─────────────────────
   * This used to `clearTimeout` and stop, which throws away whatever was typed
   * inside the debounce window. MEASURED on a real post: type into the body,
   * press browser Back within 2s, come back — the field is EMPTY. Wait past the
   * 2s and do exactly the same thing and the text is there. A client-routed Back
   * fires no unload event, so nothing else was ever going to catch it.
   *
   * Flushing here is safe rather than racy: `flush` cancels the timer itself and
   * `enqueue` serialises on the same promise chain every other write uses, so
   * this cannot overtake or duplicate an in-flight save.
   *
   * ── WHAT THIS DOES *NOT* CLOSE, MEASURED ─────────────────────────────────────
   * The browser case is STILL LOST and this is not the fix for it. With this in
   * place, typing into the body and pressing browser Back inside the 2s window
   * still comes back empty. A direct `savePost` in the cleanup, bypassing the
   * chain, did not change that either — so the likeliest reading is that a Back
   * out of /posts/[id] does not unmount this hook at all (Next keeps the segment
   * in its router cache), which means no teardown hook of any kind can catch it.
   * Reported, not claimed fixed.
   *
   * What this DOES change is that the cleanup no longer DISCARDS a pending
   * write. It used to `clearTimeout` and stop, so any genuine unmount inside the
   * window threw the edit away; now it writes it. That is strictly safer and is
   * unit-proven both ways — it writes what is pending, and writes nothing when
   * nothing is.
   *
   * `flushRef` rather than `flush` in the dependency list on purpose: the effect
   * must run ONCE and its cleanup must call the CURRENT flush, not the one that
   * existed at mount.
   */
  const flushRef = useRef(flush)
  flushRef.current = flush
  /**
   * ── HAND BACK WHAT THE LAST VISIT COULD NOT SAVE ───────────────────────────
   * Runs once, before anything is written. A buffer only exists when a previous
   * render of THIS post had unsaved words, so finding one means the customer
   * typed something we failed to persist in time — their own text, restored to
   * them. It is deliberately NOT treated as a conflict: nobody else wrote it and
   * there is nothing to choose between.
   *
   * `update()` rather than a bare setState, so the recovered draft goes through
   * the same debounce and reaches the row on its own.
   */
  const recovered = useRef(false)
  useEffect(() => {
    if (recovered.current) return
    recovered.current = true
    const stash = readStash(postId ?? NEW_POST_STASH_KEY)
    if (stash === null) return
    if (sameDraft(stash, latest.current)) {
      clearStash(postId ?? NEW_POST_STASH_KEY)
      return
    }
    update(stash)
  }, [postId, update])

  useEffect(() => {
    return () => {
      void flushRef.current()
    }
  }, [])

  // The teardown above is NOT enough and measurement says so — see
  // `useFlushOnLeave`. A Back out of /posts/[id] never unmounts this hook, so the
  // navigation itself has to be the trigger.
  useFlushOnLeave(() => void flushRef.current())

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
