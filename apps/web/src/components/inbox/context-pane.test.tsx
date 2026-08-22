import { render } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ContextPane } from './context-pane'

const OPEN_SOMETHING = /open something from the list/i

/**
 * The context pane was the THIRD pane announcing nothing on the one screen every
 * new workspace sees (QA #21), and its line was an instruction — "open something
 * from the list" — that cannot be followed when the list is provably empty.
 *
 * These assert the CLAIM, not the sentence: rewrite the copy freely, keep the
 * guarantee that an unfollowable instruction is never issued.
 */
describe('the context pane', () => {
  test('issues no instruction when the list has nothing to open', () => {
    render(<ContextPane hasSomethingToOpen={false} />)
    expect(document.body.textContent ?? '').not.toMatch(OPEN_SOMETHING)
  })

  test('keeps its header either way — the pane is structure, not a message', () => {
    render(<ContextPane hasSomethingToOpen={false} />)
    expect(document.querySelector('h2')?.textContent).toBe('Customer')
  })

  test('still says how it gets filled once the list has rows', () => {
    render(<ContextPane hasSomethingToOpen />)
    expect(document.body.textContent ?? '').toMatch(OPEN_SOMETHING)
  })
})
