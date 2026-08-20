import { describe, it, expect } from 'vitest'

import { ZernioError } from './client'
import {
  AUDIENCE_DIMENSIONS,
  DEMOGRAPHICS_FOLLOWER_FLOOR,
  bucketsFrom,
  breakdownFrom,
  classifyAudience,
  mayOfferRetry,
  type AudienceState,
} from './audience-state'
import type { ZernioInstagramDemographics } from './reads'

/**
 * Every payload in this file is either a RECORDING or the vendor's own published
 * example. Nothing here is an invented shape.
 *
 *   · SUPPRESSED_LIVE  — captured 2026-08-20 from `GET /analytics/instagram/
 *     demographics` against the workspace's real connected account (1 follower).
 *   · POPULATED_DOC    — Zernio's own `allBreakdowns` 200 example, copied verbatim
 *     from their OpenAPI document. It is the strongest claim available about the
 *     populated shape without a hundred-follower account to point at, and it is
 *     marked as documentation rather than measurement everywhere it is used.
 */

/** LIVE 2026-08-20. An account with 1 follower. Note the status: 200, not 400. */
const SUPPRESSED_LIVE: ZernioInstagramDemographics = {
  success: true,
  accountId: '6a81aff477555aae0149e261',
  platform: 'instagram',
  metric: 'follower_demographics',
  timeframe: 'this_month',
  demographics: { age: [], city: [], country: [], gender: [] },
  note: 'Demographics show top 45 entries per dimension. Requires 100+ followers.',
}

/** Zernio OpenAPI, `allBreakdowns` example, verbatim. DOCUMENTED, not measured. */
const POPULATED_DOC: ZernioInstagramDemographics = {
  success: true,
  accountId: '64e1a2b3c4d5e6f7a8b9c0d1',
  platform: 'instagram',
  metric: 'follower_demographics',
  timeframe: 'last_30_days',
  demographics: {
    age: [
      { dimension: '25-34', value: 4500 },
      { dimension: '18-24', value: 3200 },
    ],
    gender: [
      { dimension: 'M', value: 3000 },
      { dimension: 'F', value: 4800 },
    ],
    city: [
      { dimension: 'New York, New York', value: 800 },
      { dimension: 'Los Angeles, California', value: 650 },
    ],
    country: [
      { dimension: 'US', value: 5000 },
      { dimension: 'GB', value: 1200 },
    ],
  },
  note: 'Demographics show top 45 entries per dimension. Requires 100+ followers.',
}

const ok = (payload: ZernioInstagramDemographics) => ({ ok: true as const, payload })
const threw = (error: unknown) => ({ ok: false as const, error })

function zernioError(status: number, code: string): ZernioError {
  return new ZernioError({
    message: 'x',
    status,
    code,
    type: 't',
    rateLimit: { limit: null, remaining: null, reset: null },
  })
}

describe('the floor is the platform’s, and it is written down once', () => {
  it('is 100, matching both Meta and Zernio', () => {
    // Meta: "Not returned if the IG User has less than 100 followers."
    // Zernio: "Requires at least 100 followers", echoed in every live `note`.
    expect(DEMOGRAPHICS_FOLLOWER_FLOOR).toBe(100)
    expect(SUPPRESSED_LIVE.note).toContain('100+ followers')
  })
})

describe('classifyAudience · the empty answer, which is four different things', () => {
  it('calls a live empty answer SUPPRESSED when the follower count explains it', () => {
    const state = classifyAudience({ result: ok(SUPPRESSED_LIVE), followers: 1 })
    expect(state).toEqual({ kind: 'suppressed', followers: 1, floor: 100 })
  })

  it('refuses to call it suppressed when the follower count is unknown', () => {
    // The refusal this module exists for. Without a count there is no evidence, and
    // "you are too small" is a claim about the customer's business.
    const state = classifyAudience({ result: ok(SUPPRESSED_LIVE), followers: null })
    expect(state.kind).toBe('no-data')
  })

  it('refuses to call it suppressed when the account is over the floor', () => {
    // The failure that merging the two states would produce: telling a
    // two-thousand-follower account it is too small.
    const state = classifyAudience({ result: ok(SUPPRESSED_LIVE), followers: 2000 })
    expect(state.kind).toBe('no-data')
    expect(state).toMatchObject({ followers: 2000 })
  })

  it('treats exactly 100 followers as over the floor, not under it', () => {
    // "less than 100" is Meta's wording. An off-by-one here would tell an account
    // that has just cleared the threshold that it has not.
    expect(classifyAudience({ result: ok(SUPPRESSED_LIVE), followers: 99 }).kind).toBe('suppressed')
    expect(classifyAudience({ result: ok(SUPPRESSED_LIVE), followers: 100 }).kind).toBe('no-data')
  })

  it('reads the documented populated answer as READY', () => {
    const state = classifyAudience({ result: ok(POPULATED_DOC), followers: 5230 })
    expect(state.kind).toBe('ready')
    if (state.kind !== 'ready') return
    // All four dimensions, and the labels exactly as Meta spelled them.
    expect(Object.keys(state.breakdown).sort()).toEqual([...AUDIENCE_DIMENSIONS].sort())
    expect(state.breakdown.gender).toEqual([
      { label: 'M', value: 3000 },
      { label: 'F', value: 4800 },
    ])
    expect(state.breakdown.city?.[0]?.label).toBe('New York, New York')
    // The vendor's own example echoes a timeframe outside its declared enum. Carried
    // through rather than refused — a type pinned to the enum would reject a body
    // the vendor publishes.
    expect(state.timeframe).toBe('last_30_days')
    expect(state.followers).toBe(5230)
  })
})

