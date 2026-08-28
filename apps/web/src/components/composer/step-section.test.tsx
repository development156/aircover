import { afterEach, describe, expect, test } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'

import { StepSection } from './step-section'

afterEach(cleanup)

/**
 * A STEP YOU HAVE NOT EARNED YET.
 *
 * The claim this file has to keep is mechanical, not cosmetic: a locked step is
 * genuinely unusable, by mouse AND by keyboard AND by screen reader. Dimming is
 * the part a person sees; it is the least important part.
 */
describe('a locked step', () => {
  test('is on the screen, with its heading readable', () => {
    render(
      <StepSection index={2} title="Choose where it goes" step={{ access: 'locked', reason: 'r' }}>
        <button type="button">Pick X</button>
      </StepSection>,
    )

    // Never hidden. "Where did the channels go" is a question the product
    // cannot answer once it has stopped rendering the answer.
    expect(screen.getByRole('heading', { name: /choose where it goes/i })).toBeVisible()
  })

  test('says what to do about it, in words', () => {
    render(
      <StepSection
        index={2}
        title="Choose where it goes"
        step={{ access: 'locked', reason: 'Write your post first.' }}
      >
        <button type="button">Pick X</button>
      </StepSection>,
    )

    // A dimmed panel with no sentence is indistinguishable from a broken one.
    expect(screen.getByText('Write your post first.')).toBeVisible()
  })

  test('is REFUSED, not merely dimmed', () => {
    const { container } = render(
      <StepSection index={2} title="Choose where it goes" step={{ access: 'locked', reason: 'r' }}>
        <button type="button">Pick X</button>
      </StepSection>,
    )

    // ── WHAT THIS PROVES, AND WHAT IT HONESTLY CANNOT ───────────────────────
    // `pointer-events-none` plus opacity is the tempting version and it is the
    // wrong one: a keyboard user tabs straight past the dimming into a control
    // that looks unavailable and is not. `inert` is what refuses in a browser —
    // no clicks, no focus, no typing — and `aria-hidden` is what takes the
    // subtree out of the accessibility tree.
    //
    // MEASURED, and worth stating plainly: **jsdom implements no `inert`
    // behaviour at all.** A button inside an `inert` subtree still takes focus
    // and still fires its handler here. So the role query below is passing
    // because of `aria-hidden`, not because of `inert`, and the `inert`
    // assertion is a spelling check on an attribute this runtime ignores.
    //
    // Both are asserted on the SAME element, which is the claim worth keeping
    // in this file: whichever of the two a future edit drops, one of these two
    // lines goes red. Whether a real browser honours `inert` on this markup is
    // an end-to-end question and is not answered here.
    const inertWrapper = container.querySelector('[inert]')
    expect(inertWrapper).not.toBeNull()
    expect(inertWrapper?.getAttribute('aria-hidden')).toBe('true')
    expect(inertWrapper?.contains(screen.getByText('Pick X'))).toBe(true)
    expect(screen.queryByRole('button', { name: 'Pick X' })).not.toBeInTheDocument()
  })

  test('LOOKS unavailable as well as being unavailable', () => {
    const { container } = render(
      <StepSection index={2} title="Choose where it goes" step={{ access: 'locked', reason: 'r' }}>
        <button type="button">Pick X</button>
      </StepSection>,
    )

    // `inert` refuses the click and says nothing to a person's eye. A control
    // that looks entirely normal and does nothing when pressed reads as a
    // broken product, so the dimming is not decoration — it is the half of the
    // state that a sighted reader actually receives. Asserted on the same
    // element that carries the refusal, so the two cannot drift apart.
    const inertWrapper = container.querySelector('[inert]')
    expect(inertWrapper?.className.split(/\s+/)).toContain('opacity-45')
  })

  test('marks itself so a screen can be checked at a glance', () => {
    const { container } = render(
      <StepSection index={3} title="Send it" step={{ access: 'locked', reason: 'r' }}>
        <button type="button">Post now</button>
      </StepSection>,
    )

    expect(container.querySelector('[data-step="3"]')?.getAttribute('data-step-locked')).toBe(
      'true',
    )
  })
})

describe('an open step', () => {
  test('is fully usable and explains nothing', () => {
    const { container } = render(
      <StepSection index={2} title="Choose where it goes" step={{ access: 'open', reason: null }}>
        <button type="button">Pick X</button>
      </StepSection>,
    )

    // Reachable by role — so it is in the accessibility tree and focusable.
    expect(screen.getByRole('button', { name: 'Pick X' })).toBeVisible()
    expect(container.querySelector('[inert]')).toBeNull()
    // And nothing is dimmed: an open step that looks unavailable is the same
    // defect as a locked one that looks fine, pointed the other way.
    expect(container.querySelector('.opacity-45')).toBeNull()
    expect(container.querySelector('[data-step="2"]')?.getAttribute('data-step-locked')).toBe(
      'false',
    )
  })
})
