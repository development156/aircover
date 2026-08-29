import { render, screen } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { WhatToGive } from './what-to-give'

/**
 * The guidance block, and the two claims it must keep making.
 *
 * These assert the CLAIM, never the wording. Rewrite any sentence here freely;
 * what may not go is the pairing of a document with what it unlocks, and the
 * warning about the two inputs that fail while looking like they worked.
 */

describe('WhatToGive', () => {
  it('pairs every document with the thing it lets Sahoda do', () => {
    render(<WhatToGive />)

    // Each line is <what> + <what it unlocks>. A list of document types alone
    // would pass a naive text check, so both halves are asserted per item.
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(4)
    for (const item of items) {
      expect(item.textContent ?? '').toMatch(/\bso\b/i)
    }
  })

  it('names prices, policies, customer questions and past work', () => {
    render(<WhatToGive />)
    const list = screen.getByRole('list').textContent ?? ''

    expect(list).toMatch(/price/i)
    expect(list).toMatch(/refund|polic/i)
    expect(list).toMatch(/question/i)
    expect(list).toMatch(/proposal|brochure/i)
  })

  /**
   * THE ONE THAT EARNS ITS PLACE. Both failures are silent: a login wall indexes
   * cleanly and a picture menu is refused with a sentence nobody sees until
   * after they have gone and found the file. Warning first is the whole point of
   * the block.
   */
  it('warns about the two things that fail while looking like they worked', () => {
    render(<WhatToGive />)
    const text = document.body.textContent ?? ''

    expect(text).toMatch(/log in/i)
    expect(text).toMatch(/instagram|facebook/i)
    expect(text).toMatch(/picture/i)
  })

  /** Sahoda speaks in the third person. Founder's ruling, 2026-08-16. */
  it('never speaks in the first person', () => {
    render(<WhatToGive />)
    const text = document.body.textContent ?? ''

    expect(text).not.toMatch(/\bI\b|\bmy\b|\bwe\b|\bour\b/i)
  })

  /** The em dash and en dash left user-facing prose. Founder's ruling, 2026-08-23. */
  it('carries no em dash or en dash', () => {
    render(<WhatToGive />)
    const text = document.body.textContent ?? ''

    expect(text).not.toMatch(/[—–]/)
  })
})
