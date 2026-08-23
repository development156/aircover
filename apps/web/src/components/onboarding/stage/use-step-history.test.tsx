import { act, render } from '@testing-library/react'
import { useState } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'

import { useStepHistory } from './use-step-history'

/**
 * BACK MEANS THE PREVIOUS STEP, AND FORWARD MEANS THE NEXT ONE.
 *
 * `docs/34` §11 leaves two items open and this file closes both:
 *
 *  · onboarding pushed NO per-step history entry, so Back left the route
 *    entirely even after the typed words were made to survive it;
 *  · forward-after-Back is exercised NOWHERE, for any flow in this product.
 *
 * The second is the one worth having. A Back implementation that consumes its
 * own entries — pushing a new one as it returns — passes every Back test that
 * exists and makes Forward permanently dead, and nothing here would have said
 * so. `jsdom` implements the history stack for real, so `back()` and
 * `forward()` are the browser's own arithmetic rather than a mock of it.
 */

type Step = 'intro' | '1' | '2' | '3' | 'result'
const ORDER: Step[] = ['intro', '1', '2', '3', 'result']
const isStep = (v: unknown): v is Step => typeof v === 'string' && ORDER.includes(v as Step)

/**
 * A component shaped like the real one: `step` is its own state, the hook is
 * told about it, and the hook is allowed to set it back.
 */
function Flow({ onRender }: { onRender?: (step: Step) => void }) {
  const [step, setStep] = useState<Step>('intro')
  useStepHistory<Step>({ step, isStep, skip: ['result'], onPop: setStep })
  onRender?.(step)
  return (
    <div>
      <span data-testid="step">{step}</span>
      {ORDER.map((s) => (
        <button key={s} type="button" data-go={s} onClick={() => setStep(s)}>
          {s}
        </button>
      ))}
    </div>
  )
}

const current = () => document.querySelector('[data-testid="step"]')!.textContent
const go = async (step: Step) => {
  await act(async () => {
    ;(document.querySelector(`[data-go="${step}"]`) as HTMLButtonElement).click()
  })
}

/**
 * Travel the history stack and WAIT FOR THE EVENT, not for a guess.
 *
 * MEASURED with a throwaway probe: jsdom dispatches `popstate` asynchronously
 * after `history.back()`, and a `setTimeout(0)` is too early — the first draft
 * of this file used one and reported three failures against a hook that was
 * working. A fixed delay long enough to pass today is a flake tomorrow, so this
 * resolves on the event itself and rejects if it never arrives. A test that
 * silently continued when nothing happened would be asserting on the state
 * before the press.
 */
/** Flush pending effects. Used only where NO history traversal is involved. */
const settle = async () => {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0))
  })
}

async function travel(direction: 'back' | 'forward'): Promise<void> {
  await act(async () => {
    const arrived = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        window.removeEventListener('popstate', once)
        reject(new Error(`no popstate within 2s of history.${direction}()`))
      }, 2000)
      function once() {
        clearTimeout(timer)
        window.removeEventListener('popstate', once)
        // One more turn, so React has committed the state the listener set.
        setTimeout(resolve, 0)
      }
      window.addEventListener('popstate', once)
    })
    window.history[direction]()
    await arrived
  })
}

beforeEach(() => {
  // Each test starts from one entry. jsdom keeps a real stack across tests
  // otherwise, and a leftover entry makes `back()` land somewhere unrelated.
  window.history.replaceState(null, '', '/onboarding')
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('the browser Back button inside a one-URL flow', () => {
  test('returns to the previous step instead of leaving the route', async () => {
    render(<Flow />)
    await go('1')
    await go('2')
    expect(current()).toBe('2')

    await travel('back')

    expect(current()).toBe('1')
  })

  test('FORWARD AFTER BACK returns to the step that was left', async () => {
    // The item docs/34 records as exercised nowhere. An implementation that
    // pushes a new entry while going back passes the test above and kills
    // Forward permanently — and no existing test in this repository would say
    // so, for any flow.
    render(<Flow />)
    await go('1')
    await go('2')

    await travel('back')
    expect(current()).toBe('1')

    await travel('forward')
    expect(current()).toBe('2')
  })

  test('walks all the way back down a deep stack, one step per press', async () => {
    render(<Flow />)
    await go('1')
    await go('2')
    await go('3')

    for (const expected of ['2', '1']) {
      await travel('back')
      expect(current()).toBe(expected)
    }
  })

  test('the URL never changes, so the router has no navigation to handle', async () => {
    // A `#step-3` implementation would pass every assertion above and hand Next
    // a navigation on a route that is one page with nine internal states.
    render(<Flow />)
    const before = window.location.href
    await go('1')
    await go('2')
    expect(window.location.href).toBe(before)
  })

  test('keeps whatever else already lives in history.state', async () => {
    // history.state is NOT ours — Next keeps its router keys in it, and
    // replacing the object wholesale degrades the next soft navigation into a
    // full reload, silently, and only when someone presses Back.
    window.history.replaceState({ __NA: 'next-owns-this' }, '', '/onboarding')
    render(<Flow />)
    await go('1')

    const state = window.history.state as Record<string, unknown>
    expect(state.__NA).toBe('next-owns-this')
    expect(state.sahodaOnboardingStep).toBe('1')
  })

  test('the first step replaces rather than pushes, so one Back still leaves', async () => {
    // Otherwise a customer who opens onboarding and immediately presses Back is
    // returned to the intro they were already on, and has to press it twice to
    // get out. A flow that is hard to LEAVE is the mirror of the defect.
    const depthBefore = window.history.length
    render(<Flow />)
    await settle()
    expect(window.history.length).toBe(depthBefore)
  })

  test('the result screen is never given an entry', async () => {
    // Its brain was built and paid for in this session; an entry pointing at it
    // would let Back return to a screen whose work has been consumed.
    render(<Flow />)
    await go('1')
    const depth = window.history.length
    await go('result')
    expect(window.history.length).toBe(depth)
  })

  test('ignores a state object written by something that is not this flow', async () => {
    render(<Flow />)
    await go('1')
    await go('2')

    // Someone else's popstate — a browser extension, an older build, Next's own
    // entry from before this hook existed. Rendering `undefined` as a step would
    // blank the flow.
    await act(async () => {
      window.dispatchEvent(new PopStateEvent('popstate', { state: { other: 'thing' } }))
    })
    await settle()

    expect(current()).toBe('2')
  })
})
