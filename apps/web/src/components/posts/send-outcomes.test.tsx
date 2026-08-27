import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { SendOutcomes } from './send-outcomes'
import type { PublishOutcome } from '@/lib/posts/publish-one'

/**
 * THE LIST THAT MAKES A SINGLE SEND BUTTON HONEST.
 *
 * A single "Send now" was refused in this codebase for a long time, on the
 * grounds that one post can be live on Instagram and refused by X in the same
 * second and one verdict cannot cover both. The button is fine; the BANNER was
 * the problem. So the whole argument now rests on this component: one row per
 * channel, each with its own verdict, and no sentence anywhere that adds them
 * up.
 *
 * If these guards go, the button becomes the false certainty the surface was
 * built to prevent. That is why the mixed case is the first test.
 */

const live = (
  channel: PublishOutcome['channel'],
  permalink = 'https://t.test/1',
): PublishOutcome => ({
  ok: true,
  channel,
  permalink,
  alreadyPublished: false,
})

const failed = (channel: PublishOutcome['channel'], message: string): PublishOutcome => ({
  ok: false,
  channel,
  message,
})

describe('SendOutcomes — one row per channel, never a summary', () => {
  test('a half-worked send shows BOTH truths at once', () => {
    // THE ONE THE WHOLE DESIGN RESTS ON. Two channels, opposite results, from
    // one press. Anything that reported this as "Published" or as "Failed"
    // would be wrong in one direction for one of them.
    const { container } = render(
      <SendOutcomes
        outcomes={[live('instagram'), failed('x', 'That account lost its permission.')]}
      />,
    )

    expect(container.querySelector('[data-send-outcome-ok="yes"]')).not.toBeNull()
    expect(container.querySelector('[data-send-outcome-ok="no"]')).not.toBeNull()
    expect(screen.getByText(/Live on Instagram/)).toBeInTheDocument()
    expect(screen.getByText(/Not sent to X/)).toBeInTheDocument()
    expect(screen.getByText('That account lost its permission.')).toBeInTheDocument()
  })

  test('a success carries a link to the real post, because that is the proof', () => {
    // `publishOne` turns a permalink-less 201 into a FAILURE, so a success row
    // always has somewhere to go. A success banner with nothing to click is a
    // claim the product cannot back.
    //
    // The LABEL is `LiveLink`'s ("View on LinkedIn") rather than the "View the
    // post" this file first hand-rolled. Retargeted to the claim: the assertion
    // is about the destination, and the role and the href carry it.
    render(<SendOutcomes outcomes={[live('linkedin', 'https://linkedin.test/42')]} />)

    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://linkedin.test/42')
  })

  test('a FIXTURE permalink is offered as no link at all', () => {
    // Coverage this file gained by using `LiveLink` instead of copying its
    // markup. `fixture://` is a simulation marker, not an address, and rendering
    // it as a link sends the reader to a page that does not exist. The row still
    // appears — something did happen and the reader should see the channel — it
    // simply has nowhere to point.
    const { container } = render(<SendOutcomes outcomes={[live('x', 'fixture://x/1')]} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(container.querySelector('[data-send-outcome="x"]')).not.toBeNull()
  })

  test('a failure row offers no link, because there is nothing to look at', () => {
    render(<SendOutcomes outcomes={[failed('x', 'X refused it.')]} />)

    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  test('"already live" and "live" are different sentences and stay different', () => {
    // A press that changed nothing must not read as a press that published. The
    // row already carried a permalink; this send was a no-op.
    render(
      <SendOutcomes
        outcomes={[
          { ok: true, channel: 'x', permalink: 'https://x.test/1', alreadyPublished: true },
        ]}
      />,
    )

    expect(screen.getByText(/Already live on X/)).toBeInTheDocument()
    expect(screen.queryByText(/^Live on X/)).not.toBeInTheDocument()
  })

  test('renders nothing at all before a send has happened', () => {
    // An empty results box reads as "all fine" when it means "not started".
    const { container } = render(<SendOutcomes outcomes={[]} />)

    expect(container.querySelector('[data-send-outcomes]')).toBeNull()
  })

  test('keeps the order it was handed, which is the order the reader was promised', () => {
    const { container } = render(
      <SendOutcomes outcomes={[live('x'), failed('instagram', 'nope'), live('linkedin')]} />,
    )

    const order = [...container.querySelectorAll('[data-send-outcome]')].map((el) =>
      el.getAttribute('data-send-outcome'),
    )
    expect(order).toEqual(['x', 'instagram', 'linkedin'])
  })

  test('never prints a count or a verdict over the whole send', () => {
    // The guard against the banner coming back by another name. "1 of 2
    // published" is the same lie in a smaller font: it invites the reader to
    // stop reading the rows.
    const { container } = render(
      <SendOutcomes outcomes={[live('instagram'), failed('x', 'nope')]} />,
    )
    const text = container.textContent ?? ''

    expect(text).not.toMatch(/\b\d+\s+of\s+\d+\b/i)
    expect(text).not.toMatch(/\ball (?:published|sent)\b/i)
    expect(text).not.toMatch(/\bpartially\b/i)
  })
})
