import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'
import { useState } from 'react'

import { useTextHistory, type CaretIo } from './use-text-history'

/**
 * The undo stack, driven the way the composer drives it.
 *
 * `useTextHistory` does not own the text — it watches a value it is handed and
 * calls back to move it. So every test here uses a driver that owns the string,
 * exactly as `use-variants` does on the real screen: an edit is `setText`, and
 * the hook sees it on the next render. Testing it any other way would test a
 * different hook.
 */
function useDriver(initial: string, io?: CaretIo) {
  const [text, setText] = useState(initial)
  const history = useTextHistory(text, setText, io)
  return { text, setText, history }
}

function driver(initial = '', io?: CaretIo) {
  return renderHook(() => useDriver(initial, io))
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe('one step is a run of typing, not a keystroke', () => {
  test('three quick characters undo back to where the writer started typing', () => {
    const { result } = driver('')

    act(() => result.current.setText('D'))
    act(() => result.current.setText('Di'))
    act(() => result.current.setText('Diw'))
    expect(result.current.history.depth.back).toBe(1)

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('')
  })

  test('a pause of more than half a second starts a new step', () => {
    const { result } = driver('')

    act(() => result.current.setText('D'))
    act(() => vi.advanceTimersByTime(700))
    act(() => result.current.setText('Di'))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('D')
    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('')
  })

  test('deleting one character at a time is the same run as typing it', () => {
    const { result } = driver('Diw')

    act(() => result.current.setText('Di'))
    act(() => result.current.setText('D'))
    act(() => result.current.setText(''))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('Diw')
  })
})

/**
 * The half that matters. Generate, relink, Clear, Trim to fit and a paid rewrite
 * splice all replace many characters at once, and each is the edit a writer most
 * wants back. Burying one inside a typing run would make it unreachable without
 * also throwing away everything typed after it.
 */
describe('anything larger than one character is always its own step', () => {
  test('a generated body dropped in mid-run is undone on its own', () => {
    const { result } = driver('')

    act(() => result.current.setText('D'))
    act(() => result.current.setText('Di'))
    // No pause: this lands inside the quiet window, and must still not merge.
    act(() => result.current.setText('Fresh bread every morning at the shop.'))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('Di')
  })

  test('Clear is one step, and the words come back whole', () => {
    const { result } = driver('Fresh bread every morning.')

    act(() => result.current.setText(''))
    act(() => result.current.history.undo?.())

    expect(result.current.text).toBe('Fresh bread every morning.')
  })

  test('typing after a paste does not fold the paste into the new run', () => {
    const { result } = driver('')

    act(() => result.current.setText('Fresh bread'))
    act(() => result.current.setText('Fresh bread!'))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('Fresh bread')
  })
})

describe('redo', () => {
  test('goes back to the text the undo left', () => {
    const { result } = driver('')

    act(() => result.current.setText('Fresh bread every morning.'))
    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('')

    act(() => result.current.history.redo?.())
    expect(result.current.text).toBe('Fresh bread every morning.')
  })

  test('is gone once the writer edits from the point they undid to', () => {
    const { result } = driver('')

    act(() => result.current.setText('Fresh bread every morning.'))
    act(() => result.current.history.undo?.())
    expect(result.current.history.redo).not.toBeNull()

    act(() => result.current.setText('Fresh cake every morning.'))
    expect(result.current.history.redo).toBeNull()
  })

  test('both controls are absent on an untouched box, so neither renders as usable', () => {
    const { result } = driver('Fresh bread every morning.')
    expect(result.current.history.undo).toBeNull()
    expect(result.current.history.redo).toBeNull()
  })
})

/**
 * THE BUG THIS HOOK IS MOST LIKELY TO HAVE.
 *
 * An undo writes through the same `apply` a keystroke does, so the restored text
 * arrives back looking exactly like a fresh edit. Recording it would push the
 * state just left onto the stack, and undo would become a toggle between two
 * values that never reaches the third. Two steps back is the shortest case that
 * can tell the difference.
 */
describe('an undo is not mistaken for an edit', () => {
  test('two undos reach the original, rather than ping-ponging between two', () => {
    const { result } = driver('one')

    act(() => result.current.setText('one two'))
    act(() => vi.advanceTimersByTime(700))
    act(() => result.current.setText('one two three'))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('one two')
    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('one')
  })

  test('and the forward stack holds every step it walked back over', () => {
    const { result } = driver('one')

    act(() => result.current.setText('one two'))
    act(() => vi.advanceTimersByTime(700))
    act(() => result.current.setText('one two three'))
    act(() => result.current.history.undo?.())
    act(() => result.current.history.undo?.())

    expect(result.current.history.depth.forward).toBe(2)
    act(() => result.current.history.redo?.())
    act(() => result.current.history.redo?.())
    expect(result.current.text).toBe('one two three')
  })
})

describe('the caret', () => {
  test('is put back where it was, not left at the end of the box', () => {
    let caret = 0
    const io: CaretIo = {
      read: () => caret,
      write: (next) => {
        caret = next
      },
    }
    const { result } = driver('', io)

    caret = 5
    act(() => result.current.setText('Fresh bread'))
    caret = 22
    act(() => result.current.setText('Fresh bread every morning.'))

    act(() => result.current.history.undo?.())
    expect(result.current.text).toBe('Fresh bread')
    // 5 is where the caret sat WHEN THE TEXT WAS THIS TEXT, which is the whole
    // claim: a step carries its own caret, not the one from the state it was
    // undone from. `'Fresh bread'.length` is 11, so the lazy end-of-text answer
    // and the correct answer are different numbers here and the test can tell.
    expect(caret).toBe(5)

    act(() => result.current.history.redo?.())
    expect(result.current.text).toBe('Fresh bread every morning.')
    expect(caret).toBe(22)
  })

  test('falls back to the end of the text when there is no box to ask', () => {
    const { result } = driver('')
    act(() => result.current.setText('Fresh bread'))
    act(() => result.current.setText(''))
    act(() => result.current.history.undo?.())
    // No CaretIo passed: nothing throws, and the text still moves.
    expect(result.current.text).toBe('Fresh bread')
  })
})
