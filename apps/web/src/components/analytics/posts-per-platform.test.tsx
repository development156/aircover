import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { PostsOverTime, PostsPerPlatform } from './posts-per-platform'

describe('PostsPerPlatform', () => {
  it('draws a column per channel with its count and its name', () => {
    render(
      <PostsPerPlatform
        counts={[
          { channel: 'instagram', posts: 5 },
          { channel: 'linkedin', posts: 2 },
        ]}
      />,
    )
    expect(screen.getByText('5')).toBeTruthy()
    expect(screen.getByText('2')).toBeTruthy()
    // Twice each: once as the axis label, once in the accessible summary that
    // stands in for the whole chart.
    expect(screen.getAllByText(/Instagram/).length).toBeGreaterThan(0)
    expect(screen.getAllByText(/LinkedIn/i).length).toBeGreaterThan(0)
  })

  it('draws a channel that published nothing as a measured zero, not a gap', () => {
    // The publish log is complete, so nought is knowledge. `Bars` reserves a
    // different fill for exactly this and the chart must not lose it.
    const { container } = render(
      <PostsPerPlatform
        counts={[
          { channel: 'instagram', posts: 3 },
          { channel: 'x', posts: 0 },
        ]}
      />,
    )
    expect(container.querySelectorAll('[data-bar="zero"]')).toHaveLength(1)
    expect(container.querySelectorAll('[data-bar="value"]')).toHaveLength(1)
  })

  it('says nothing published rather than drawing an empty axis', () => {
    render(<PostsPerPlatform counts={[]} />)
    expect(screen.getByText(/Nothing published in this period/i)).toBeTruthy()
  })
})

describe('PostsOverTime', () => {
  const week = (from: string, posts: number, days = 7) => ({
    from,
    to: from,
    days,
    posts,
  })

  it('draws an empty week as a stub, because the log says there were none', () => {
    const { container } = render(
      <PostsOverTime weeks={[week('2026-08-01', 3), week('2026-08-08', 0)]} />,
    )
    expect(container.querySelectorAll('[data-bar="zero"]')).toHaveLength(1)
  })

  it('warns when the last column is short, so a calendar is not read as a fall', () => {
    render(<PostsOverTime weeks={[week('2026-08-01', 3), week('2026-08-08', 1, 2)]} />)
    expect(screen.getByText(/last column covers 2 days, not seven/i)).toBeTruthy()
  })

  it('says nothing about column length when every week is a full one', () => {
    render(<PostsOverTime weeks={[week('2026-08-01', 3), week('2026-08-08', 1)]} />)
    expect(screen.queryByText(/last column covers/i)).toBeNull()
  })
})
