import { describe, expect, it } from 'vitest'

import { comparedEnquiries, comparedReach, comparedReplies, comparisonLine } from './compose'

/**
 * THE ACCEPTANCE RULE THIS FILE EXISTS FOR: no section ever displays a
 * comparison it cannot support with real data. Every path that could invent one
 * is stated below.
 */
describe('the three numbers', () => {
  it('withholds the comparison and says why when there is no baseline', () => {
    const compared = comparedReach({
      status: 'ok',
      value: 400,
      baseline: null,
      postsRan: 2,
      postsMeasured: 2,
      posts: [],
    })
    expect(compared).toEqual({ status: 'learning', value: 400 })
    expect(comparisonLine(compared)).toContain('still learning your normal')
  })

  it('shows no number at all when the read failed', () => {
    const compared = comparedReach({ status: 'unreadable' })
    expect(compared).toEqual({ status: 'unreadable' })
    // Not a zero and not a dash: both are claims about the reader's week.
    expect(comparisonLine(compared)).not.toMatch(/\b0\b/)
  })

  it('compares reach to the workspace’s own normal, never to anyone else', () => {
    const compared = comparedReach({
      status: 'ok',
      value: 1340,
      baseline: 1000,
      postsRan: 4,
      postsMeasured: 4,
      posts: [],
    })
    expect(comparisonLine(compared)).toBe('up 34% on your normal')
  })

  it('calls a small move no move', () => {
    const compared = comparedReplies({ status: 'ok', value: 13, previous: 12 })
    expect(comparisonLine(compared)).toBe('the same as last week')
  })

  it('draws no comparison on a week whose posts have not been counted yet', () => {
    // Posts went out and the platforms have not reported. A baseline exists, so
    // the naive arithmetic said "down 100% on your normal" about a week nobody
    // had measured.
    const compared = comparedReach({
      status: 'ok',
      value: 0,
      baseline: 800,
      postsRan: 3,
      postsMeasured: 0,
      posts: [],
    })
    expect(compared.status).toBe('learning')
    expect(comparisonLine(compared)).not.toContain('100%')
  })

  it('never calls a rise from nothing "the same as last week"', () => {
    const compared = comparedReplies({ status: 'ok', value: 12, previous: 0 })
    expect(compared.status).toBe('learning')
    expect(comparisonLine(compared)).not.toContain('same')
  })

  it('tells the reader how many enquiries are still on them', () => {
    expect(comparisonLine(comparedEnquiries({ status: 'ok', value: 3, unanswered: 1 }))).toBe(
      '1 still waiting on you',
    )
    expect(comparisonLine(comparedEnquiries({ status: 'ok', value: 3, unanswered: 0 }))).toBe(
      'all of them answered',
    )
  })
})
