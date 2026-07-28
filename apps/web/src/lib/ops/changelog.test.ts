import { describe, expect, it } from 'vitest'
import type { OpsChangelogEntry } from '@sahoda/shared'

import {
  dayToPlainText,
  groupByDay,
  istDayKey,
  istDayLabel,
  toMarkdown,
  toPlainText,
} from './changelog'

function entry(
  over: Partial<OpsChangelogEntry> & Pick<OpsChangelogEntry, 'seq'>,
): OpsChangelogEntry {
  return {
    id: '00000000-0000-4000-8000-000000000005',
    title: 'The sync commands are in place',
    summary_plain: 'You can now move a card with one command.',
    details_tech: null,
    kind: 'added',
    author: 'GIRIJA',
    author_overridden: false,
    task_codes: [],
    tourable: false,
    happened_at: '2026-07-25T19:15:40Z',
    created_at: '2026-07-25T19:15:40Z',
    updated_at: '2026-07-25T19:15:40Z',
    ...over,
  }
}

describe('istDayKey', () => {
  it('groups by the IST day, not the UTC one', () => {
    // 19:15 UTC is 00:45 the NEXT day in IST. Grouping by UTC would file an
    // evening's work under yesterday for everyone who did it.
    expect(istDayKey('2026-07-25T19:15:40Z')).toBe('2026-07-26')
    expect(istDayKey('2026-07-25T18:00:00Z')).toBe('2026-07-25')
  })

  it('does not throw on an unparseable timestamp', () => {
    expect(istDayKey('nope')).toBe('unknown')
    expect(istDayLabel('nope')).toBe('Unknown date')
  })
})

describe('groupByDay', () => {
  it('puts the newest day first and the newest entry first within it', () => {
    const days = groupByDay([
      entry({ seq: 1, happened_at: '2026-07-24T06:00:00Z' }),
      entry({ seq: 3, happened_at: '2026-07-25T06:00:00Z' }),
      entry({ seq: 2, happened_at: '2026-07-25T05:00:00Z' }),
    ])

    expect(days.map((d) => d.key)).toEqual(['2026-07-25', '2026-07-24'])
    expect(days[0]!.entries.map((e) => e.seq)).toEqual([3, 2])
  })

  it('is empty for no entries rather than one empty day', () => {
    expect(groupByDay([])).toEqual([])
  })
})

describe('toPlainText', () => {
  it('reads as finished prose for someone who has never seen the dashboard', () => {
    const text = toPlainText(entry({ seq: 58 }))

    expect(text).toContain('The sync commands are in place')
    expect(text).toContain('You can now move a card with one command.')
    expect(text).toContain('— GIRIJA · 26 Jul 2026 · 00:45')
  })

  it('OMITS details_tech — the plain copy is the one pasted to a non-technical reader', () => {
    const text = toPlainText(entry({ seq: 58, details_tech: 'Uses a SECURITY DEFINER RPC.' }))
    expect(text).not.toContain('SECURITY DEFINER')
  })

  it('carries no markdown syntax', () => {
    expect(toPlainText(entry({ seq: 58 }))).not.toMatch(/[#*_`]/)
  })
})

describe('toMarkdown', () => {
  it('carries the technical detail behind a disclosure, for a changelog file or PR', () => {
    const md = toMarkdown(entry({ seq: 58, details_tech: 'Uses a SECURITY DEFINER RPC.' }))

    expect(md).toContain('### The sync commands are in place')
    expect(md).toContain('<details><summary>Technical details</summary>')
    expect(md).toContain('Uses a SECURITY DEFINER RPC.')
  })

  it('omits the disclosure entirely when there is no technical detail', () => {
    expect(toMarkdown(entry({ seq: 58 }))).not.toContain('<details>')
  })

  it('lists linked task codes, and omits the brackets when there are none', () => {
    expect(toMarkdown(entry({ seq: 58, task_codes: ['SL-011', 'SL-017'] }))).toContain(
      '(SL-011, SL-017)',
    )
    expect(toMarkdown(entry({ seq: 58 }))).toContain('*added — GIRIJA')
  })
})

describe('dayToPlainText', () => {
  it('leads with the day and joins its entries', () => {
    const [day] = groupByDay([entry({ seq: 2 }), entry({ seq: 1, title: 'Second thing' })])
    const text = dayToPlainText(day!)

    expect(text.startsWith('Sunday, 26 July 2026')).toBe(true)
    expect(text).toContain('Second thing')
  })
})
