'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

import { useFlushOnLeave } from '@/components/posts/use-flush-on-leave'
import {
  AUTOSAVE_DELAY_MS,
  type DesignDraft,
  type SaveState,
  canonicalKey,
  describeDraftBlock,
} from '@/lib/studio/autosave'

/**
 * WRITE THE DESIGN DOWN WHENEVER SOMEBODY STOPS TYPING, AND ON EVERY WAY OUT.
 *
 * The reasoning for saving rather than warning is in `autosave.ts`. This is the
 * wiring, and it holds three rules that a first draft gets wrong:
 *
 * ── THE CONFIRMED SNAPSHOT IS WHAT CAME BACK ────────────────────────────────
 * `saved` is set from the row the server READ BACK, never from what was sent.
 * A write that was refused therefore leaves the design dirty and the next pause
 * tries again, which is the difference between an autosave and a thing that
 * says "Saved" once and then stops.
 *
 * ── ONE WRITE AT A TIME ─────────────────────────────────────────────────────
 * The debounce and the three leave events can all fire within a few hundred
 * milliseconds of each other. A second write started while the first is in the
 * air would race to set `saved`, and the loser would leave the editor believing
 * an older document is stored. So a flush with one already running returns the
 * running one.
 *
 * ── AND IT NEVER REFRESHES THE ROUTE ────────────────────────────────────────
 * The Save button calls `router.refresh()` so the gallery picks up a new title.
 * An autosave must not: refreshing the server tree every time somebody pauses
 * mid-sentence re-renders the page under their cursor. The gallery is one
 * screen away and reads the row when it gets there.
 */

export type SaveOutcome = { ok: true; saved: DesignDraft } | { ok: false; message: string }

export function useDesignAutosave({
  draft,
  initial,
  save,
}: {
  draft: DesignDraft
  initial: DesignDraft
  save: (draft: DesignDraft) => Promise<SaveOutcome>
}): {
  state: SaveState
  dirty: boolean
  /** Why no write will be attempted, or null. See `describeDraftBlock`. */
  blocked: string | null
  flush: () => Promise<boolean>
} {
  const [saved, setSaved] = useState<DesignDraft>(initial)
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const key = canonicalKey(draft)
  const savedKey = canonicalKey(saved)
  const dirty = key !== savedKey

  // Read through refs so the leave listeners attach once and still see the
  // current draft. Re-attaching them on a hook that re-renders on every
  // keystroke would be listener churn on the hot path.
  const draftRef = useRef(draft)
  draftRef.current = draft
  const savedRef = useRef(saved)
  savedRef.current = saved
  const saveRef = useRef(save)
  saveRef.current = save
  const inFlight = useRef<Promise<boolean> | null>(null)

  const flush = useCallback(async (): Promise<boolean> => {
    if (inFlight.current !== null) return inFlight.current
    const attempt = draftRef.current
    if (canonicalKey(attempt) === canonicalKey(savedRef.current)) return true
    // Refused before it is sent. The server would refuse it too, with a worse
    // sentence, once every 1.2 seconds.
    if (describeDraftBlock(attempt) !== null) return false

    setState({ kind: 'saving' })
    const run = (async () => {
      const result = await saveRef.current(attempt)
      if (result.ok) {
        setSaved(result.saved)
        setState({ kind: 'saved' })
        return true
      }
      setState({ kind: 'failed', message: result.message })
      return false
    })()

    inFlight.current = run
    try {
      return await run
    } finally {
      inFlight.current = null
    }
  }, [])

  useEffect(() => {
    if (!dirty) return
    const timer = setTimeout(() => void flush(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `key`, not `draft`: see `canonicalKey`. It is the dependency that changes
    // when the design changes and at no other time.
  }, [dirty, key, flush])

  // Back, a backgrounded tab and a real unload. See `use-flush-on-leave.ts` for
  // why the first of those needs `popstate` rather than a teardown.
  useFlushOnLeave(() => void flush())

  /**
   * The way out that the three events above DO NOT cover: a forward link.
   *
   * `popstate` fires on Back and Forward. It does not fire on a `pushState`
   * navigation, which is what a Next `<Link>` does, so clicking "All designs"
   * at the top of the editor, or "Open your library" under the export, fired
   * none of the three and lost whatever had been typed since the last save.
   * That is the commonest deliberate way off this screen, so covering only the
   * others would have made the claim in `autosave.ts` true in fewer cases than
   * it states.
   *
   * Capture phase, so this runs before the router's own handler. It does not
   * block the navigation and does not need to: no document unload happens on a
   * client-side route change, so the request stays in flight and completes.
   *
   * Modified clicks and non-primary buttons are ignored because they open a new
   * tab or a menu and leave this page exactly where it is.
   */
  useEffect(() => {
    if (!dirty) return
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return
      }
      const target = event.target
      if (!(target instanceof Element)) return
      if (target.closest('a[href]') === null) return
      void flush()
    }
    document.addEventListener('click', onClick, true)
    return () => document.removeEventListener('click', onClick, true)
  }, [dirty, flush])

  // The second belt, for the one case the flush above may not finish: a closed
  // tab or a hard reload. The browser decides whether to show anything, but not
  // asking at all would be our failure rather than theirs.
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  return { state, dirty, blocked: describeDraftBlock(draft), flush }
}
