import { describe, it, expect } from 'vitest'

import { diffSnapshots, daySpanBetween, type SnapshotForDiff } from './diff'
import { extractPrices, normalizePageText } from './snapshot'

const social = (
  capturedOn: string,
  fields: { followers?: number; posts?: Array<{ id: string; caption?: string }> },
): SnapshotForDiff => ({
  id: `s-${capturedOn}`,
  capturedOn,
  payload: {
    kind: 'social',
    handle: 'rival',
    ...(fields.followers === undefined ? {} : { followers: fields.followers }),
    posts: fields.posts ?? [],
  },
})

const site = (
  capturedOn: string,
  fields: { title?: string; text?: string; prices?: ReturnType<typeof extractPrices> },
): SnapshotForDiff => ({
  id: `w-${capturedOn}`,
  capturedOn,
  payload: {
    kind: 'website',
    url: 'https://rival.example/pricing',
    ...(fields.title === undefined ? {} : { title: fields.title }),
    wordCount: (fields.text ?? '').split(' ').filter(Boolean).length,
    text: fields.text ?? '',
    prices: fields.prices ?? extractPrices(fields.text ?? ''),
  },
})

describe('the differ decides what changed, and refuses to invent', () => {
  it('reports nothing at all when nothing moved', () => {
    const a = social('2026-08-20', { followers: 1200, posts: [{ id: 'p1' }] })
    const b = social('2026-08-21', { followers: 1200, posts: [{ id: 'p1' }] })
    expect(diffSnapshots(a, b)).toEqual([])
  })

  it('counts new posts by platform id', () => {
    const a = social('2026-08-20', { posts: [{ id: 'p1' }] })
    const b = social('2026-08-21', { posts: [{ id: 'p2' }, { id: 'p1' }, { id: 'p3' }] })
    const [change] = diffSnapshots(a, b)
    expect(change?.changeKind).toBe('new_posts')
    expect(change?.detail.count).toBe(2)
    expect(change?.summary).toBe('Posted 2 times.')
  })

  it('does NOT report a deletion when an old post falls off the end of the list', () => {
    // The provider returns the latest dozen. A post leaving that window is the
    // normal case; calling it "they deleted a post" would be wrong nearly always.
    const a = social('2026-08-20', { posts: [{ id: 'old' }, { id: 'p1' }] })
    const b = social('2026-08-21', { posts: [{ id: 'p1' }] })
    expect(diffSnapshots(a, b)).toEqual([])
  })

  // ── absent is not zero, and absent is not a change ─────────────────────────

  it('a follower count the platform stopped reporting is NOT a fall', () => {
    const a = social('2026-08-20', { followers: 1200 })
    const b = social('2026-08-21', {}) // Instagram declined to say
    expect(diffSnapshots(a, b)).toEqual([])
  })

  it('a follower count that only appears today is NOT a rise from zero', () => {
    const a = social('2026-08-20', {})
    const b = social('2026-08-21', { followers: 1200 })
    expect(diffSnapshots(a, b)).toEqual([])
  })

  it('a real fall to zero IS reported — the point of the two tests above', () => {
    // If "absent" and "zero" were conflated, this case and the two above would be
    // indistinguishable. They must not be.
    const a = social('2026-08-20', { followers: 1200 })
    const b = social('2026-08-21', { followers: 0 })
    const [change] = diffSnapshots(a, b)
    expect(change?.changeKind).toBe('audience_moved')
    expect(change?.detail).toEqual({ from: 1200, to: 0, delta: -1200 })
  })

  // ── a gap is carried, not hidden ──────────────────────────────────────────

  it('a diff across an outage says how many days it covers', () => {
    // Radar failed to fetch on the 19th, 20th and 21st. On the 22nd it resumes and
    // finds four new posts. Those four posts happened over four days. Reporting
    // them as today's activity would manufacture a burst that never occurred —
    // which is exactly what a resumed collector does if nobody carries the span.
    const a = social('2026-08-18', { followers: 1000, posts: [{ id: 'p0' }] })
    const b = social('2026-08-22', {
      followers: 1400,
      posts: [{ id: 'p1' }, { id: 'p2' }, { id: 'p3' }, { id: 'p4' }],
    })
    const changes = diffSnapshots(a, b)
    expect(changes.every((c) => c.daySpan === 4)).toBe(true)
    expect(changes.find((c) => c.changeKind === 'new_posts')?.summary).toBe(
      'Posted 4 times over the last 4 days.',
    )
    expect(changes.find((c) => c.changeKind === 'audience_moved')?.summary).toBe(
      'Followers up 400 over the last 4 days, to 1,400.',
    )
  })

  it('consecutive days say nothing about a span, because there is none to say', () => {
    expect(daySpanBetween('2026-08-21', '2026-08-22')).toBe(1)
    const a = social('2026-08-21', { followers: 1000 })
    const b = social('2026-08-22', { followers: 1010 })
    expect(diffSnapshots(a, b)[0]?.summary).toBe('Followers up 10, to 1,010.')
  })

  // ── the website side ──────────────────────────────────────────────────────

  it('names the price that appeared', () => {
    const a = site('2026-08-20', { text: 'basic ₹999 per month' })
    const b = site('2026-08-21', { text: 'basic ₹1,499 per month' })
    const [change] = diffSnapshots(a, b)
    expect(change?.changeKind).toBe('page_content')
    expect(change?.summary).toContain('now showing ₹1,499')
    expect(change?.detail.pricesRemoved).toEqual([{ raw: '₹999', currency: 'INR', amount: 999 }])
  })
})

describe('the cheap check hashes what a person reads, not what a server emits', () => {
  it('ignores the attribute churn that made a raw-byte hash useless', () => {
    // MEASURED 2026-08-22 on eight real Indian SMB sites, fetched twice four
    // minutes apart with no real change: the RAW HTML hash held still on 2 of 8
    // and the normalised-text hash held still on 8 of 8. This is that finding in
    // miniature — the version string is the whole difference between the two.
    const monday =
      '<html><head><link href="/a.css?v=1755820000"></head><body><h1>Fresh bread</h1></body></html>'
    const tuesday =
      '<html><head><link href="/a.css?v=1755906400"></head><body><h1>Fresh bread</h1></body></html>'
    expect(monday).not.toBe(tuesday)
    expect(normalizePageText(monday)).toBe(normalizePageText(tuesday))
    expect(normalizePageText(monday)).toBe('fresh bread')
  })

  it('still notices when the words change', () => {
    const before = normalizePageText('<p>Fresh bread ₹40</p>')
    const after = normalizePageText('<p>Fresh bread ₹45</p>')
    expect(before).not.toBe(after)
  })

  it('reads prices as they were written, and skips a bare zero', () => {
    expect(extractPrices('starter ₹0 · pro ₹1,499 · usd $29')).toEqual([
      { raw: '₹1,499', currency: 'INR', amount: 1499 },
      { raw: '$29', currency: 'USD', amount: 29 },
    ])
  })
})
