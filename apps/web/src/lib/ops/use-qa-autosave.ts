'use client'

import { useEffect, useRef, useState } from 'react'

import { AUTOSAVE_DELAY_MS, draftIsDirty, type QaDraft, type SaveState } from './qa-draft'

/**
 * Debounced autosave for the QA composer (doc 13 §11: "every 2 s, debounced").
 *
 * Three things this gets right that a plain `useEffect` + `setTimeout` usually
 * does not:
 *
 *   · Dirtiness is measured against what the SERVER acknowledged, never against
 *     the last thing typed. Marking a draft clean when a save was merely
 *     attempted means a failed save is never retried and only the next keystroke
 *     ever reaches the server — which is precisely the closed-tab case the
 *     autosave exists to prevent.
 *   · A save in flight is not cancelled by a keystroke; the next one is
 *     scheduled after it settles. Otherwise fast typing starves the save.
 *   · `saved` is only ever set from a successful response. There is no path from
 *     a rejected promise to a "Saved · 14:32:07" label.
 *
 * `flush()` exists for the two moments a debounce is wrong: attaching a
 * screenshot (which needs a run id NOW) and finalising.
 */
export interface AutosaveApi {
  state: SaveState
  /** What the server last confirmed, so callers can tell what is unsaved. */
  saved: QaDraft | null
  /** Save immediately and return the run id, or null if it failed. */
  flush: () => Promise<string | null>
}

export function useQaAutosave(
  draft: QaDraft,
  save: (draft: QaDraft) => Promise<{ ok: true; runId: string } | { ok: false; message: string }>,
  onRunId: (runId: string) => void,
): AutosaveApi {
  const [state, setState] = useState<SaveState>({ kind: 'idle' })
  const [saved, setSaved] = useState<QaDraft | null>(null)

  // Refs so the timer always sees the latest draft without being re-armed by
  // every keystroke into a new closure.
  const latest = useRef(draft)
  latest.current = draft
  const inFlight = useRef<Promise<string | null> | null>(null)

  async function run(): Promise<string | null> {
    if (inFlight.current) return inFlight.current

    const snapshot = latest.current
    setState({ kind: 'saving' })

    const attempt = (async () => {
      const result = await save(snapshot)
      if (result.ok) {
        // The snapshot, not `latest.current` — anything typed during the request
        // is genuinely still unsaved and must stay dirty.
        setSaved({ ...snapshot, runId: result.runId })
        setState({ kind: 'saved', at: new Date() })
        if (snapshot.runId === null) onRunId(result.runId)
        return result.runId
      }
      setState({ kind: 'failed', message: result.message })
      return null
    })()

    inFlight.current = attempt
    try {
      return await attempt
    } finally {
      inFlight.current = null
    }
  }

  useEffect(() => {
    if (!draftIsDirty(draft, saved)) return
    const timer = setTimeout(() => void run(), AUTOSAVE_DELAY_MS)
    return () => clearTimeout(timer)
    // `run` is stable enough for this: it reads through refs and setState.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saved])

  // A closed tab must not lose notes silently. The browser decides whether to
  // show this, but not asking at all is our failure rather than theirs.
  useEffect(() => {
    if (!draftIsDirty(draft, saved)) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [draft, saved])

  return { state, saved, flush: run }
}
