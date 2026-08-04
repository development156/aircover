import { describe, it, expect } from 'vitest'
import {
  DEPLOY_HISTORY_LIMIT,
  SiteDeployHistoryEntrySchema,
  SiteDeployStateSchema,
  appendHistory,
} from './port'
import { FIXED_ISO, entry, failedState, state } from './port-fixtures'

describe('SiteDeployStateSchema — the invented shape for sites.deploy jsonb', () => {
  it('round-trips a live fixture deploy unchanged, because the row is re-read from jsonb', () => {
    const input = state()

    const parsed = SiteDeployStateSchema.parse(JSON.parse(JSON.stringify(input)))

    expect(parsed).toEqual(input)
  })

  it('round-trips a failed cloudflare deploy with a null url and a populated error', () => {
    const input = state({
      deployer: 'cloudflare',
      status: 'failed',
      preview: false,
      url: null,
      scriptName: 'site-acme-chai',
      deployedAt: null,
      error: { code: 'PROVIDER_ERROR', message: 'Cloudflare rejected the upload with HTTP 401.' },
      history: [],
    })

    const parsed = SiteDeployStateSchema.parse(JSON.parse(JSON.stringify(input)))

    expect(parsed).toEqual(input)
    expect(parsed.url).toBeNull()
    expect(parsed.error?.code).toBe('PROVIDER_ERROR')
  })

  it('rejects a history longer than 5, so an unbounded jsonb column cannot grow forever', () => {
    const overflowing = state({
      history: [1, 2, 3, 4, 5, 6].map((n) => entry({ bundleId: `bundle-${n}` })),
    })

    expect(() => SiteDeployStateSchema.parse(overflowing)).toThrow()
  })

  it('accepts exactly 5 history entries, pinning the cap as inclusive', () => {
    const atCap = state({
      history: [1, 2, 3, 4, 5].map((n) => entry({ bundleId: `bundle-${n}` })),
    })

    expect(SiteDeployStateSchema.parse(atCap).history).toHaveLength(5)
  })

  it('rejects a deployer name outside the closed pair, so a typo cannot persist', () => {
    expect(() => SiteDeployStateSchema.parse(state({ deployer: 'netlify' as never }))).toThrow()
  })

  it('rejects a status outside draft/deploying/published mapping, keeping the CHECK honest', () => {
    expect(() => SiteDeployStateSchema.parse(state({ status: 'unpublished' as never }))).toThrow()
  })

  it('rejects a history entry missing preview, because honesty is required not optional', () => {
    const missingPreview = { bundleId: 'b', deployedAt: FIXED_ISO, url: null }

    expect(() => SiteDeployHistoryEntrySchema.parse(missingPreview)).toThrow()
  })

  // Finding 1: the element schema must be pinned THROUGH the state schema. Asserting only on
  // SiteDeployHistoryEntrySchema directly leaves `history: z.array(z.any())` a live mutation.
  it('rejects a NESTED history entry missing preview, pinning the element schema itself', () => {
    const withUnlabelledEntry = {
      ...state(),
      history: [{ bundleId: 'b', deployedAt: FIXED_ISO, url: null }],
    }

    expect(() => SiteDeployStateSchema.parse(withUnlabelledEntry)).toThrow()
  })

  it('rejects a nested history entry whose preview is a string, not a boolean', () => {
    const coercibleLie = { ...state(), history: [{ ...entry(), preview: 'yes' }] }

    expect(() => SiteDeployStateSchema.parse(coercibleLie)).toThrow()
  })

  it('rejects a nested history entry that is not an object at all', () => {
    expect(() => SiteDeployStateSchema.parse({ ...state(), history: ['bundle-1'] })).toThrow()
  })

  // Finding 2: z.object strips unknown keys silently; Task 17 read-modify-writes this column.
  it('rejects an unknown top-level key instead of silently dropping it on read', () => {
    const fromANewerWriter = { ...state(), domain: 'acme.com' }

    expect(() => SiteDeployStateSchema.parse(fromANewerWriter)).toThrow(/unrecognized|domain/i)
  })

  it('rejects an unknown key inside a history entry rather than stripping it', () => {
    const extended = { ...state(), history: [{ ...entry(), rollbackOf: 'bundle-0' }] }

    expect(() => SiteDeployStateSchema.parse(extended)).toThrow()
  })

  it('rejects an unknown key inside error, so a discarded diagnostic cannot go unnoticed', () => {
    const richError = {
      ...state({ status: 'failed', url: null, deployedAt: null }),
      error: { code: 'PROVIDER_ERROR', message: 'HTTP 401.', httpStatus: 401 },
    }

    expect(() => SiteDeployStateSchema.parse(richError)).toThrow()
  })

  // Finding 4: url is persisted and later rendered into an anchor.
  it('rejects a javascript: url, so the scheme cannot reach a renderer from jsonb', () => {
    expect(() => SiteDeployStateSchema.parse(state({ url: 'javascript:alert(1)' }))).toThrow()
  })

  it('rejects a javascript: url nested in a history entry too', () => {
    const poisoned = { ...state(), history: [entry({ url: 'javascript:alert(1)' })] }

    expect(() => SiteDeployStateSchema.parse(poisoned)).toThrow()
  })

  it('accepts the https, http and file schemes the two real deployers emit', () => {
    for (const url of [
      'https://acme.sahoda.site/',
      'http://localhost:3000/',
      'file:///tmp/i.html',
    ]) {
      expect(SiteDeployStateSchema.parse(state({ url })).url).toBe(url)
    }
  })

  it('rejects a url beyond 2048 chars, so an unbounded jsonb string cannot be persisted', () => {
    const overlong = `https://acme.sahoda.site/${'a'.repeat(2048)}`

    expect(() => SiteDeployStateSchema.parse(state({ url: overlong }))).toThrow()
  })

  it('rejects a non-ISO deployedAt, so "banana" can never be rendered as a deploy time', () => {
    expect(() => SiteDeployStateSchema.parse(state({ deployedAt: 'banana' }))).toThrow()
  })

  it('rejects a non-ISO deployedAt inside a history entry', () => {
    const undated = { ...state(), history: [entry({ deployedAt: 'yesterday' })] }

    expect(() => SiteDeployStateSchema.parse(undated)).toThrow()
  })

  // Finding 5: the nullability asymmetry IS the "history is success-only" rule.
  it('keeps history success-only: a null deployedAt is legal on the state, never on an entry', () => {
    // `failedState` carries an error, because the cross-field rules now require one — a
    // failure with a null `error` is rejected by its own test in port-honesty.test.ts.
    expect(SiteDeployStateSchema.parse(failedState()).deployedAt).toBeNull()

    const fabricated = { ...state(), history: [{ ...entry(), deployedAt: null }] }
    expect(() => SiteDeployStateSchema.parse(fabricated)).toThrow()
  })
})

