import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const pathname = vi.hoisted(() => ({ value: '/admin/dev' }))
vi.mock('next/navigation', () => ({ usePathname: () => pathname.value }))

import { AdminSubNav } from './sub-nav'

describe('AdminSubNav', () => {
  it('links only to sections that exist, and marks the current one', () => {
    render(<AdminSubNav />)

    const dev = screen.getByRole('link', { name: 'Dev' })
    expect(dev).toHaveAttribute('href', '/admin/dev')
    expect(dev).toHaveAttribute('aria-current', 'page')
  })

  it('links QA now that the console exists', () => {
    render(<AdminSubNav />)
    expect(screen.getByRole('link', { name: 'QA' })).toHaveAttribute('href', '/admin/qa')
  })
})

describe('the nav does not lie about where it can take you', () => {
  it('ships all five sections as real links', () => {
    render(<AdminSubNav />)

    for (const label of ['Dev', 'QA', 'Applications', 'Credits', 'Team']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('still renders an unbuilt section as disabled text rather than a link', () => {
    // No live example any more — passed in explicitly so the guarantee stays
    // covered instead of rotting into dead code.
    render(<AdminSubNav sections={[{ label: 'Later', pending: 'SL-099' }]} />)

    expect(screen.queryByRole('link', { name: /Later/ })).toBeNull()
    expect(screen.getByText(/Later/)).toBeInTheDocument()
  })

  it('names the card that builds an unbuilt section', () => {
    render(<AdminSubNav sections={[{ label: 'Later', pending: 'SL-099' }]} />)

    expect(screen.getByTitle(/SL-099/)).toBeInTheDocument()
  })
})
