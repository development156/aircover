import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import { ViewToggle } from './view-toggle'

/**
 * THE VIEW CONTROL WAS THE ONE FILTER-CARRIER ON THIS PAGE THAT CARRIED NOTHING.
 *
 * Three components on /planner take deliberate care to pass the reader's
 * choices along, and each says so in its own header: `PlannerToolbar`
 * ("Dropping them would make choosing a tab silently reset two other choices the
 * reader made"), `PlannerMiniCalendar` ("Carried, never reset silently") and
 * `WeekNav` ("Stepping a week used to emit `{ view, week }` and nothing else").
 *
 * `ViewToggle` emitted `{ view }` and nothing else. So the page's own comment —
 * "a tab or a search that vanished when you clicked Month would read as the
 * filter having been discarded" — described the toolbar staying on screen while
 * the filter behind it was thrown away by the control directly above it.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 * Whether the page passes the CURRENT filter down. These pin the contract; the
 * route's own props are what connect it.
 */
describe('the view control carries what the reader already chose', () => {
  it('keeps the tab, the search, the picked day and the week on every view', () => {
    render(
      <ViewToggle
        active="list"
        carry={{ tab: 'drafts', q: 'chai', date: '2026-08-28', week: '2' }}
      />,
    )

    for (const label of ['Day', 'Week', 'Month', 'List']) {
      const href = screen.getByRole('link', { name: label }).getAttribute('href') ?? ''
      expect(href, label).toContain('tab=drafts')
      expect(href, label).toContain('q=chai')
      expect(href, label).toContain('date=2026-08-28')
      expect(href, label).toContain('week=2')
    }
  })

  it('names the view on every link, so a carried filter never replaces it', () => {
    render(<ViewToggle active="list" carry={{ tab: 'drafts' }} />)
    expect(screen.getByRole('link', { name: 'Month' }).getAttribute('href')).toContain('view=month')
    expect(screen.getByRole('link', { name: 'Day' }).getAttribute('href')).toContain('view=day')
  })

  it('emits no empty parameters when there is nothing to carry', () => {
    render(<ViewToggle active="month" carry={{}} />)
    const href = screen.getByRole('link', { name: 'List' }).getAttribute('href') ?? ''
    expect(href).toContain('view=list')
    expect(href).not.toContain('tab=')
    expect(href).not.toContain('q=')
    expect(href).not.toContain('date=')
  })

  it('marks the standing view for assistive tech, not only with a colour', () => {
    render(<ViewToggle active="month" carry={{}} />)
    expect(screen.getByRole('link', { name: 'Month' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'List' })).not.toHaveAttribute('aria-current')
  })
})
