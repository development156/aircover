import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ProgressBar } from './progress-bar'
import { NUMBERED } from './store'

/**
 * THE COUNT BESIDE THE LIST MUST COME FROM THE LIST.
 *
 * It read `— 06` as a literal. Removing the References screen took `NUMBERED`
 * to five and the rail went on promising six, so the last question would have
 * read "05 — 06" and a person would have been waiting for a screen that no
 * longer exists. Shipped that way, briefly, in 2206453.
 */
describe('the progress rail', () => {
  it('names the number of steps there actually are', () => {
    render(<ProgressBar step="1" />)
    expect(screen.getByText(new RegExp(`— *0?${NUMBERED.length}`))).toBeInTheDocument()
  })

  it('counts to the end and stops there', () => {
    render(<ProgressBar step={NUMBERED[NUMBERED.length - 1]!} />)
    const bar = screen.getByRole('progressbar')
    expect(bar).toHaveAttribute('aria-valuenow', String(NUMBERED.length))
    expect(bar).toHaveAttribute('aria-valuemax', String(NUMBERED.length))
  })

  it('holds at the last number on the rivals step rather than inventing one past it', () => {
    render(<ProgressBar step="comp" />)
    expect(screen.getByRole('progressbar')).toHaveAttribute(
      'aria-valuenow',
      String(NUMBERED.length),
    )
  })

  it('renders nothing on the screens outside the numbered run', () => {
    const { container } = render(<ProgressBar step="result" />)
    expect(container).toBeEmptyDOMElement()
  })
})
