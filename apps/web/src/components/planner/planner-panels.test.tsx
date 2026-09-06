import { describe, it, expect } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { toChannelSet } from '@sahoda/shared'
import type { PostStatus } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import { PlannerSummary } from './planner-summary'
import { PlannerToolbar } from './planner-toolbar'
import { PlannerMiniCalendar } from './planner-mini-calendar'
import { PlannerUpcoming } from './planner-upcoming'

/**
 * The four new server panels, RENDERED.
 *
 * ── WHY THIS FILE EXISTS ─────────────────────────────────────────────────────
 * `/planner` is behind Clerk, and in this sandbox Playwright's Chromium cannot
 * complete an outbound HTTPS request (REQUESTS §25), so nobody on this lane can
 * open the screen. The unit tests on `lib/planner/filters.ts` prove the LOGIC,
 * and they would all stay green while the panels that display it threw on first
 * paint. These render them.
 *
 * They assert the claims, never the wording: "the number is 2", "the link goes
 * to /approvals", "the picked day can be un-picked". Copy can be rewritten
 * freely without touching this file, which is the property CLAUDE.md's fifth
 * copy rule asks for.
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

describe('the figures above the plan', () => {
  const rows = [
    post({ id: 'a', intent: 'review' as PostStatus }),
    post({ id: 'b', intent: 'draft' as PostStatus }),
    post({ id: 'c', intent: 'draft' as PostStatus }),
    post({
      id: 'd',
      title: 'Cardamom chai',
      intent: 'scheduled' as PostStatus,
      scheduled_at: '2026-08-28T13:00:00.000Z', // 18:30 IST, today
    }),
  ]

  it('sends each figure to the screen that owns it', () => {
    render(<PlannerSummary posts={rows} now={NOW} />)
    expect(screen.getByRole('link', { name: /needs approval/i })).toHaveAttribute(
      'href',
      '/approvals',
    )
    expect(screen.getByRole('link', { name: /drafts/i })).toHaveAttribute('href', '/posts')
  })

  it('counts drafts and approvals from the intents, not from the row order', () => {
    render(<PlannerSummary posts={rows} now={NOW} />)
    expect(
      within(screen.getByRole('link', { name: /needs approval/i })).getByText('1'),
    ).toBeTruthy()
    expect(within(screen.getByRole('link', { name: /drafts/i })).getByText('2')).toBeTruthy()
  })

  it('"going out today" counts only posts inside today\'s IST day', () => {
    const withTomorrow = [
      ...rows,
      post({
        id: 'e',
        intent: 'scheduled' as PostStatus,
        scheduled_at: '2026-08-29T13:00:00.000Z',
      }),
    ]
    render(<PlannerSummary posts={withTomorrow} now={NOW} />)
    // Two are scheduled; only one of them is today.
    const today = screen.getByRole('link', { name: /going out today/i })
    expect(within(today).getByText('1')).toBeTruthy()
  })

  it('"going out today" does not count a dated DRAFT, because nothing will send it', () => {
    const withDatedDraft = [
      ...rows,
      post({
        id: 'plan',
        title: 'Plan my week output',
        intent: 'draft' as PostStatus,
        scheduled_at: '2026-08-28T10:00:00.000Z', // 15:30 IST, today — and a draft
      }),
    ]
    render(<PlannerSummary posts={withDatedDraft} now={NOW} />)
    const today = screen.getByRole('link', { name: /going out today/i })
    expect(within(today).getByText('1')).toBeTruthy()
  })

  it('"next up" skips a dated DRAFT even when it is sooner', () => {
    const withSoonerDraft = [
      ...rows,
      post({
        id: 'plan',
        title: 'Plan my week output',
        intent: 'draft' as PostStatus,
        scheduled_at: '2026-08-28T07:00:00.000Z', // before Cardamom chai
      }),
    ]
    render(<PlannerSummary posts={withSoonerDraft} now={NOW} />)
    expect(screen.queryByRole('link', { name: /plan my week output/i })).toBeNull()
    expect(screen.getByRole('link', { name: /cardamom chai/i })).toHaveAttribute('href', '/posts/d')
  })

  it('an APPROVED post with a time counts and can be next — that is how the app schedules', () => {
    const approved = [
      post({
        id: 'ok',
        title: 'Approved and dated',
        intent: 'approved' as PostStatus,
        scheduled_at: '2026-08-28T09:00:00.000Z',
      }),
    ]
    render(<PlannerSummary posts={approved} now={NOW} />)
    const today = screen.getByRole('link', { name: /going out today/i })
    expect(within(today).getByText('1')).toBeTruthy()
    expect(screen.getByRole('link', { name: /approved and dated/i })).toHaveAttribute(
      'href',
      '/posts/ok',
    )
  })

  it('names the next future post, never a past one', () => {
    render(<PlannerSummary posts={rows} now={NOW} />)
    expect(screen.getByRole('link', { name: /cardamom chai/i })).toHaveAttribute('href', '/posts/d')
  })

  it('with nothing ahead it renders the absence, not a borrowed past post', () => {
    const past = [
      post({
        id: 'p',
        title: 'Yesterday',
        intent: 'scheduled' as PostStatus,
        scheduled_at: '2026-08-20T13:00:00.000Z',
      }),
    ]
    render(<PlannerSummary posts={past} now={NOW} />)
    expect(screen.queryByRole('link', { name: /yesterday/i })).toBeNull()
    expect(screen.getByText(/nothing scheduled ahead/i)).toBeTruthy()
  })

  it('sets exactly one heading rung for a figure, so none of them outranks the page title', () => {
    const { container } = render(<PlannerSummary posts={rows} now={NOW} />)
    // docs/37 §16: exactly one type-h1 per view, and the page heading owns it.
    expect(container.querySelectorAll('.type-h1')).toHaveLength(0)
  })
})

describe('the toolbar', () => {
  const counts = { all: 4, drafts: 2, scheduled: 1, 'needs-approval': 1 } as const

  it('carries the view forward on every tab, so choosing a filter cannot reset the view', () => {
    render(
      <PlannerToolbar
        active="all"
        counts={counts}
        query=""
        view="month"
        dateKey={null}
        week={null}
      />,
    )
    for (const name of [/^All/, /^Drafts/, /^Scheduled/, /^Needs approval/]) {
      expect(screen.getByRole('link', { name })).toHaveAttribute(
        'href',
        expect.stringContaining('view=month'),
      )
    }
  })

  it('carries the picked date and the search forward too', () => {
    render(
      <PlannerToolbar
        active="all"
        counts={counts}
        query="chai"
        view="list"
        dateKey="2026-08-28"
        week={null}
      />,
    )
    const drafts = screen.getByRole('link', { name: /^Drafts/ }).getAttribute('href') ?? ''
    expect(drafts).toContain('date=2026-08-28')
    expect(drafts).toContain('q=chai')
    expect(drafts).toContain('tab=drafts')
  })

  it('the All tab carries no tab parameter — the default is the absence of one', () => {
    render(
      <PlannerToolbar
        active="drafts"
        counts={counts}
        query=""
        view="list"
        dateKey={null}
        week={null}
      />,
    )
    expect(screen.getByRole('link', { name: /^All/ }).getAttribute('href')).not.toContain('tab=')
  })

  it('marks the standing tab for assistive tech, not only with a colour', () => {
    render(
      <PlannerToolbar
        active="drafts"
        counts={counts}
        query=""
        view="list"
        dateKey={null}
        week={null}
      />,
    )
    expect(screen.getByRole('link', { name: /^Drafts/ })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: /^All/ })).not.toHaveAttribute('aria-current')
  })

  it('carries the week offset, which a GET form would otherwise wipe', () => {
    const { container } = render(
      <PlannerToolbar active="all" counts={counts} query="" view="week" dateKey={null} week="2" />,
    )
    expect(screen.getByRole('link', { name: /^Drafts/ }).getAttribute('href')).toContain('week=2')
    // A GET form replaces the WHOLE query string, so the offset has to be a
    // field in the form as well as a parameter on the links.
    expect(container.querySelector('input[name="week"]')).toHaveAttribute('value', '2')
  })

  it('the search box submits as a GET so the result is a shareable URL', () => {
    const { container } = render(
      <PlannerToolbar
        active="all"
        counts={counts}
        query=""
        view="list"
        dateKey={null}
        week={null}
      />,
    )
    const form = container.querySelector('form')
    expect(form).not.toBeNull()
    // No method attribute means GET, which is the whole point.
    expect(form?.getAttribute('method')).toBeNull()
    expect(form?.getAttribute('action')).toBe('/planner')
    expect(screen.getByLabelText(/search post titles/i)).toBeTruthy()
  })

  it('offers a way out only once there is something to clear', () => {
    const { rerender } = render(
      <PlannerToolbar
        active="all"
        counts={counts}
        query=""
        view="list"
        dateKey={null}
        week={null}
      />,
    )
    expect(screen.queryByRole('link', { name: /clear/i })).toBeNull()
    rerender(
      <PlannerToolbar
        active="all"
        counts={counts}
        query="chai"
        view="list"
        dateKey={null}
        week={null}
      />,
    )
    expect(screen.getByRole('link', { name: /clear/i }).getAttribute('href')).not.toContain('q=')
  })
})

describe('the mini calendar', () => {
  const rows = [
    post({
      id: 'a',
      intent: 'scheduled' as PostStatus,
      scheduled_at: '2026-08-28T13:00:00.000Z',
    }),
  ]

  it('names each cell with its full date — a 42-cell grid repeats the numeral', () => {
    render(
      <PlannerMiniCalendar
        posts={[]}
        now={NOW}
        selected={null}
        view="list"
        tab={null}
        query=""
        week={null}
      />,
    )
    // August 2026 begins on a Saturday, so the grid opens on 27 July. Both
    // months contain a 28th; only the full name tells them apart.
    expect(screen.getByRole('link', { name: '28 July 2026' })).toBeTruthy()
    expect(screen.getByRole('link', { name: '28 August 2026' })).toBeTruthy()
  })

  it('picking a day adds it to the URL', () => {
    render(
      <PlannerMiniCalendar
        posts={rows}
        now={NOW}
        selected={null}
        view="list"
        tab={null}
        query=""
        week={null}
      />,
    )
    const day = screen.getByRole('link', { name: '28 August 2026' })
    expect(day.getAttribute('href')).toContain('date=2026-08-28')
  })

  it('clicking the picked day again clears it — a filter with no way out is a trap', () => {
    render(
      <PlannerMiniCalendar
        posts={rows}
        now={NOW}
        selected="2026-08-28"
        view="list"
        tab={null}
        query=""
        week={null}
      />,
    )
    const day = screen.getByRole('link', { name: '28 August 2026' })
    expect(day.getAttribute('href')).not.toContain('date=')
    expect(day).toHaveAttribute('aria-current', 'date')
  })

  it('carries the tab and the search forward, so picking a day discards neither', () => {
    render(
      <PlannerMiniCalendar
        posts={rows}
        now={NOW}
        selected={null}
        view="month"
        tab="drafts"
        query="chai"
        week={null}
      />,
    )
    const href = screen.getByRole('link', { name: '28 August 2026' }).getAttribute('href') ?? ''
    expect(href).toContain('view=month')
    expect(href).toContain('tab=drafts')
    expect(href).toContain('q=chai')
  })

  it('carries the week offset too, so a picked day does not jump the reader to this week', () => {
    render(
      <PlannerMiniCalendar
        posts={[]}
        now={NOW}
        selected={null}
        view="week"
        tab={null}
        query=""
        week="2"
      />,
    )
    expect(screen.getByRole('link', { name: '28 August 2026' }).getAttribute('href')).toContain(
      'week=2',
    )
  })

  it('renders a full 6x7 month, so the grid height does not jump between months', () => {
    const { container } = render(
      <PlannerMiniCalendar
        posts={[]}
        now={NOW}
        selected={null}
        view="list"
        tab={null}
        query=""
        week={null}
      />,
    )
    expect(container.querySelectorAll('a[href*="/planner"]')).toHaveLength(42)
  })
})

describe('upcoming', () => {
  it('shows the time and the channels, and links to the post', () => {
    const rows = [
      post({
        id: 'a',
        title: 'Cardamom chai',
        intent: 'scheduled' as PostStatus,
        scheduled_at: '2026-08-28T13:00:00.000Z',
        channels: toChannelSet(['linkedin', 'instagram']),
      }),
    ]
    render(<PlannerUpcoming posts={rows} />)
    const link = screen.getByRole('link', { name: /cardamom chai/i })
    expect(link).toHaveAttribute('href', '/posts/a')
    expect(within(link).getByText(/LinkedIn/)).toBeTruthy()
    expect(within(link).getByText(/IST/)).toBeTruthy()
  })

  it('an untitled post is named, not left blank', () => {
    const rows = [
      post({
        id: 'a',
        intent: 'scheduled' as PostStatus,
        scheduled_at: '2026-08-28T13:00:00.000Z',
      }),
    ]
    render(<PlannerUpcoming posts={rows} />)
    expect(screen.getByRole('link', { name: /untitled post/i })).toBeTruthy()
  })
})
