'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'

import type { CaretIo } from './use-text-history'

/**
 * A TEXTAREA WHOSE CARET CAN BE READ AND PUT BACK.
 *
 * ── WHY THIS IS NOT JUST A REF ───────────────────────────────────────────────
 * Every control that writes into the box from outside — insert an emoji, undo,
 * redo — has the same problem: React owns `value`, so setting it re-renders the
 * textarea and the caret lands at the end of the text. On a two-hundred-word
 * caption that means inserting a rupee sign after the price sends the writer's
 * cursor to the bottom of the box, and they have to find their place again.
 * Every one of those controls becomes annoying enough to stop using.
 *
 * The caret therefore has to be restored AFTER the value has been painted, which
 * a click handler cannot do — it runs before the render. So the position is
 * parked here and applied by an effect, which is the first moment the new text
 * is actually in the DOM.
 *
 * ── AND WHY IT FOCUSES ───────────────────────────────────────────────────────
 * Clicking a button in the toolbar takes focus off the textarea. Setting a
 * selection on an unfocused textarea is legal and invisible: the caret is where
 * you asked, and the writer sees nothing and has to click back in. Focus is part
 * of the act, not a flourish.
 */
export interface CaretBox {
  /** Put this on the textarea. */
  ref: React.RefObject<HTMLTextAreaElement | null>
  /** Hand this to `useTextHistory` so undo restores the caret with the words. */
  io: CaretIo
  /** Ask for the caret to land here once the next render has painted. */
  place: (caret: number) => void
}

export function useCaretBox(): CaretBox {
  const ref = useRef<HTMLTextAreaElement | null>(null)
  const pending = useRef<number | null>(null)

  // No dependency array on purpose. The request is made during an event, the
  // value changes, and this must run on whichever render carries the new text —
  // there is no value here to key it to, and keying it to one would tie this
  // file to a caller's state shape.
  useEffect(() => {
    const caret = pending.current
    if (caret === null) return
    pending.current = null
    const box = ref.current
    if (box === null) return
    box.focus()
    box.setSelectionRange(caret, caret)
  })

  const place = useCallback((caret: number) => {
    pending.current = caret
  }, [])

  const io = useMemo<CaretIo>(
    () => ({
      // Null rather than 0 when there is no box. 0 is a real caret position, and
      // reporting it for "I could not ask" would record every step as starting
      // at the beginning of the text.
      read: () => ref.current?.selectionStart ?? null,
      write: place,
    }),
    [place],
  )

  return { ref, io, place }
}
