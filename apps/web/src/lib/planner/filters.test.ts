import { describe, it, expect } from 'vitest'
import { toChannelSet } from '@sahoda/shared'
import type { PostStatus } from '@sahoda/shared'

import type { DisplayPost } from '@/lib/posts/display-post'
import {
  applyFilter,
  PLANNER_TABS,
  type PlannerTab,
  isFiltered,
  matchesTab,
  parseDate,
  parseQuery,
  parseTab,
  upcoming,
} from './filters'

/** A DisplayPost is only reachable through `forDisplay`, so build the shape directly. */
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

describe('the tab a URL asks for', () => {
  it.each([
    ['all', 'all'],
    ['drafts', 'drafts'],
    ['scheduled', 'scheduled'],
    ['needs-approval', 'needs-approval'],
  ])('%s is honoured', (raw, expected) => {
    expect(parseTab(raw)).toBe(expected)
  })

  it.each([[undefined], ['DRAFTS'], ['rubbish'], ['']])(
    'an unrecognised tab (%s) falls back to all, so no work is hidden by a filter nobody chose',
    (raw) => {
      expect(parseTab(raw)).toBe('all')
    },
  )
})

describe('the date a URL asks for', () => {
  it('a well-formed IST day key is honoured', () => {
    expect(parseDate('2026-08-28')).toBe('2026-08-28')
  })

  it.each([[undefined], ['28-08-2026'], ['2026-8-1'], ['today'], ['2026-13-45']])(
    'a malformed date (%s) becomes "no date picked", never a key that matches nothing',
    (raw) => {
      expect(parseDate(raw)).toBeNull()
    },
  )
})

describe('the search a URL asks for', () => {
  it('is trimmed', () => {
    expect(parseQuery('  chai  ')).toBe('chai')
  })

  it('is capped, so a pathological URL cannot become a pathological match', () => {
    expect(parseQuery('a'.repeat(500))).toHaveLength(120)
  })

  it('absent is empty, which matches everything', () => {
    expect(parseQuery(undefined)).toBe('')
  })
})

describe('each tab reads an existing definition', () => {
  it('needs-approval is the approvals queue, and a draft is NOT on it', () => {
    // `lib/approvals/queue.ts` deliberately excludes drafts. If this ever goes
    // green for a draft, the planner has grown a fifth idea of "pending".
    expect(matchesTab(post({ id: 'a', intent: 'review' as PostStatus }), 'needs-approval')).toBe(
      true,
    )
    expect(matchesTab(post({ id: 'b', intent: 'draft' as PostStatus }), 'needs-approval')).toBe(
      false,
    )
  })

  it('drafts and scheduled are the literal intents', () => {
    expect(matchesTab(post({ id: 'a', intent: 'draft' as PostStatus }), 'drafts')).toBe(true)
    expect(matchesTab(post({ id: 'b', intent: 'scheduled' as PostStatus }), 'drafts')).toBe(false)
    expect(matchesTab(post({ id: 'c', intent: 'scheduled' as PostStatus }), 'scheduled')).toBe(true)
  })

  it('all keeps everything', () => {
    expect(matchesTab(post({ id: 'a', intent: 'published' as PostStatus }), 'all')).toBe(true)
  })
})

describe('the three narrowings together', () => {
  const rows = [
    post({
      id: 'a',
      title: 'Cardamom chai, slowly steeped',
      intent: 'scheduled' as PostStatus,
      scheduled_at: '2026-08-28T13:00:00.000Z', // 18:30 IST on the 28th
    }),
    post({ id: 'b', title: 'Weekend invitation', intent: 'draft' as PostStatus }),
    post({
      id: 'c',
      title: 'Monsoon menu',
      intent: 'scheduled' as PostStatus,
      scheduled_at: '2026-08-30T13:00:00.000Z',
    }),
  ]

  it('no filter keeps every row', () => {
    expect(applyFilter(rows, { tab: 'all', query: '', dateKey: null })).toHaveLength(3)
  })

  it('a picked date keeps only that IST day', () => {
    const kept = applyFilter(rows, { tab: 'all', query: '', dateKey: '2026-08-28' })
    expect(kept.map((p) => p.id)).toEqual(['a'])
  })

  it('an undated post is never kept by a date filter — it has no day to be on', () => {
    const kept = applyFilter(rows, { tab: 'all', query: '', dateKey: '2026-08-30' })
    expect(kept.map((p) => p.id)).toEqual(['c'])
  })

  it('search is case-insensitive and matches the title', () => {
    const kept = applyFilter(rows, { tab: 'all', query: 'CHAI', dateKey: null })
    expect(kept.map((p) => p.id)).toEqual(['a'])
  })

  it('a post with no title is not matched by a search, and does not throw', () => {
    const kept = applyFilter([post({ id: 'z' })], { tab: 'all', query: 'chai', dateKey: null })
    expect(kept).toEqual([])
  })

  it('the narrowings compose rather than replacing one another', () => {
    const kept = applyFilter(rows, { tab: 'scheduled', query: 'monsoon', dateKey: '2026-08-30' })
    expect(kept.map((p) => p.id)).toEqual(['c'])
    expect(applyFilter(rows, { tab: 'drafts', query: 'monsoon', dateKey: null })).toEqual([])
  })
})

