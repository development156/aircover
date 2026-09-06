import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { AtAGlance } from './at-a-glance'
import { HomeSection } from './section'
import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'

/**
 * THE ONE CARD LANGUAGE, AND THE BOARD — the two structural claims the
 * 2026-08-30 rebuild of /home rests on.
 *
 * Neither is a claim about a number, so neither can be caught by the page's own
 * tests, which assert what /home SAYS. They are claims about how many separate
 * objects the reader is looking at, and the whole brief was that there were too
 * many. A rebuild whose only defence is "it looked better in a screenshot" is
 * undone by the next person who hand-writes a header.
 *
 * ── WHAT THIS CANNOT SEE, since jsdom computes no layout ────────────────────
 *  · whether anything actually LINES UP. Column widths, the seam falling on a
 *    pixel, the heading baselines agreeing across two cards side by side —
 *    none of that exists here. Those were checked by rendering the real
 *    components in Chromium at 1440, 1024 and 390.
 *  · whether a region that does NOT go through `HomeSection` still hand-writes
 *    its own header. This tests the primitive and two call sites; a tenth block
 *    added later with its own `border-b` is invisible to it.
 *  · colour, contrast and the accent budget. `accent-budget.spec.ts` counts
 *    brand fills in a real browser and is what holds that.
 */

describe('the one card language', () => {
  it('does not rule a line under the heading', () => {
    const { container } = render(
      <HomeSection id="s" title="Recent activity">
        <p>body</p>
      </HomeSection>,
    )
    /**
     * THE MUTATION THIS EXISTS FOR: `border-b border-line-soft` put back on the
     * header, which is what four of these blocks carried before the rebuild.
     *
     * It is not a taste assertion. Nine of these cards go down one screen, and
     * a rule under every heading is nine horizontal lines doing a job that the
     * gap already does, inside a card whose own ring already says where it
     * ends. The brief called that "unnecessary borders" and it is the single
     * most repeated piece of ink on the page.
     */
    const header = container.querySelector('header')!
    expect(header.className).not.toMatch(/\bborder-b\b/)
  })

  it('counts only what there is to count', () => {
    const { unmount } = render(
      <HomeSection id="s" title="Needs your attention" count={0}>
        <p>body</p>
      </HomeSection>,
    )
    // A zero badge beside a heading reads as a state to clear. There is nothing
    // to clear, and the body already says so in a sentence.
    expect(screen.queryByText('0')).toBeNull()
    unmount()

    render(
      <HomeSection id="s" title="Needs your attention" count={3}>
        <p>body</p>
      </HomeSection>,
    )
    expect(screen.getByText('3')).toBeTruthy()
  })

  it('names the section for a reader who navigates by headings', () => {
    // The planner block was a `CardLabel` inside a `Card` and had no heading at
    // all, so one region of Home was absent from the document outline.
    render(
      <HomeSection id="home-sahoda" title="This week, from Sahoda">
        <p>body</p>
      </HomeSection>,
    )
    const heading = screen.getByRole('heading', { name: 'This week, from Sahoda' })
    expect(heading.id).toBe('home-sahoda')
    expect(screen.getByRole('region', { name: 'This week, from Sahoda' })).toBeTruthy()
  })

  it('keeps the heading inset even when the body runs to the card edge', () => {
    const { container } = render(
      <HomeSection id="s" title="Recent activity" flush>
        <p>rows</p>
      </HomeSection>,
    )
    // `flush` is for a list whose rows reach the card's own edge. If it dropped
    // the HEADER's padding too, that one card's heading would sit 20px left of
    // every other heading in the same column.
    expect(container.querySelector('header')!.className).toMatch(/\bpx-5\b/)
  })
})

/**
 * ── THE BOARD IS ONE OBJECT ─────────────────────────────────────────────────
 * Four metrics used to be four ringed, rounded, separately-shadowed cards with
 * 16px between them. They are one card divided by hairline seams now, and the
 * seams are the grid's own gap over a line-coloured ground.
 */
const NO_POSTS: DisplayPost[] = []
const NO_WEEK = { days: [] } as unknown as WeekBuckets

/**
 * ── THIS WAS "THE FOUR NUMBERS, AS ONE BOARD", AND THE SHAPE WAS REVERSED ────
 * The four figures were one card split by hairline seams, and the argument for
 * it was sound: a divided board says "these belong together", which is right
 * when a row of figures is one reading.
 *
 * The founder's reference draws four separate cards, and on inspection that is
 * the better fit — each of these four goes to a DIFFERENT screen, so their only
 * relationship is that all four are true. The seams were claiming a kinship that
 * was not there, and a pane inside a shared ring cannot carry a hover of its own
 * without drawing a box inside a box.
 *
 * So these tests were rewritten rather than deleted: the old ones pinned a shape
 * that is deliberately gone, and the claims worth keeping — four destinations,
 * one ring each, no doubled edges — are pinned below against the new one.
 */
describe('the four numbers, as four cards', () => {
  function board() {
    const { container } = render(
      <AtAGlance
        posts={NO_POSTS}
        buckets={NO_WEEK}
        publish={{ status: 'ok', live: 0 } as never}
        /* Was a wallet balance. The founder's ruling took credits off this
           screen and Reach took the slot, so the board now reads a connected
           account instead. `not-connected` is the honest default for a fixture:
           it is the state every workspace starts in. */
        analytics={{ kind: 'not-connected' } as never}
      />,
    )
    return container.firstElementChild as HTMLElement
  }

  it('gives each card its own edge, and none of them two', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `board` put back on the strip, or a ring put
     * on the container as well as on the cards. Either draws an edge around a
     * group of edged things — a box inside a box, four times over.
     */
    const root = board()
    expect(root.className).not.toMatch(/surface-ring/)
    expect(root.className).not.toMatch(/\bbg-line-soft\b/)
    const cards = [...root.children] as HTMLElement[]
    expect(cards).toHaveLength(4)
    for (const card of cards) {
      expect(card.className).toMatch(/surface-ring/)
      expect(card.className).toMatch(/rounded-card/)
    }
  })

  it('still lets every number be acted on', () => {
    // The board is a visual change and may not cost the page four destinations.
    const links = board().querySelectorAll('a')
    expect(links).toHaveLength(4)
  })
})
