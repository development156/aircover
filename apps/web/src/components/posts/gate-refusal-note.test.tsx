import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ChannelStatusList } from './channel-status-list'
import { GateRefusalNote } from './gate-refusal-note'
import type { GateRefusal } from '@/lib/posts/gate-refusal'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * The last inch of doc 18 §8: a refusal that names the line, says whether it is
 * inherited or theirs, and offers the rewrite in the same breath.
 *
 * These assert on the three of them being present TOGETHER, because that is the
 * rule — any one of them alone is the block that "only says no", which is what
 * teaches people to route around the product.
 */

const mandated: GateRefusal = {
  decision: 'block',
  regimeBasis: 'declared',
  holdReason: null,
  findings: [
    {
      ruleId: 'health.no-cure-claim',
      tier: 'mandated',
      statement: 'A treatment may not be advertised as a cure.',
      quote: 'a permanent cure',
      rewrite: 'Describe what the treatment does and who it suits.',
    },
  ],
}

const ownRule: GateRefusal = {
  decision: 'block',
  regimeBasis: 'default',
  holdReason: null,
  findings: [
    {
      ruleId: 'owner.red-line.1',
      tier: 'owner',
      statement: 'Never fake urgency.',
      quote: 'order before midnight',
      rewrite: 'Name the real deadline.',
    },
  ],
}

describe('GateRefusalNote', () => {
  test('names the rule, quotes the post, and offers the rewrite', () => {
    render(<GateRefusalNote refusal={mandated} />)

    expect(screen.getByText('A treatment may not be advertised as a cure.')).toBeInTheDocument()
    expect(screen.getByText('a permanent cure')).toBeInTheDocument()
    expect(
      screen.getByText('Describe what the treatment does and who it suits.'),
    ).toBeInTheDocument()
  })

  test('marks an inherited rule as required and an owner rule as theirs', () => {
    const { rerender } = render(<GateRefusalNote refusal={mandated} />)
    expect(screen.getByText('Required')).toBeInTheDocument()

    rerender(<GateRefusalNote refusal={ownRule} />)
    expect(screen.getByText('Your rule')).toBeInTheDocument()
    expect(screen.getByText(/Brand Brain/)).toBeInTheDocument()
  })

  test('does not attribute a floor rule to an industry nobody declared', () => {
    render(<GateRefusalNote refusal={{ ...mandated, regimeBasis: 'default' }} />)

    expect(screen.getByText(/every business/)).toBeInTheDocument()
    expect(screen.queryByText(/you told us/)).not.toBeInTheDocument()
  })

  test('explains a hold that has no finding attached to it', () => {
    // Otherwise a post stopped by an unavailable checker shows a refusal with
    // nothing in it.
    render(
      <GateRefusalNote
        refusal={{
          decision: 'hold',
          regimeBasis: 'default',
          holdReason: 'The wording check did not finish in time.',
          findings: [],
        }}
      />,
    )

    expect(screen.getByText('Waiting for a person to read this')).toBeInTheDocument()
    expect(screen.getByText('The wording check did not finish in time.')).toBeInTheDocument()
  })

  test('offers no way to publish it anyway', () => {
    // A mandated rule is not the owner's to waive, and an override on their own
    // rule turns their red line into a speed bump.
    const { container } = render(<GateRefusalNote refusal={mandated} />)

    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(screen.queryByText(/anyway/i)).not.toBeInTheDocument()
  })
})

const row = (over: Partial<VariantStatusRow> = {}): VariantStatusRow => ({
  channel: 'x',
  status: 'failed',
  permalink: null,
  platformPostId: null,
  simulated: false,
  errorMessage: null,
  errorCode: 'GATE_BLOCKED',
  gateRefusal: mandated,
  retryable: true,
  ...over,
})

describe('ChannelStatusList — the gate refusal reaches the screen', () => {
  test('shows the named rule instead of the generic code sentence', () => {
    render(<ChannelStatusList rows={[row()]} />)

    expect(screen.getByText('A treatment may not be advertised as a cure.')).toBeInTheDocument()
    // The one-line code copy would be redundant next to a named rule, and the
    // failure mode this guards is the reverse: the structure being dropped and
    // the customer seeing only "this breaks a rule" with no rule.
    expect(screen.queryByText(/Reword it and try again/)).not.toBeInTheDocument()
  })

  test('falls back to the code copy when no verdict was recorded', () => {
    // An old row, or a shape we could not read. Worse than the real refusal,
    // never a broken screen.
    render(<ChannelStatusList rows={[row({ gateRefusal: null })]} />)

    expect(screen.getByText(/Reword it and try again/)).toBeInTheDocument()
  })

  test('shows nothing gate-related on a channel that published', () => {
    render(<ChannelStatusList rows={[row({ status: 'published', gateRefusal: null })]} />)

    expect(screen.queryByRole('note')).not.toBeInTheDocument()
  })
})
