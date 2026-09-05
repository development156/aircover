import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ViewerRemixToggle } from './viewer-remix-toggle'

describe('ViewerRemixToggle', () => {
  it('locked: names the real reason, offers no toggle to press', () => {
    render(<ViewerRemixToggle locked on={true} onChange={vi.fn()} />)
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
    expect(screen.getByText(/cannot yet remember/i)).toBeInTheDocument()
  })

  it('live and on: pressing turns it off', () => {
    const onChange = vi.fn()
    render(<ViewerRemixToggle locked={false} on={true} onChange={onChange} />)
    const button = screen.getByRole('button', { name: /keep with this one/i })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(button)
    expect(onChange).toHaveBeenCalledWith(false)
    expect(screen.getByText(/saves the result as a version/i)).toBeInTheDocument()
  })

  it('live and off: the sentence says a separate picture, not a version', () => {
    render(<ViewerRemixToggle locked={false} on={false} onChange={vi.fn()} />)
    expect(screen.getByRole('button')).toHaveAttribute('aria-pressed', 'false')
    expect(screen.getByText(/starts a separate picture/i)).toBeInTheDocument()
  })
})
