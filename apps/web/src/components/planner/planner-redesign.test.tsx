import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { toChannelSet } from '@sahoda/shared'
import type { PostStatus } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import { PlannerMiniCalendar } from './planner-mini-calendar'
import { PlannerSummary } from './planner-summary'
import { MonthGrid } from './month-grid'
import { firstGridDay, MONTH_GRID_DAYS } from '@/lib/planner/month'
import { bucketWeek } from '@/lib/planner/week'

/**
 * THE CLAIMS THE REDESIGN MAKES, AND THE ONES A LATER READER WILL UNDO.
 *
 * The founder's brief asks for a premium calendar dashboard and specifies some
 * of it in pixels and colours. Three of those specifics collide with rules this
 * product does not bend, and each collision is pinned here — because the whole
 * point of a written reference image is that somebody later "restores" it.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 *  · anything about layout, spacing or the sticky rail. jsdom computes no
 *    layout. Those were checked by rendering in Chromium at 1440 and 390.
 *  · contrast. jsdom resolves no custom properties, so `--brand-ink` on
 *    `--brand` is a token pairing here and a measurement in the browser.
 */

function post(over: Partial<DisplayPost> & { id: string }): DisplayPost {
  return {
    workspace_id: 'w1',
    title: null,
    body: null,
    channels: toChannelSet(['x']),
    scheduled_at: null,
    origin: 'manual',
    created_by: null,
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
    intent: 'draft' as PostStatus,
    ...over,
  } as DisplayPost
}

const NOW = new Date('2026-08-28T06:00:00.000Z') // 11:30 IST, 28 August

describe('the picked day is a mark, never a second primary action', () => {
  function mini(selected: string | null) {
    return render(
      <PlannerMiniCalendar
        posts={[]}
        now={NOW}
        selected={selected}
        view="month"
        tab={null}
        query=""
        week={null}
      />,
    )
  }

  it('fills a SMALL circle, not the whole cell', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `bg-brand` moved onto the cell link to make
     * the picked day a big solid square, which is the obvious way to read the
     * reference image.
     *
     * `accent-budget.spec.ts` counts an opaque brand box of 1000px² or more
     * inside a link as an action competing to be the screen's ONE solid brand
     * fill. In this rail a cell is about 35px square (~1218px²) and would cross
     * that line; the circle is `size-7`, 784px², and stays a mark. The one
     * primary on this route is Plan my week.
     */
    const { container } = mini('2026-08-28')
    const filled = container.querySelector('.bg-brand.rounded-pill')
    expect(filled).not.toBeNull()
    expect(filled!.className).toContain('size-7')
    // The link itself must carry no brand fill at all.
    const cell = screen.getByRole('link', { name: '28 August 2026' })
    expect(cell.className).not.toMatch(/\bbg-brand\b/)
  })

  it('sets the numeral in the brand INK token, never white', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `text-white` on the orange circle, which is
     * what the reference image shows. White on #ff6600 measures about 2.9:1 and
     * fails at every size; `--brand-ink` is #000000 and measures 7.15:1, and it
     * is the token that exists for text on the brand fill.
     */
    const { container } = mini('2026-08-28')
    const filled = container.querySelector('.bg-brand.rounded-pill')!
    expect(filled.className).toContain('text-brand-ink')
    expect(filled.className).not.toMatch(/text-white/)
  })

  it('paints no brand fill at all when no day is picked', () => {
    const { container } = mini(null)
    expect(container.querySelector('.bg-brand.rounded-pill.size-7')).toBeNull()
  })
})

