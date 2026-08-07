import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { BalanceHero } from './balance-hero'
import type { WalletBalance } from '@/lib/wallet/balance'

/**
 * The hero number is the most important figure on the surface — it is the answer
 * to "can I afford to do the thing". After the v3 token swap it inherited body
 * colour from `<body>` (--ink-body), which put it at exactly the same visual
 * weight as the "credits to spend" label sitting next to it and the eyebrow
 * above it. A number that reads as a caption is not doing its job.
 *
 * These tests pin the display treatment: `.num` (mono + tabular, one of the
 * three places v3 permits mono) and --ink, the heading ink, so the figure
 * outranks its own label. They assert on classes rather than computed style
 * because jsdom does not load the stylesheet — the classes ARE the contract
 * between this component and the token layer.
 */

/**
 * Every figure is deliberately distinct. A fixture where `total === available`
 * makes `getByText` ambiguous between the hero and the subline, so the assertion
 * would either throw or silently grade the wrong element.
 */
function balance(over: Partial<WalletBalance> = {}): WalletBalance {
  return {
    total: 1500,
    held: 260,
    available: 1240,
    hasHold: true,
    heldNote: null,
    ...over,
  }
}

/** The element rendering just the big available figure. */
function heroNumber(): HTMLElement {
  const el = screen.getByText('1,240')
  expect(el.tagName, 'the hero figure should be its own element, not inline text').toBe('SPAN')
  return el
}

describe('BalanceHero display treatment', () => {
  test('the hero figure is mono + tabular via .num', () => {
    render(<BalanceHero balance={balance()} staleNote={null} />)

    // `.num` is the tokens.css class: font-family --mono + tabular-nums. It must
    // be the class, not a hand-rolled `font-mono tabular-nums` pair, so the
    // three sanctioned mono sites stay greppable.
    expect(heroNumber().className.split(/\s+/)).toContain('num')
  })

  test('the hero figure uses heading ink, not body ink', () => {
    render(<BalanceHero balance={balance()} staleNote={null} />)
    const classes = heroNumber().className

    expect(classes, 'the figure must set --ink explicitly').toMatch(/\btext-ink\b/)
    // It must not fall back to inherited body colour, which is --ink-body.
    expect(classes).not.toMatch(/\btext-ink-body\b/)
    expect(classes).not.toMatch(/\btext-muted\b/)
  })

  test('the figure outranks its label — the label is not given the same treatment', () => {
    render(<BalanceHero balance={balance()} staleNote={null} />)
    const label = screen.getByText(/credits to spend/i)

    expect(label.className.split(/\s+/)).not.toContain('num')
    expect(label.className).not.toMatch(/\btext-ink\b/)
  })

  test('a real zero still gets the display treatment', () => {
    // A zero balance is knowledge, not an error state — it must read as loudly
    // as any other figure, or the one moment the user most needs to notice it
    // is the moment it recedes.
    render(
      <BalanceHero balance={balance({ total: 40, held: 40, available: 0 })} staleNote={null} />,
    )
    const zero = screen.getByText('0')

    expect(zero.className.split(/\s+/)).toContain('num')
    expect(zero.className).toMatch(/\btext-ink\b/)
  })

  test('the secondary total/held line stays sans and merely aligns its digits', () => {
    // v3 allows mono in exactly three places. This line is not one of them.
    render(<BalanceHero balance={balance()} staleNote={null} />)
    const totalCell = screen.getByText('1,500')

    expect(totalCell.className.split(/\s+/)).not.toContain('num')
    expect(totalCell.className).toMatch(/tabular-nums/)
  })
})
