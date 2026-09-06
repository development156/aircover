import { describe, expect, test } from 'vitest'
import type { LedgerEntry } from '@sahoda/shared'

import { agoWords, liveLines, type LivePost } from './live'

const NOW = new Date('2026-09-06T10:00:00.000Z')

const post = (over: Partial<LivePost>): LivePost => ({
  id: 'p',
  title: 'Tuesday roast',
  intent: 'draft',
  updated_at: '2026-09-06T09:50:00.000Z',
  scheduled_at: null,
  origin: 'manual',
  ...over,
})

const entry = (over: Partial<LedgerEntry>): LedgerEntry =>
  ({
    seq: 1,
    entry_type: 'DEBIT',
    amount: 3,
    action_type: 'caption_rewrite',
    created_at: '2026-09-06T09:40:00.000Z',
    ...over,
  }) as unknown as LedgerEntry

describe('agoWords', () => {
  test('speaks in minutes, hours, yesterday and days', () => {
    expect(agoWords('2026-09-06T09:59:40.000Z', NOW)).toBe('just now')
    expect(agoWords('2026-09-06T09:56:00.000Z', NOW)).toBe('4 minutes ago')
    expect(agoWords('2026-09-06T07:00:00.000Z', NOW)).toBe('3 hours ago')
    expect(agoWords('2026-09-05T09:00:00.000Z', NOW)).toBe('yesterday')
    expect(agoWords('2026-09-01T09:00:00.000Z', NOW)).toBe('5 days ago')
  })
})

describe('liveLines', () => {
  test('every line is a plain sentence about a row that exists, newest first', () => {
    const lines = liveLines({
      posts: [
        post({ id: 'a', intent: 'draft', updated_at: '2026-09-06T09:50:00.000Z' }),
        post({
          id: 'b',
          title: 'Weekend menu',
          intent: 'review',
          origin: 'plan_week',
          updated_at: '2026-09-06T09:55:00.000Z',
        }),
      ],
      ledger: [entry({})],
      sweepRanAt: new Date('2026-09-06T09:58:00.000Z').getTime(),
      now: NOW,
    })
    expect(lines.map((l) => l.text)).toEqual([
      '“Weekend menu” is waiting for your OK',
      'You saved a draft: “Tuesday roast”',
      'Sahoda used 3 credits on a caption rewrite',
      'Sahoda last checked for posts to send',
    ])
  })

  test('no jargon leaks: no status names, no table names', () => {
    const lines = liveLines({
      posts: (
        [
          'idea',
          'draft',
          'review',
          'approved',
          'scheduled',
          'publishing',
          'published',
          'partial',
          'failed',
        ] as const
      ).map((intent, i) => post({ id: String(i), intent })),
      ledger: (['DEBIT', 'GRANT', 'TOPUP', 'RELEASE', 'PERF_REWARD', 'EXPIRE'] as const).map(
        (entry_type, i) => entry({ entry_type, seq: i }),
      ),
      sweepRanAt: null,
      now: NOW,
    })
    const text = lines.map((l) => l.text).join(' | ')
    expect(text).not.toMatch(
      /\b(variant|ledger|debit|grant|approved|publishing|review|status|cron)\b/i,
    )
  })

  test('with nothing to report, it says when Sahoda next looks', () => {
    const lines = liveLines({ posts: [], ledger: [], sweepRanAt: null, now: NOW })
    expect(lines).toHaveLength(1)
    expect(lines[0]!.text).toBe('Sahoda looks for posts to send every 5 minutes')
  })

  test('a hold is not a story, and an expired post is not news', () => {
    const lines = liveLines({
      posts: [post({ intent: 'expired' })],
      ledger: [entry({ entry_type: 'HOLD' })],
      sweepRanAt: null,
      now: NOW,
    })
    expect(lines).toHaveLength(1)
  })

  test('never more than six lines, and the check is always the last one', () => {
    const lines = liveLines({
      posts: Array.from({ length: 10 }, (_, i) => post({ id: String(i) })),
      ledger: [],
      sweepRanAt: null,
      now: NOW,
    })
    expect(lines).toHaveLength(6)
    expect(lines[5]!.kind).toBe('check')
  })
})
