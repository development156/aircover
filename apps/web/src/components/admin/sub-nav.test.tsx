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

  it('renders an unbuilt section as disabled text, never as a link', () => {
    // The bug this pins: typedRoutes rejects a Link to a route that does not
    // exist, so the tempting workaround is a bare <a href> — which ships a nav
    // item that 404s. A section nobody can open must not look openable.
    render(<AdminSubNav />)

    for (const label of ['Applications', 'Credits', 'Team']) {
      expect(screen.queryByRole('link', { name: label })).toBeNull()
      expect(screen.getByText(label)).toHaveAttribute('aria-disabled', 'true')
    }
  })

  it('says which card builds an unbuilt section', () => {
    render(<AdminSubNav />)
    expect(screen.getByText('Applications')).toHaveAttribute(
      'title',
      expect.stringContaining('SL-025'),
    )
  })

  it('links QA now that the console exists', () => {
    render(<AdminSubNav />)
    expect(screen.getByRole('link', { name: 'QA' })).toHaveAttribute('href', '/admin/qa')
  })
})