describe('the figures say each thing once', () => {
  const rows = [
    post({ id: 'a', intent: 'review' as PostStatus }),
    post({ id: 'b', intent: 'draft' as PostStatus }),
  ]

  it('drops the notes that only restate the number above them', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: "Nothing waiting" / "Waiting on you" and
     * "Not scheduled yet" put back under their own counts. Each is the
     * DEFINITION of the figure it sits under — a draft is by definition not
     * scheduled — so a row of four carried four sentences telling the reader
     * what they had just read. The brief asks for less text; this is which.
     *
     * WRITTEN THE WEAK WAY FIRST, AND THE MUTATION SURVIVED. The first version
     * searched for the two EMPTY-state strings, so restoring the note in its
     * non-empty form ("Waiting on you", which is what one waiting post renders)
     * walked straight past it. This asserts the SHAPE instead: the tile is a
     * label and a number and there is no third line, whatever a later reader
     * might choose to put there.
     */
    render(<PlannerSummary posts={rows} now={NOW} />)
    for (const [name, expected] of [
      [/needs approval/i, 'Needs approval1'],
      [/drafts/i, 'Drafts1'],
    ] as const) {
      expect(screen.getByRole('link', { name }).textContent?.replace(/\s+/g, '')).toBe(
        expected.replace(/\s+/g, ''),
      )
    }
  })

  it('keeps the one note that is a DIFFERENT measurement', () => {
    /**
     * "Going out today" counts today's IST day; this line counts the whole
     * plan. Removing it leaves a "0" beside a week that may hold eleven posts,
     * with nothing on screen to tell the two apart. It is not a restatement and
     * it does not go.
     */
    render(
      <PlannerSummary
        posts={[
          ...rows,
          post({
            id: 'c',
            intent: 'scheduled' as PostStatus,
            scheduled_at: '2026-09-04T13:00:00.000Z',
          }),
        ]}
        now={NOW}
      />,
    )
    expect(screen.getByText(/1 scheduled in all/i)).toBeTruthy()
  })

  it('still states the absence when nothing is scheduled ahead', () => {
    render(<PlannerSummary posts={rows} now={NOW} />)
    // The mark is a glyph and says nothing on its own, so its sentence stays.
    expect(screen.getByText(/nothing scheduled ahead/i)).toBeTruthy()
  })
})

describe('the calendar marks scheduled work in orange', () => {
  const rows = [
    post({
      id: 'a',
      title: 'Cardamom chai',
      intent: 'scheduled' as PostStatus,
      scheduled_at: '2026-08-28T13:00:00.000Z',
    }),
    post({
      id: 'b',
      title: 'Monsoon menu',
      intent: 'draft' as PostStatus,
      scheduled_at: '2026-08-29T13:00:00.000Z',
    }),
  ]

  function grid() {
    return render(
      <MonthGrid
        buckets={bucketWeek(rows, firstGridDay(NOW), MONTH_GRID_DAYS)}
        monthAnchor={NOW}
      />,
    )
  }

  it('fills the dot for a scheduled post and leaves it hollow otherwise', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: every dot filled orange, which looks
     * tidier and claims every post on the calendar is scheduled. The mini
     * calendar in the rail has drawn and legended these same two marks for
     * their same two meanings since it was written; a grid that used one mark
     * for both would disagree with the legend one column across.
     */
    const { container } = grid()
    const scheduled = screen.getByRole('link', { name: /cardamom chai/i })
    const draft = screen.getByRole('link', { name: /monsoon menu/i })
    expect(scheduled.querySelector('.bg-brand')).not.toBeNull()
    expect(draft.querySelector('.bg-brand')).toBeNull()
    // Every dot is decoration; the title beside it carries the meaning.
    for (const dot of Array.from(container.querySelectorAll('.rounded-pill'))) {
      expect(dot.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('keeps the whole IST sentence, not a shortened label', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: trimmed to "Times in IST" to satisfy the
     * brief's "less text". The dropped clause is the only thing on the screen
     * that says these times are the zone the schedule is STORED in rather than
     * a conversion into the reader's own — and the rail beside this grid shows
     * the workspace's zone, so a Dubai workspace reads two different clocks on
     * one screen. Shorter, here, is a vaguer claim.
     */
    grid()
    expect(screen.getByText(/the zone every schedule is stored in/i)).toBeTruthy()
  })
})
