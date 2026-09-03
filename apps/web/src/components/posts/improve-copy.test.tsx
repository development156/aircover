import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { CaptionRewriteInputSchema } from '@sahoda/shared'

import { rewriteCaption } from '@/app/actions/posts-ai'

import { ImproveCopy } from './improve-copy'

vi.mock('@/app/actions/posts-ai', () => ({ rewriteCaption: vi.fn() }))

const called = vi.mocked(rewriteCaption)

beforeEach(() => {
  called.mockReset()
  // A defined default. Left unset, the action resolves `undefined` and the
  // component reads `.ok` off it inside a transition, where React swallows the
  // TypeError — a test would then pass through a crash.
  called.mockResolvedValue({ ok: false, insufficient: false, message: 'not stubbed' } as never)
})
afterEach(cleanup)

const BODY = 'we open at 8 evry morning and the bread is fresh'
const BETTER = 'We open at 8 every morning, and the bread is fresh.'

function improve(body = BODY) {
  const onAccept = vi.fn()
  const root = render(<ImproveCopy target="X copy" body={body} onAccept={onAccept} />).container
  return { root, onAccept }
}

function ok(text = BETTER) {
  called.mockResolvedValue({ ok: true, text, balanceAfter: 99, creditsCharged: 1 } as never)
}

const mode = (label: string) =>
  screen.getByRole('button', { name: `Rewrite X copy, ${label.toLowerCase()}` })

/**
 * IMPROVE THIS COPY, IN A TONE YOU PICK.
 *
 * The behaviour that matters here is not "does it call the model". It is that
 * the model's answer does NOT become the writer's post until they say so.
 */

describe('the modes on offer', () => {
  test('are the four tone modes, each named for what it does to the writing', () => {
    improve()
    for (const label of ['Polish', 'Professional', 'Friendly', 'Creative']) {
      expect(mode(label)).toBeTruthy()
    }
  })

  test('every one is a real instruction the frozen contract accepts', () => {
    // One fresh render per mode: pressing a mode swaps the buttons for the
    // pending lines, so four clicks in a row would find nothing after the first.
    const sent: unknown[] = []
    for (const label of ['Polish', 'Professional', 'Friendly', 'Creative']) {
      improve()
      fireEvent.click(mode(label))
      sent.push(called.mock.calls[called.mock.calls.length - 1]![1])
      cleanup()
    }

    // The failure this catches is a label wired to a string the schema refuses,
    // which would spend nothing and fail at the server for no visible reason.
    expect(sent).toEqual(['polish', 'professional', 'friendly', 'creative'])
    for (const instruction of sent) {
      expect(
        CaptionRewriteInputSchema.safeParse({ text: BODY, instruction }).success,
        `${String(instruction)} is not in the contract`,
      ).toBe(true)
    }
  })

  test('none of them is called an enhancement', () => {
    const { root } = improve()
    // docs/44 lists "enhance" among the AI-tell words this product does not use.
    expect(root.textContent ?? '').not.toMatch(/enhanc/i)
  })

  test('the price is on screen before anything is spent', () => {
    improve()
    expect(screen.getByText(/credit each/i)).toBeTruthy()
    expect(called).not.toHaveBeenCalled()
  })
})

/**
 * THE RULING THIS CONTROL EXISTS UNDER.
 *
 * REQUESTS §19: the founder chose suggest-and-accept over silent rewriting,
 * because a product that swaps a person's sentence for a model's and keeps
 * calling it theirs is quoting our words back as their own. These are the guards
 * on that, and they are the reason this component is not `InlineRewrite`.
 */
