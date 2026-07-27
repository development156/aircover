import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { Button } from './button'
import { CardLabel } from './card'
import { CostLabel } from './cost-label'

/**
 * Two Phase-1 defects, both about a label rendering wrong inside a flex box.
 *
 * COST LABELS. A spending button carries its cost in the label (UI_RULES_v3:
 * `Rewrite · 1 credit`, never a tooltip). Those labels were written as
 * `Plan my week · <span>{cost}</span> credits` inside a `gap-2 inline-flex`
 * button — which makes the two bare text runs and the span into three separate
 * FLEX ITEMS. Flex then adds its 8px gap either side of the number ON TOP of the
 * literal spaces already in the JSX, so the button reads "Plan my week ·  20
 * credits" with the number visibly adrift. Making the whole label one element
 * makes it one flex item, and the gap goes back to doing its actual job:
 * separating the icon from the label.
 *
 * CARD LABELS. `CardLabel` hand-rolled the v3 eyebrow — font-mono, 10.5px,
 * 0.14em tracking, uppercase — instead of using the `--t-eyebrow` token that
 * defines exactly that. A hand-rolled copy cannot follow the token when it
 * moves, and 10.5px is off the type scale entirely.
 */

describe('CostLabel renders as a single flex item', () => {
  test('the whole label is one element, not three', () => {
    render(
      <Button>
        <CostLabel action="Plan my week" cost={20} />
      </Button>,
    )

    const button = screen.getByRole('button')
    // One child element and no stray text nodes beside it: that is what makes
    // the button's gap apply once, between icon and label, rather than around
    // every fragment of the sentence.
    expect(button.childNodes).toHaveLength(1)
    expect((button.firstChild as HTMLElement).tagName).toBe('SPAN')
  })

  test('the text has single spaces — no double-spacing from the flex gap', () => {
    render(<CostLabel action="Plan my week" cost={20} />)

    const text = screen.getByText(/plan my week/i).textContent ?? ''
    expect(text).toBe('Plan my week · 20 credits')
    expect(text).not.toMatch(/ {2}/)
  })

  test('singular reads "1 credit", not "1 credits"', () => {
    // Queried via textContent because the number lives in a nested span for
    // tabular alignment, so `getByText` cannot match across the boundary.
    render(<CostLabel action="Rewrite" cost={1} />)

    expect(screen.getByText(/rewrite/i).textContent).toBe('Rewrite · 1 credit')
  })

  test('the number keeps tabular alignment', () => {
    render(<CostLabel action="Generate site" cost={100} />)

    expect(screen.getByText('100').className).toContain('tabular-nums')
  })

  test('zero is a real cost, not a hidden one', () => {
    render(<CostLabel action="Attach media" cost={0} />)

    expect(screen.getByText(/attach media/i).textContent).toBe('Attach media · 0 credits')
  })
})

describe('CardLabel uses the eyebrow token', () => {
  test('it applies type-eyebrow', () => {
    render(<CardLabel>Available credits</CardLabel>)
    const label = screen.getByText('Available credits')

    expect(label.className.split(/\s+/)).toContain('type-eyebrow')
  })

  test('it hand-rolls none of what the token already defines', () => {
    render(<CardLabel>Available credits</CardLabel>)
    const classes = screen.getByText('Available credits').className

    // Each of these is a property of --t-eyebrow / --t-eyebrow-ls. Duplicating
    // one here is how the eyebrow drifts off the token the next time it moves.
    expect(classes).not.toMatch(/font-mono/)
    expect(classes).not.toMatch(/text-\[10\.5px\]/)
    expect(classes).not.toMatch(/tracking-\[/)
    expect(classes).not.toMatch(/\buppercase\b/)
  })
})
