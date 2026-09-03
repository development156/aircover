import { describe, expect, test } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { POSTS_BEFORE_FOLD, PostGrid } from './post-grid'

/**
 * The fold on the posts grid.
 *
 * Every assertion here is about what a PERSON can see or reach, which is why
 * they go through `toBeVisible` and the accessible name rather than through a
 * class list. A tile hidden by a class the test also asserts is a test of the
 * class, not of the fold.
 */

function tiles(n: number) {
  return Array.from({ length: n }, (_, i) => <article key={i}>Post {i + 1}</article>)
}

describe('the posts grid fold', () => {
  test('shows eight tiles and hides the rest', () => {
    render(<PostGrid>{tiles(12)}</PostGrid>)

    // The number is the point of the request, so it is asserted as a number and
    // not as "some". Anchored to the exported constant so the two cannot drift.
    expect(POSTS_BEFORE_FOLD).toBe(8)
    expect(screen.getByText('Post 8')).toBeVisible()
    expect(screen.getByText('Post 9')).not.toBeVisible()
  })

  test('counts what the button can actually reveal, not what the workspace holds', () => {
    render(<PostGrid>{tiles(12)}</PostGrid>)

    // Twelve loaded, eight shown, so four is the honest promise. "Show all 12
    // posts" would be a claim about the workspace, and `listPosts` is capped —
    // the page cannot know whether twelve is all of them.
    expect(screen.getByRole('button', { name: 'Show 4 more' })).toBeVisible()
  })

  test('reveals the rest when pressed, and puts them back', async () => {
    const user = userEvent.setup()
    render(<PostGrid>{tiles(12)}</PostGrid>)

    await user.click(screen.getByRole('button', { name: 'Show 4 more' }))
    expect(screen.getByText('Post 12')).toBeVisible()

    // Collapsible, not one-way. The request was for a fold that goes both ways.
    await user.click(screen.getByRole('button', { name: 'Show fewer' }))
    expect(screen.getByText('Post 12')).not.toBeVisible()
    expect(screen.getByText('Post 8')).toBeVisible()
  })

  test('offers no control when nothing is behind it', () => {
    render(<PostGrid>{tiles(8)}</PostGrid>)

    // Exactly at the boundary. A "Show 0 more" button is an impossible remedy:
    // it is pressable and cannot change anything on the screen.
    expect(screen.getByText('Post 8')).toBeVisible()
    expect(screen.queryByRole('button')).not.toBeInTheDocument()
  })

  test('tells assistive tech which region the control opens', async () => {
    const user = userEvent.setup()
    render(<PostGrid visible={2}>{tiles(4)}</PostGrid>)

    const button = screen.getByRole('button', { name: 'Show 2 more' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    // `aria-controls` must name a node that EXISTS — a dangling id is worse than
    // no attribute, because a screen reader announces a jump target that is not
    // there.
    const controlled = button.getAttribute('aria-controls')
    expect(controlled).toBeTruthy()
    expect(document.getElementById(controlled as string)).toBeInTheDocument()

    await user.click(button)
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })

  test('lays the tiles out as a grid, not as a stack', () => {
    const { container } = render(<PostGrid>{tiles(3)}</PostGrid>)

    // ── A CLASS ASSERTION, AND HERE IS WHY THAT IS THE HONEST LIMIT ──────────
    // jsdom has no layout engine: `getComputedStyle` returns the cascade, not a
    // used value, and every box measures 0x0. So no test in this file can prove
    // the tiles are square or that four sit in a row — that was proven by
    // MEASURING in Chromium (325x325 tiles at a 1440px viewport, four columns).
    //
    // What this CAN prove is the thing that silently regressed twice already:
    // the container stopped being a grid at all. An audit mutation replaced this
    // class with `space-y-grid` — the exact vertical list this change replaced —
    // and all the other tests here stayed green, because they only know about
    // the fold. This is the assertion that goes red for it.
    //
    // The breakpoint names are load-bearing, not decoration: this app clears
    // Tailwind's defaults to `initial` and defines only `narrow` and `wide`, so
    // `sm:grid-cols-2` is a class that matches nothing and the grid quietly
    // stays one column. Asserting the names catches that at the source.
    //
    // ── AND THE FIRST ASSERTION HERE USED TO BE INERT ────────────────────────
    // It read `toContain('grid')`, and `grid` is a substring of `gap-grid`, of
    // `grid-cols-1` and of `space-y-grid`. An audit replaced the whole class
    // list with `flex flex-col gap-grid narrow:grid-cols-2 wide:grid-cols-4` —
    // a real stack regression, the exact defect the paragraph above says this
    // test exists to catch — and all seven tests stayed green. The commit's own
    // mutation only went red because it happened to delete the breakpoint
    // classes too. So the display class is now read as a WHOLE TOKEN, and the
    // two displays that would silently replace it are named and refused.
    const list = container.querySelector('ul')
    const classes = (list?.className ?? '').split(/\s+/)
    expect(classes).toContain('grid')
    expect(classes).not.toContain('flex')
    expect(classes).not.toContain('space-y-grid')
    expect(classes).toContain('grid-cols-1')
    expect(classes).toContain('narrow:grid-cols-2')
    expect(classes).toContain('wide:grid-cols-4')
  })

  test('keeps a hidden tile out of the accessibility tree entirely', () => {
    const { container } = render(<PostGrid visible={2}>{tiles(4)}</PostGrid>)

    // The failure this catches: a tile hidden with a CSS class alone still
    // carries its links into the tab order, so the control claims to reveal
    // something a keyboard user already reached.
    //
    // The two queries say different things and both are needed. `getAllByRole`
    // walks the ACCESSIBILITY tree, so it returns only what is exposed; the
    // container query walks the DOM, so it returns every tile. Two of four
    // rendered, two of four exposed — and if the `hidden` attribute were
    // dropped for a class alone, the first number would rise to four while the
    // screen looked identical.
    expect(container.querySelectorAll('li')).toHaveLength(4)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
    expect(screen.queryByText('Post 3')).not.toBeVisible()
  })
})