describe('it suggests, it does not replace', () => {
  test('the improved version arrives BESIDE the writer, and changes nothing', async () => {
    ok()
    const { onAccept } = improve()

    fireEvent.click(mode('Polish'))

    expect(await screen.findByText(BETTER)).toBeTruthy()
    expect(onAccept).not.toHaveBeenCalled()
  })

  test('"Use this" is what puts it in the box, and only then', async () => {
    ok()
    const { onAccept } = improve()
    fireEvent.click(mode('Friendly'))
    await screen.findByText(BETTER)

    fireEvent.click(screen.getByRole('button', { name: /^Use Sahoda's version/ }))

    expect(onAccept).toHaveBeenCalledExactlyOnceWith(BETTER)
  })

  test('"Keep mine" discards it and never touches the writer\'s words', async () => {
    ok()
    const { root, onAccept } = improve()
    fireEvent.click(mode('Creative'))
    await screen.findByText(BETTER)

    fireEvent.click(screen.getByRole('button', { name: /^Keep your own/ }))

    await waitFor(() => expect(root.querySelector('[data-improve-suggestion]')).toBeNull())
    expect(onAccept).not.toHaveBeenCalled()
  })
})

describe('what it refuses, and why', () => {
  test('offers nothing on an empty box rather than a button that cannot work', () => {
    const { root } = improve('')
    expect(root.querySelector('[data-improve-copy]')).toBeNull()
  })

  test('states the real limit when the copy is past what one call can take', () => {
    // The contract caps `text` at 8,000 because the charge is flat. Sending it
    // anyway would spend a credit to be refused by a schema.
    improve('a'.repeat(8_001))

    expect(screen.getByText(/8,001/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: /Improve X copy/ })).toBeNull()
    expect(called).not.toHaveBeenCalled()
  })

  test('a shortfall names the gap and a way out, and says nothing was charged', async () => {
    called.mockResolvedValue({
      ok: false,
      insufficient: true,
      required: 1,
      available: 0,
      message: 'unused',
    } as never)
    improve()

    fireEvent.click(mode('Polish'))

    expect(await screen.findByText(/nothing was charged/i)).toBeTruthy()
    // The one refusal in this product that must name a route out.
    expect(screen.getByRole('link', { name: /top up/i }).getAttribute('href')).toBe('/wallet')
  })

  test("a failure shows the server's own sentence rather than inventing one", async () => {
    called.mockResolvedValue({
      ok: false,
      insufficient: false,
      message: 'Could not rewrite this caption. Try again.',
    } as never)
    const { onAccept } = improve()

    fireEvent.click(mode('Polish'))

    expect(await screen.findByText('Could not rewrite this caption. Try again.')).toBeTruthy()
    expect(onAccept).not.toHaveBeenCalled()
  })
})

describe('what the panel calls itself', () => {
  test('says “Rewrite this”, and says it once', () => {
    improve()

    // A copy change, pinned so it cannot drift back. `Improve this copy` is what
    // this said until 2026-08-28.
    expect(screen.getByText('Rewrite this')).toBeVisible()
    expect(screen.queryByText(/improve this copy/i)).not.toBeInTheDocument()
  })

  test('never says “improve” anywhere a person can read or hear it', () => {
    const { root } = improve()

    // ── THE HALF-RENAME THIS CATCHES ────────────────────────────────────────
    // The heading is only one of four places the word appeared: the four tone
    // buttons' accessible names ("Improve X copy, polish"), the waiting line,
    // and the too-long refusal all carried it too. Renaming the heading alone
    // would leave a screen-reader user hearing a verb that is nowhere on the
    // screen, and the refusal sentence describing a different feature.
    //
    // Checked over the RENDERED TEXT and over every accessible name, because
    // three of the four were invisible to a text query.
    expect(root.textContent).not.toMatch(/improve/i)
    for (const el of root.querySelectorAll('[aria-label]')) {
      expect(el.getAttribute('aria-label')).not.toMatch(/improve/i)
    }
  })

  test('and not in the refusal a very long post gets', () => {
    // The other branch a resting-panel sweep cannot reach: this sentence only
    // renders past 8,000 characters. Reverting it alone left all fourteen tests
    // green while the one message a blocked writer actually reads described a
    // feature by a name that is no longer on the screen.
    const { root } = improve('x'.repeat(9_000))

    expect(root.textContent).toMatch(/past the/i)
    expect(root.textContent).not.toMatch(/improve/i)
  })

  test('and not while it is waiting either', async () => {
    // ── THE ONE THE SWEEP ABOVE CANNOT SEE ──────────────────────────────────
    // The waiting lines only exist DURING an in-flight call, so a rendered-text
    // sweep of the resting panel never touches them. Reverting that line alone
    // left all thirteen tests green while a person watching the panel work read
    // "Waiting on the improved version…" under a heading saying Rewrite this.
    //
    // `PendingLines` walks its lines on an 1800ms interval and stops on the
    // last, so the offending line is the SECOND and is not on screen at the
    // click. The clock is driven forward rather than waited on — a real 3.6
    // second sleep is how a suite becomes something nobody runs — and the fake
    // timers are installed BEFORE the render, because an interval created under
    // the real clock does not answer to them.
    vi.useFakeTimers()
    try {
      called.mockImplementation(() => new Promise(() => {}) as never)
      const { root } = improve()
      fireEvent.click(screen.getByRole('button', { name: /polish$/i }))

      for (let step = 0; step < 3; step += 1) {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(1800)
        })
        expect(root.textContent).not.toMatch(/improve/i)
      }

      // And the last line was actually reached, so the loop above cannot pass
      // by never advancing at all.
      expect(root.textContent).toMatch(/still waiting/i)
    } finally {
      vi.useRealTimers()
    }
  })
})
