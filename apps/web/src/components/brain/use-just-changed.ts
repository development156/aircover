'use client'

import { useEffect, useRef, useState } from 'react'

/** How long a "this just changed" flag stays up: the longest animation it drives, plus a beat. */
export const JUST_CHANGED_MS = 700

/**
 * True for a moment after `value` changes between renders.
 *
 * The Brand Brain's screens are server-rendered and re-render from fresh data
 * after every write, so a confirmed field arrives as a new PROP rather than as
 * an event. This turns that prop change into the beat the animations key on,
 * without any component keeping a second copy of the server's state. First
 * render is never "just changed": a page arriving should not pulse.
 */
export function useJustChanged<T>(value: T, ms: number = JUST_CHANGED_MS): boolean {
  const previous = useRef(value)
  const [just, setJust] = useState(false)

  useEffect(() => {
    if (Object.is(previous.current, value)) return
    previous.current = value
    setJust(true)
    const timer = setTimeout(() => setJust(false), ms)
    return () => clearTimeout(timer)
  }, [value, ms])

  return just
}
