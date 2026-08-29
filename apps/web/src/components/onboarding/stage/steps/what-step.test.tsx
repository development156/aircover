import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, test, vi } from 'vitest'
import { useState } from 'react'

import { DEFAULT_DATA, type OnboardingData } from '../store'
import { WhatStep } from './what-step'

/**
 * "Other" has to ASK, because the word itself is not evidence.
 *
 * `use-build.ts`'s `intakeTextOf` joins `data.category` into the text handed to
 * the classifier, alongside the positioning sentence and the audience. So the
 * chip word is read the same way "we run a bakery" is read — which makes the
 * literal string "Other" the one chip that contributes nothing while looking
 * like an answer. A typed trade ("wedding photography") is real evidence.
 *
 * ── WHAT THESE TESTS DO NOT COVER ────────────────────────────────────────────
 * They assert what the component holds and hands back through `patch`. They do
 * not run the classifier, so "the lexicon reads the typed words usefully" is
 * asserted nowhere here — only that the words reach the field the classifier is
 * built from.
 */

/** A host that keeps state, so `patch` behaves the way the stage's does. */
function Harness({ onPatch }: { onPatch?: (next: Partial<OnboardingData>) => void }) {
  const [data, setData] = useState<OnboardingData>({
    ...DEFAULT_DATA,
    palette: [],
    logoName: '',
  })
  return (
    <WhatStep
      data={data}
      patch={(next) => {
        onPatch?.(next)
        setData((prev) => ({ ...prev, ...next }))
      }}
    />
  )
}

const OTHER_LABEL = 'Your kind of business'

describe('the Closest fit chips', () => {
  test('asks what the business is when Other is picked', async () => {
    render(<Harness />)

    // Guard the guard: absent before the click, so its presence after means the
    // click did it rather than the field having been there all along.
    expect(screen.queryByLabelText(OTHER_LABEL)).not.toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))

    expect(screen.getByLabelText(OTHER_LABEL)).toBeInTheDocument()
  })

  test('keeps the typed trade as the category, not the word Other', async () => {
    const onPatch = vi.fn()
    render(<Harness onPatch={onPatch} />)

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.type(screen.getByLabelText(OTHER_LABEL), 'wedding photography')

    // The claim: what the classifier will read is the trade. Asserting the last
    // patch rather than a truthy blob, because `category: 'Other'` would also be
    // "a category was set" and is exactly the defect.
    expect(onPatch).toHaveBeenLastCalledWith({ category: 'wedding photography' })
    expect(onPatch).not.toHaveBeenCalledWith({ category: 'Other' })
  })

  test('says the typed trade back, the same way it does for a chip', async () => {
    render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.type(screen.getByLabelText(OTHER_LABEL), 'dental clinic')

    expect(screen.getByText(/dental clinic/)).toBeInTheDocument()
  })

  test('claims nothing while Other is open and empty', async () => {
    const { container } = render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))

    // The read-back is the product asserting it understood something. With an
    // empty box it has been told nothing, and saying "Got it" would be a claim
    // about an answer that does not exist.
    //
    // ASSERTED ON THE CLASS, AND THAT IS NOT LAZINESS. `AiLine` always renders
    // its sentence and toggles `.show`/`.hide`, so the text is in the DOM
    // either way and `queryByText` finds it while a reader sees nothing.
    // MEASURED in `styles/onboarding.css:946`: `.ai.hide { display: none }`,
    // which also takes it out of the accessibility tree despite the
    // `aria-live`. jsdom does not load that stylesheet, so `toBeVisible()`
    // cannot see the rule either — the class IS the mechanism here, and this
    // test goes red if the component stops setting it.
    expect(container.querySelector('.ai')).toHaveClass('hide')
  })

  test('drops the typed trade when Other is switched off', async () => {
    const onPatch = vi.fn()
    render(<Harness onPatch={onPatch} />)

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.type(screen.getByLabelText(OTHER_LABEL), 'dental clinic')
    await userEvent.click(screen.getByRole('button', { name: 'Other' }))

    expect(screen.queryByLabelText(OTHER_LABEL)).not.toBeInTheDocument()
    expect(onPatch).toHaveBeenLastCalledWith({ category: '' })
  })

  test('replaces the typed trade when a named chip is picked instead', async () => {
    const { container } = render(<Harness />)

    await userEvent.click(screen.getByRole('button', { name: 'Other' }))
    await userEvent.type(screen.getByLabelText(OTHER_LABEL), 'dental clinic')
    await userEvent.click(screen.getByRole('button', { name: 'Agency' }))

    expect(screen.queryByLabelText(OTHER_LABEL)).not.toBeInTheDocument()
    expect(screen.queryByText(/dental clinic/)).not.toBeInTheDocument()
    // Scoped to the read-back: "Agency" is also the chip's own label, so an
    // unscoped match would pass on the button alone and prove nothing about
    // what the category became.
    expect(container.querySelector('.ai')).toHaveTextContent('Agency')
    expect(screen.getByRole('button', { name: 'Agency' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('reopens Other holding the trade a resumed session came back with', () => {
    // Save and exit persists `category` verbatim, so a resumed session arrives
    // with a typed trade and no memory of which chip produced it. The step has
    // to recognise its own value rather than render six chips and no box.
    render(<WhatStep data={{ ...DEFAULT_DATA, category: 'wedding photography' }} patch={vi.fn()} />)

    expect(screen.getByLabelText(OTHER_LABEL)).toHaveValue('wedding photography')
    expect(screen.getByRole('button', { name: 'Other' })).toHaveAttribute('aria-pressed', 'true')
  })

  test('does not mistake a named chip for a typed trade', () => {
    render(<WhatStep data={{ ...DEFAULT_DATA, category: 'Agency' }} patch={vi.fn()} />)

    expect(screen.queryByLabelText(OTHER_LABEL)).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Agency' })).toHaveAttribute('aria-pressed', 'true')
  })
})