describe('classifyAudience · a failed call says nothing about the audience', () => {
  it.each([
    [402, 'analytics_addon_required', 'not-configured'],
    [404, 'account_not_found', 'unresolved'],
    [403, 'UNKNOWN', 'unresolved'],
    [500, 'UNKNOWN', 'unreadable'],
    [429, 'rate_limited', 'unreadable'],
  ])('HTTP %i / %s becomes %s', (status, code, expected) => {
    expect(
      classifyAudience({ result: threw(zernioError(status, code)), followers: null }).kind,
    ).toBe(expected)
  })

  it('never becomes suppressed, whatever the follower count is', () => {
    // The ordering rule, executed. A thrown call classified with a low follower
    // count in scope must not come back as "you're too small" — the request never
    // reached a platform, so it supports no claim about the account at all.
    for (const followers of [null, 0, 1, 99]) {
      const state = classifyAudience({ result: threw(zernioError(500, 'x')), followers })
      expect(state.kind).toBe('unreadable')
    }
  })

  it('treats a non-Zernio throw as unreadable rather than guessing', () => {
    expect(
      classifyAudience({ result: threw(new TypeError('fetch failed')), followers: 1 }).kind,
    ).toBe('unreadable')
  })
})

describe('bucketsFrom · a bucket that cannot be narrowed is dropped, never coerced', () => {
  it('keeps a bucket the platform reported as zero', () => {
    // The half a naive "reject falsy values" guard gets wrong. Meta said zero.
    expect(bucketsFrom([{ dimension: '65+', value: 0 }])).toEqual([{ label: '65+', value: 0 }])
  })

  it.each([
    ['a missing value', [{ dimension: '25-34' }]],
    ['a null value', [{ dimension: '25-34', value: null }]],
    ['a string value', [{ dimension: '25-34', value: '4500' }]],
    ['NaN', [{ dimension: '25-34', value: Number.NaN }]],
    ['Infinity', [{ dimension: '25-34', value: Number.POSITIVE_INFINITY }]],
    ['a negative count', [{ dimension: '25-34', value: -5 }]],
    ['an empty label', [{ dimension: '   ', value: 10 }]],
    ['a non-string label', [{ dimension: 25, value: 10 }]],
    ['a null entry', [null]],
    ['not an array at all', { dimension: '25-34', value: 10 }],
  ])('drops %s', (_what, raw) => {
    expect(bucketsFrom(raw)).toEqual([])
  })

  it('keeps the good buckets out of a mixed list', () => {
    expect(
      bucketsFrom([{ dimension: '25-34', value: 10 }, null, { dimension: '35-44', value: '20' }]),
    ).toEqual([{ label: '25-34', value: 10 }])
  })
})

describe('breakdownFrom · every dimension, not just the first one anyone thought of', () => {
  it.each(AUDIENCE_DIMENSIONS)('reports %s on its own', (dimension) => {
    // The sibling-shape check. A guard written against `age` alone is precisely how
    // this repo shipped three duplicate-channel defects in two days.
    const payload = { demographics: { [dimension]: [{ dimension: 'x', value: 1 }] } }
    expect(Object.keys(breakdownFrom(payload))).toEqual([dimension])
  })

  it('omits a dimension the platform sent as an empty array', () => {
    // Present-and-empty must become ABSENT, so that one `Object.keys(...).length`
    // test answers "reported nothing" for all four dimensions at once.
    expect(breakdownFrom(SUPPRESSED_LIVE)).toEqual({})
  })

  it('ignores a dimension nothing reads', () => {
    const payload = { demographics: { language: [{ dimension: 'en', value: 5 }] } }
    expect(breakdownFrom(payload as ZernioInstagramDemographics)).toEqual({})
  })

  it('survives a missing demographics key entirely', () => {
    expect(breakdownFrom({})).toEqual({})
    expect(breakdownFrom({ demographics: undefined })).toEqual({})
  })
})

describe('mayOfferRetry · exactly one state may promise that trying again helps', () => {
  const EVERY_STATE: AudienceState[] = [
    { kind: 'ready', breakdown: {}, timeframe: null, followers: null },
    { kind: 'suppressed', followers: 1, floor: 100 },
    { kind: 'no-data', followers: null, timeframe: null },
    { kind: 'not-connected' },
    { kind: 'reconnect' },
    { kind: 'not-configured' },
    { kind: 'unresolved' },
    { kind: 'unreadable' },
  ]

  it('says yes only to unreadable', () => {
    // Asserted across the WHOLE union rather than the member that came to mind:
    // "reload" cannot add followers, cannot supply a missing environment variable
    // and cannot reconnect an account. Offering it there is the exact defect
    // `e2e/no-impossible-remedy.spec.ts` walks every route to catch.
    expect(EVERY_STATE.filter(mayOfferRetry).map((s) => s.kind)).toEqual(['unreadable'])
  })

  it('covers every member of the union', () => {
    // Without this, adding a ninth state would silently escape the rule above.
    expect(new Set(EVERY_STATE.map((s) => s.kind)).size).toBe(EVERY_STATE.length)
  })
})
