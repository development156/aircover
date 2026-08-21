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

/**
 * Most cases are "we hold connections"; the divergence cases override it.
 *
 * `'connectedAccounts' in over`, not `?? 2`: null is now a MEANING here — "we
 * could not count" — and `??` treats it as absent, so a `?? 2` default silently
 * substituted 2 for the exact value under test and the null case passed as
 * `unresolved`. The `in` check is the same one `meta` already needed, for the
 * same reason.
 */
const classify = (over: {
  rows?: number
  meta?: ZernioInboxMeta | undefined
  surface?: typeof reviews
  connectedAccounts?: number | null
}): InboxEmptiness =>
  classifyInboxResult({
    rows: over.rows ?? 0,
    meta: 'meta' in over ? over.meta : meta(),
    surface: over.surface ?? reviews,
    connectedAccounts: 'connectedAccounts' in over ? (over.connectedAccounts ?? null) : 2,
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

  /**
   * THREE facts, not two. `countAccounts` used to `return 0` when its own
   * `connections` query errored, and this is the one branch where that 0 is
   * load-bearing: it chooses between "connect an account" and "reconnect the
   * accounts you have". A failed count therefore inverted the exact branch the
   * two tests above exist to protect — and inverted it SILENTLY, because
   * `null > 0` is false in JavaScript, so the null fell through to the zero arm
   * rather than to an error.
   */
  it('is neither when the count itself failed', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: null })

    expect(r.state).toBe('unknown')
    expect(r.showList).toBe(false)
    // Not the "you have none" sentence...
    expect(r.state).not.toBe('never_connected')
    // ...and not the "you have some" sentence either, which would print a count
    // nothing measured.
    expect(r.state).not.toBe('unresolved')
    expect(`${r.headline} ${r.body}`).toMatch(/could not check which accounts/i)
    expect(`${r.headline} ${r.body}`).toMatch(/not a reading of your reviews/i)
  })

  it('an unknown count never asks the customer to connect anything', () => {
    const r = classify({ meta: meta({ accountsQueried: 0 }), connectedAccounts: null })

    // The remedy has to be one that can work. "Connect an account" cannot: we do
    // not know whether they have one.
    expect(`${r.headline} ${r.body}`).not.toMatch(/connect an account/i)
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
    expect(Object.keys(INBOX_SURFACES).sort()).toEqual([
      'comments',
      'conversations',
      'reviews',
      'thread',
    ])
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

describe('a single-account read has no fan-out to confirm', () => {
  /**
   * `[LIVE 2026-08-10]` neither account-scoped endpoint sends `ZernioInboxMeta`:
   * `/inbox/conversations/{id}/messages` sends no `meta` at all, and
   * `/inbox/comments/{postId}` sends `{platform, postId, accountId, lastUpdated}`.
   * Neither will ever carry `accountsQueried`, because there is no fan-out to report.
   *
   * Absent this distinction the `!meta` branch fired on every successful thread and
   * drill-down read, and `SurfaceBanner` renders `unknown` — so both pages carried a
   * live warning that Sahoda "could not confirm this view is complete" about a read
   * that fully succeeded. Same false-claim class as an empty list reported as "none":
   * a statement about our own uncertainty that we had no basis for.
   */
  const thread = INBOX_SURFACES.thread

  it('does not claim a successful thread read might be incomplete', () => {
    const r = classifyInboxResult({
      rows: 2,
      meta: undefined,
      surface: thread,
      connectedAccounts: 1,
      fanOut: false,
    })
    expect(r.state).toBe('ok')
    expect(r.showList).toBe(true)
    expect(r.headline).not.toMatch(/could not confirm/i)
  })

  it('reports an genuinely empty thread as empty, not as unconfirmable', () => {
    const r = classifyInboxResult({
      rows: 0,
      meta: undefined,
      surface: thread,
      connectedAccounts: 1,
      fanOut: false,
    })
    expect(r.state).toBe('empty')
  })

  it('still says "cannot confirm" when a FAN-OUT list loses its meta', () => {
    // The branch is right for the surface it was written for; it just did not belong
    // on a read that asks exactly one account.
    expect(classify({ meta: undefined, rows: 3 }).state).toBe('unknown')
  })

  it('never renders a connect-an-account prompt for a thread that resolved', () => {
    // `never_connected` on a drill-down would tell the user to connect the account
    // whose thread they are currently reading.
    const r = classifyInboxResult({
      rows: 0,
      meta: undefined,
      surface: thread,
      connectedAccounts: 0,
      fanOut: false,
    })
    expect(r.state).not.toBe('never_connected')
    expect(r.state).not.toBe('unresolved')
  })
})
