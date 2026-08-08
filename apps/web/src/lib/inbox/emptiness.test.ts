import type { ZernioInboxMeta } from '@sahoda/publishing'
import { describe, it, expect } from 'vitest'

import {
  INBOX_SURFACES,
  classifyInboxResult,
  couldNotAsk,
  neverConnected,
  notRead,
  type InboxEmptiness,
} from './emptiness'

const meta = (over: Partial<ZernioInboxMeta> = {}): ZernioInboxMeta => ({
  accountsQueried: 2,
  accountsFailed: 0,
  failedAccounts: [],
  ...over,
})

const reviews = INBOX_SURFACES.reviews

/** Most cases are "we hold connections"; the divergence cases override it. */
const classify = (over: {
  rows?: number
  meta?: ZernioInboxMeta | undefined
  surface?: typeof reviews
  connectedAccounts?: number
}): InboxEmptiness =>
  classifyInboxResult({
    rows: over.rows ?? 0,
    meta: 'meta' in over ? over.meta : meta(),
    surface: over.surface ?? reviews,
    connectedAccounts: over.connectedAccounts ?? 2,
  })

describe('classifyInboxResult', () => {
  it('is unknown when Zernio sent no meta — we cannot classify what we did not measure', () => {
    expect(classify({ meta: undefined }).state).toBe('unknown')
  })

  it('is empty only when accounts were actually asked and all answered', () => {
    expect(classify({}).state).toBe('empty')
  })

  it('is could_not_ask when every account failed and nothing came back', () => {
    const r = classify({
      meta: meta({ accountsFailed: 2, failedAccounts: [{ platform: 'instagram', code: '429' }] }),
    })
    expect(r.state).toBe('could_not_ask')
    expect(r.showList).toBe(false)
  })

  it('is partial when some rows arrived but an account failed — and still shows them', () => {
    const r = classify({ rows: 3, meta: meta({ accountsFailed: 1 }) })
    expect(r.state).toBe('partial')
    expect(r.showList).toBe(true)
  })

  it('is ok when rows arrived and nothing failed', () => {
    const r = classify({ rows: 3 })
    expect(r.state).toBe('ok')
    expect(r.showList).toBe(true)
  })
})

describe('accountsQueried === 0 is two different facts', () => {
  it('is never_connected when we hold no connection either', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 0 })
    expect(r.state).toBe('never_connected')
    expect(r.showList).toBe(false)
  })

  it('is unresolved — not never_connected — when we hold a connection Zernio did not ask', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 1 })
    expect(r.state).toBe('unresolved')
    expect(r.showList).toBe(false)
  })

  it('never tells a customer to connect an account they already connected', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 1 })
    expect(`${r.headline} ${r.body}`).not.toMatch(/Connect an account to see/i)
    // It must instead name the real remedy.
    expect(`${r.headline} ${r.body}`).toMatch(/reconnect/i)
  })

  it('reports unresolved as a resolution failure, never as a count of zero', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 3 })
    expect(`${r.headline} ${r.body}`).toMatch(/could not resolve/i)
    expect(`${r.headline} ${r.body}`).toMatch(/not a reading of your reviews/i)
    expect(`${r.headline} ${r.body}`).not.toMatch(/\bno reviews\b/i)
  })
})

describe('the states no read produces', () => {
  it('notRead says nothing went out, and does not blame the customer', () => {
    const r = notRead(reviews)
    expect(r.state).toBe('not_read')
    expect(r.showList).toBe(false)
    expect(`${r.headline} ${r.body}`).toMatch(/not a reading of your reviews/i)
    // The remedy is ours, not the customer's — never send them to the connect flow
    // for a key WE did not provision.
    expect(`${r.headline} ${r.body}`).not.toMatch(/connect (an|a|your) /i)
  })

  it('neverConnected names what to connect', () => {
    const r = neverConnected(reviews)
    expect(r.state).toBe('never_connected')
    expect(`${r.headline} ${r.body}`).toMatch(/Google Business Profile/)
  })

  it('couldNotAsk states the request went out and nothing was charged', () => {
    const r = couldNotAsk(reviews)
    expect(r.state).toBe('could_not_ask')
    expect(r.body).toMatch(/nothing was charged/i)
  })

  it('gives the three no-answer states three different sentences', () => {
    const sentences = [notRead(reviews), neverConnected(reviews), couldNotAsk(reviews)].map(
      (r) => `${r.headline} ${r.body}`,
    )
    expect(new Set(sentences).size).toBe(3)
  })
})

describe('what the copy is forbidden from claiming', () => {
  const notAboutTheShop = (r: InboxEmptiness): void => {
    const copy = `${r.headline} ${r.body}`
    // "No reviews" is a claim about the customer's business. We only ever know what
    // WE asked and what came back.
    expect(copy).not.toMatch(/\bno reviews\b|\bno customers\b|\bnobody\b/i)
  }

  it('never says "no reviews" when no GBP account has ever connected', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 0 })
    notAboutTheShop(r)
    expect(`${r.headline} ${r.body}`).toMatch(/Google Business Profile/)
    expect(`${r.headline} ${r.body}`).toMatch(/connect/i)
  })

  it('never says "no reviews" when the read failed either', () => {
    notAboutTheShop(classify({ meta: meta({ accountsFailed: 2 }) }))
  })

  it('never says "no reviews" when the accounts could not be resolved', () => {
    notAboutTheShop(classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 2 }))
  })

  it('gives every state a headline and a body, and eight distinct states exist', () => {
    const all: InboxEmptiness[] = [
      classify({ meta: undefined }),
      classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 0 }),
      classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: 1 }),
      classify({}),
      classify({ meta: meta({ accountsFailed: 2 }) }),
      classify({ rows: 3, meta: meta({ accountsFailed: 1 }) }),
      classify({ rows: 3 }),
      notRead(reviews),
    ]
    for (const r of all) {
      expect(r.headline.length).toBeGreaterThan(0)
      expect(r.body.length).toBeGreaterThan(0)
    }
    expect(new Set(all.map((r) => r.state)).size).toBe(8)
  })
})

describe('the classifier is not a reviews special case', () => {
  it('covers conversations, comments and reviews', () => {
    expect(Object.keys(INBOX_SURFACES).sort()).toEqual(['comments', 'conversations', 'reviews'])
  })

  it.each(['conversations', 'comments'] as const)(
    'tells %s apart from "never connected" too',
    (key) => {
      const surface = INBOX_SURFACES[key]
      expect(
        classifyInboxResult({
          rows: 0,
          meta: meta({ accountsQueried: 0 }),
          surface,
          connectedAccounts: 0,
        }).state,
      ).toBe('never_connected')
      expect(
        classifyInboxResult({ rows: 0, meta: meta(), surface, connectedAccounts: 2 }).state,
      ).toBe('empty')
    },
  )

  it('names the failing platforms so a failure is actionable', () => {
    const r = classify({
      meta: meta({
        accountsFailed: 1,
        failedAccounts: [{ platform: 'instagram', accountUsername: 'chai_co', code: '429' }],
      }),
    })
    expect(r.failed.map((f) => f.platform)).toEqual(['instagram'])
  })

  it('never carries a token, secret or raw error blob into the failure list', () => {
    const r = classify({
      meta: meta({
        accountsFailed: 1,
        failedAccounts: [{ platform: 'instagram', error: 'Bearer sk-live-abc123 rejected' }],
      }),
    })
    expect(JSON.stringify(r)).not.toMatch(/Bearer|sk-live/)
  })
})
