import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, test } from 'vitest'

import { CardLine } from '@/components/studio/card-line'
import { describeDesignCard } from '@/lib/studio/card-copy'

/**
 * THE WORD A CUSTOMER READS, AND THE NUMERAL BESIDE IT.
 *
 * `card-copy.ts` decides WHAT to say; this decides how it reads. The word
 * "slides" is asserted here because that is where it exists, and it is the
 * whole point of the change: the card used to say "pages", which is the
 * document schema's word for the same thing and appears nowhere else a
 * customer looks.
 */
afterEach(cleanup)

const line = (pageCount: number, presetId = 'square') => describeDesignCard({ pageCount, presetId })

describe('CardLine', () => {
  test('a carousel is measured in slides, the word every other screen uses', () => {
    render(<CardLine line={line(3)} />)
    expect(screen.getByText(/slides/i)).toBeTruthy()
    expect(screen.queryByText(/\bpages?\b/i)).toBeNull()
  })

  test('a single design says its size and counts nothing at anybody', () => {
    render(<CardLine line={line(1)} />)
    expect(screen.getByText(/square/i)).toBeTruthy()
    expect(screen.queryByText(/slide/i)).toBeNull()
  })

  /** Every figure in this product is set in tabular numerals. */
  test('the count is a tabular numeral, so a column of cards lines up', () => {
    const { container } = render(<CardLine line={line(3)} />)
    const numeral = container.querySelector('.num')
    expect(numeral).not.toBeNull()
    expect(numeral!.textContent).toBe('3')
  })

  /**
   * A design saved under a retired size, with one slide, has nothing true to
   * say. The ELEMENT has to be absent, not merely empty: the card is a
   * `flex flex-col gap-2`, so an empty span is still a flex child and still
   * costs a gap, which reads as a value that failed to load. An earlier
   * version of this test asserted `textContent` was empty, which is true of an
   * empty span too, so it passed whether the element was rendered or not.
   */
  test('nothing true to say renders no element at all', () => {
    const { container } = render(<CardLine line={line(1, 'a-size-from-2019')} />)
    expect(container.firstChild).toBeNull()
    expect(container.querySelector('span')).toBeNull()
  })

  test('a retired size still says how many slides, because that is still true', () => {
    render(<CardLine line={line(4, 'a-size-from-2019')} />)
    expect(screen.getByText(/slides/i)).toBeTruthy()
  })

  test('the separator only appears when there are two halves to separate', () => {
    const { container } = render(<CardLine line={line(1)} />)
    expect(container.textContent).not.toContain('·')
  })
})