describe('a tab count must equal the number of rows under that tab', () => {
  /**
   * THE DEFECT THIS PINS, WHICH SHIPPED AND WAS CAUGHT IN REVIEW.
   *
   * The page first counted each tab over EVERY post. With `?q=chai` the All tab
   * read 4 above a list of 1 — a figure no query produced, which is the one
   * thing CLAUDE.md forbids outright. The fix is to apply the search and the
   * picked date first, then count each tab within that. This reproduces the
   * page's own expression, so it goes red if the page reverts.
   */
  const rows = [
    post({ id: 'a', title: 'Cardamom chai', intent: 'scheduled' as PostStatus }),
    post({ id: 'b', title: 'Chai and rain', intent: 'draft' as PostStatus }),
    post({ id: 'c', title: 'Monsoon menu', intent: 'draft' as PostStatus }),
    post({ id: 'd', title: 'Weekend', intent: 'review' as PostStatus }),
  ]

  const countsFor = (query: string, dateKey: string | null) => {
    const beforeTab = applyFilter(rows, { tab: 'all', query, dateKey })
    return Object.fromEntries(
      PLANNER_TABS.map((tab) => [tab, beforeTab.filter((p) => matchesTab(p, tab)).length]),
    ) as Record<PlannerTab, number>
  }

  it.each(PLANNER_TABS)('with no search, the %s count matches its own list', (tab) => {
    expect(countsFor('', null)[tab]).toBe(
      applyFilter(rows, { tab, query: '', dateKey: null }).length,
    )
  })

  it.each(PLANNER_TABS)('with a search, the %s count still matches its own list', (tab) => {
    const query = 'chai'
    expect(countsFor(query, null)[tab]).toBe(
      applyFilter(rows, { tab, query, dateKey: null }).length,
    )
  })

  it('the All count is the size of the searched set, not of the workspace', () => {
    expect(countsFor('chai', null).all).toBe(2)
    expect(countsFor('', null).all).toBe(4)
  })
})

describe('whether the reader narrowed the list', () => {
  it('decides which empty state is honest', () => {
    expect(isFiltered({ tab: 'all', query: '', dateKey: null })).toBe(false)
    expect(isFiltered({ tab: 'drafts', query: '', dateKey: null })).toBe(true)
    expect(isFiltered({ tab: 'all', query: 'chai', dateKey: null })).toBe(true)
    expect(isFiltered({ tab: 'all', query: '', dateKey: '2026-08-28' })).toBe(true)
  })
})

describe('upcoming', () => {
  const now = new Date('2026-08-28T12:00:00.000Z')
  const rows = [
    post({ id: 'later', intent: 'scheduled' as PostStatus, scheduled_at: '2026-08-30T09:00:00Z' }),
    post({ id: 'past', intent: 'scheduled' as PostStatus, scheduled_at: '2026-08-27T09:00:00Z' }),
    post({ id: 'soon', intent: 'scheduled' as PostStatus, scheduled_at: '2026-08-28T18:00:00Z' }),
    post({ id: 'undated', intent: 'draft' as PostStatus }),
    // Every "Plan my week" output: a draft with a time. Nothing sends it.
    post({
      id: 'dated-draft',
      intent: 'draft' as PostStatus,
      scheduled_at: '2026-08-28T15:00:00Z',
    }),
    post({
      id: 'approved',
      intent: 'approved' as PostStatus,
      scheduled_at: '2026-08-29T09:00:00Z',
    }),
  ]

  it('is soonest first', () => {
    expect(upcoming(rows, now, 5).map((p) => p.id)).toEqual(['soon', 'approved', 'later'])
  })

  it('excludes a dated DRAFT — the dispatcher only sends approved or scheduled posts', () => {
    // `isDispatchable` in @sahoda/shared is the one definition of "waiting to
    // go out". A draft with a time is a plan, and listing it under "Upcoming"
    // told the reader it would be sent.
    expect(upcoming(rows, now, 5).map((p) => p.id)).not.toContain('dated-draft')
  })

  it('includes an APPROVED post with a time — that is what the app writes when it schedules', () => {
    expect(upcoming(rows, now, 5).map((p) => p.id)).toContain('approved')
  })

  it('excludes the past — an upcoming list holding this morning is not upcoming', () => {
    expect(upcoming(rows, now, 5).map((p) => p.id)).not.toContain('past')
  })

  it('excludes the undated, which have no time to be next at', () => {
    expect(upcoming(rows, now, 5).map((p) => p.id)).not.toContain('undated')
  })

  it('honours the limit', () => {
    expect(upcoming(rows, now, 1).map((p) => p.id)).toEqual(['soon'])
  })
})
