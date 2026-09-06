import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { setupLadder } from '@/lib/home/setup'

import { SetupStrip } from './setup-strip'

describe('SetupStrip', () => {
  test('renders nothing when every step is done', () => {
    const { container } = render(
      <SetupStrip ladder={setupLadder({ hasBrain: true, connections: 1, posts: 1 })} />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  test('states the count once and links the next door', () => {
    render(<SetupStrip ladder={setupLadder({ hasBrain: false, connections: 0, posts: 1 })} />)
    expect(screen.getByRole('heading', { name: /1 of 3 set up/i })).toBeInTheDocument()
    const next = screen.getByRole('link', { name: /teach sahoda about your business/i })
    expect(next).toHaveAttribute('href', '/onboarding')
    // The other undone step is a door too, not a greyed-out promise.
    expect(screen.getByRole('link', { name: /connect a social account/i })).toHaveAttribute(
      'href',
      '/connections',
    )
  })

  test('a done step is a statement, not a link', () => {
    render(<SetupStrip ladder={setupLadder({ hasBrain: true, connections: 0, posts: 1 })} />)
    expect(screen.getByText(/sahoda knows your business/i)).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /sahoda knows your business/i })).toBeNull()
    expect(screen.getByText(/first post written/i)).toBeInTheDocument()
  })

  test('is a labelled region with a list, so a screen reader gets the shape', () => {
    render(<SetupStrip ladder={setupLadder({ hasBrain: false, connections: 0, posts: 0 })} />)
    expect(screen.getByRole('region', { name: /set up/i })).toBeInTheDocument()
    expect(screen.getAllByRole('listitem')).toHaveLength(3)
  })
})
