'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * UNDO AND REDO FOR ONE TEXT BOX, BECAUSE THE BROWSER'S OWN STOPPED WORKING.
 *
 * ── WHY A TEXTAREA NEEDS THIS AT ALL ─────────────────────────────────────────
 * Ctrl+Z inside a `<textarea>` is native and free, right up until something
 * OTHER than the keyboard writes to it. Every one of those exists on this
 * screen: `applyGenerated` drops an adapted body in, `relink` replaces the body
 * with the post's, `useTheirs` loads the stored copy after a conflict,
 * `InlineRewrite` splices a paid rewrite back, and `trimToFit` cuts to the
 * channel's limit. React sets `value` for each, and a programmatic value
 * assignment does not enter the browser's undo transaction log — so the writer
 * presses Ctrl+Z after a generate and the box either does nothing or jumps back
 * to something from three edits ago. The one action most worth undoing on this
 * screen is the one the native stack cannot see.
 *
 * So the history has to live where the writes live, which is here.
 *
 * ── WHAT COUNTS AS ONE STEP ──────────────────────────────────────────────────
 * Not one keystroke. An undo that walks back a letter at a time is not an undo,
 * it is a rewind, and nobody presses it forty times. Consecutive SMALL edits
 * (one code unit added or removed) inside `QUIET_MS` of each other collapse into
 * one step, so a burst of typing undoes back to where the writer started typing.
 *
 * Anything that moves more than one character at a time — a paste, a generate, a
 * relink, Clear, Trim to fit, a rewrite splice — is its own step ALWAYS, and it
 * also ends the run before it. That is the half that matters: those are the
 * edits a writer wants back, and burying one inside a typing run would make it
 * unreachable without also throwing away the words typed after it.
 *
 * ── IT DOES NOT OWN THE TEXT ─────────────────────────────────────────────────
 * The body still lives in `use-variants`. This watches the value it is handed
 * and calls `apply` to move it, which means nothing has to be re-plumbed and
 * every existing writer of the body is recorded automatically, including ones
 * added later that never hear about this file.
 */

/** A point the writer can return to: the words, and where the caret was. */
interface Step {
  text: string
  caret: number
}

/** How long a pause ends a run of typing. */
const QUIET_MS = 600

export interface TextHistory {
  /** Null when there is nothing to go back to, so the caller renders a real disabled state. */
  undo: (() => void) | null
  redo: (() => void) | null
  /**
   * Steps available in each direction, READ AT RENDER TIME.
   *
   * Deliberately not rendered anywhere. The stacks live in refs and only force a
   * repaint when a button crosses between usable and not, so a depth that goes
   * 1 -> 2 is correct in the next render rather than this one. That is exactly
   * right for enabling a button and exactly wrong for printing a number, so this
   * is here for tests to assert against and for nothing else.
   */
  depth: { back: number; forward: number }
}

export interface CaretIo {
  /** Where the caret is now, or null when the box is not mounted or not focused. */
  read: () => number | null
  /** Put the caret back after the value has been re-rendered. */
  write: (caret: number) => void
}

export function useTextHistory(
  value: string,
  apply: (next: string) => void,
  caret?: CaretIo,
): TextHistory {
  /**
   * Held in a ref rather than read from the closure so the caller can pass a
   * fresh object literal every render without churning this hook's effect and
   * callbacks. Every read below is `io.current`, so it is always the latest.
   */
  const io = useRef<CaretIo | undefined>(caret)
  io.current = caret

  const back = useRef<Step[]>([])
  const forward = useRef<Step[]>([])
  /** The state the stacks are anchored to. Never null after the first render. */
  const current = useRef<Step>({ text: value, caret: value.length })
  /** When the last recorded change was observed, and whether it was typing-sized. */
  const lastAt = useRef<number>(0)
  const lastWasTyping = useRef<boolean>(false)
  /**
   * Only bumped when a BUTTON changes state, not on every keystroke.
   *
   * The composer is the heaviest route in the product, and a `useState` holding
   * the stacks would re-render the whole card on every character typed for a
   * value nothing reads until the depth crosses zero. Refs hold the stacks; this
   * exists purely to repaint the two buttons at the moment they become usable.
   */
  const [, repaint] = useState(0)
  const enabled = useRef<string>('0/0')

  const sync = useCallback(() => {
    const next = `${back.current.length === 0 ? 0 : 1}/${forward.current.length === 0 ? 0 : 1}`
    if (next === enabled.current) return
    enabled.current = next
    repaint((n) => n + 1)
  }, [])

  useEffect(() => {
    // ── AND THIS ONE LINE IS WHAT STOPS UNDO BEING A TOGGLE ───────────────────
    // An undo writes through the same `apply` a keystroke does, so the restored
    // text comes back through here looking exactly like a fresh edit. Recording
    // it would push the state just left onto the stack and undo would bounce
    // between two values forever, never reaching the third.
    //
    // `move` sets `current` to the step BEFORE calling `apply`, so by the time
    // the value arrives it already matches and there is nothing to record. An
    // earlier draft carried a separate "this move was ours" flag as well;
    // mutation testing showed it could never fire, because this line had always
    // returned first. It is gone. Move the assignment out of `move` and the two
    // undo tests go red, which is the proof that this is the mechanism.
    if (value === current.current.text) return

    const now = Date.now()
    const previous = current.current
    const typing = Math.abs(value.length - previous.text.length) <= 1
    const continues = typing && lastWasTyping.current && now - lastAt.current < QUIET_MS

    if (!continues) {
      back.current.push(previous)
      // A new edit is a new branch. Whatever was ahead can never be reached
      // again, and keeping it would send Redo somewhere the writer did not go.
      forward.current = []
    }

    current.current = { text: value, caret: io.current?.read() ?? value.length }
    lastAt.current = now
    lastWasTyping.current = typing
    sync()
  }, [value, sync])

  const move = useCallback(
    (direction: 'back' | 'forward') => {
      const from = direction === 'back' ? back : forward
      const to = direction === 'back' ? forward : back
      const step = from.current.pop()
      if (step === undefined) return
      to.current.push({
        text: current.current.text,
        caret: io.current?.read() ?? current.current.caret,
      })
      // BEFORE `apply`, deliberately. See the effect above: this assignment is
      // the whole defence against a move being recorded as an edit.
      current.current = step
      // A move ends any run, so the next keystroke starts a fresh step rather
      // than merging into the one just restored.
      lastWasTyping.current = false
      apply(step.text)
      io.current?.write(step.caret)
      sync()
    },
    [apply, sync],
  )

  return {
    undo: back.current.length > 0 ? () => move('back') : null,
    redo: forward.current.length > 0 ? () => move('forward') : null,
    depth: { back: back.current.length, forward: forward.current.length },
  }
}