describe('appendHistory — newest first, capped, oldest evicted', () => {
  it('exposes a cap of 5, matching the TSD §8 keep-last-5 promise', () => {
    expect(DEPLOY_HISTORY_LIMIT).toBe(5)
  })

  it('puts the new entry first so readers never need to sort by deployedAt', () => {
    const previous = [entry({ bundleId: 'bundle-old' })]

    const result = appendHistory(previous, entry({ bundleId: 'bundle-new' }))

    expect(result.map((h) => h.bundleId)).toEqual(['bundle-new', 'bundle-old'])
  })

  it('returns a single-entry list when there is no previous history', () => {
    const result = appendHistory([], entry({ bundleId: 'bundle-first' }))

    expect(result.map((h) => h.bundleId)).toEqual(['bundle-first'])
  })

  it('caps at 5 and evicts the OLDEST entry, keeping bundle-6..bundle-2 and dropping bundle-1', () => {
    const previous = [5, 4, 3, 2, 1].map((n) => entry({ bundleId: `bundle-${n}` }))

    const result = appendHistory(previous, entry({ bundleId: 'bundle-6' }))

    expect(result.map((h) => h.bundleId)).toEqual([
      'bundle-6',
      'bundle-5',
      'bundle-4',
      'bundle-3',
      'bundle-2',
    ])
    expect(result.map((h) => h.bundleId)).not.toContain('bundle-1')
  })

  it('never mutates the caller-supplied previous array (immutability rule)', () => {
    const previous = [5, 4, 3, 2, 1].map((n) => entry({ bundleId: `bundle-${n}` }))

    appendHistory(previous, entry({ bundleId: 'bundle-6' }))

    expect(previous.map((h) => h.bundleId)).toEqual([
      'bundle-5',
      'bundle-4',
      'bundle-3',
      'bundle-2',
      'bundle-1',
    ])
  })

  it('produces a history that always satisfies the schema max, however long previous was', () => {
    const previous = [9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => entry({ bundleId: `bundle-${n}` }))

    const result = appendHistory(previous, entry({ bundleId: 'bundle-10' }))

    expect(() => SiteDeployStateSchema.parse(state({ history: result }))).not.toThrow()
  })
})
