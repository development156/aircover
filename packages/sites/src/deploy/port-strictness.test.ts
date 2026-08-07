import { describe, it, expect } from 'vitest'
import { SiteDeployHistoryEntrySchema, SiteDeployStateSchema } from './port'
import { FIXED_ISO, LOCAL_URL, entry, failedState, state } from './port-fixtures'

/**
 * `sites.deploy` is jsonb, so every value these schemas see arrives through `JSON.parse`.
 * `JSON.parse` is the ONLY way `__proto__` becomes an own enumerable key, and it is exactly
 * the path this column takes — so the reproduction has to go through it rather than through
 * an object literal, where `__proto__` sets the prototype instead.
 */
const withRawKey = (value: unknown, key: string, json: string): unknown =>
  JSON.parse(JSON.stringify(value).replace(/}$/, `,${JSON.stringify(key)}:${json}}`))

describe('the __proto__ hole strictObject cannot see', () => {
  it('makes __proto__ an OWN key, which is why strictObject alone was not enough', () => {
    const raw = withRawKey(state(), '__proto__', '{"KEEPME":1}')

    expect(Object.prototype.hasOwnProperty.call(raw, '__proto__')).toBe(true)
    expect(Object.keys(raw as object)).toContain('__proto__')
  })

  it('rejects a top-level __proto__ instead of dropping it silently on read', () => {
    const raw = withRawKey(state(), '__proto__', '{"KEEPME":1}')

    expect(() => SiteDeployStateSchema.parse(raw)).toThrow(/__proto__/)
  })

  it('rejects __proto__ whatever its VALUE is, since the key is the defect, not the payload', () => {
    for (const json of ['{"KEEPME":1}', '"a string"', 'null', '0', 'false', '[]']) {
      expect(() => SiteDeployStateSchema.parse(withRawKey(state(), '__proto__', json))).toThrow(
        /__proto__/,
      )
    }
  })

  it('rejects __proto__ nested inside a history entry, not only at the top level', () => {
    const raw = JSON.parse(
      JSON.stringify(state({ history: [entry()] })).replace(
        '"preview":true}]',
        '"preview":true,"__proto__":{"KEEPME":1}}]',
      ),
    )

    expect(() => SiteDeployStateSchema.parse(raw)).toThrow(/__proto__/)
  })

  it('rejects __proto__ nested inside the error object, the third object in the column', () => {
    const raw = JSON.parse(
      JSON.stringify(failedState()).replace('HTTP 401."}', 'HTTP 401.","__proto__":{"KEEPME":1}}'),
    )

    expect(() => SiteDeployStateSchema.parse(raw)).toThrow(/__proto__/)
  })

  it('rejects __proto__ on the history entry schema used directly', () => {
    const raw = withRawKey(entry(), '__proto__', '{"KEEPME":1}')

    expect(() => SiteDeployHistoryEntrySchema.parse(raw)).toThrow(/__proto__/)
  })

  // Sibling shapes: every other prototype-flavoured name is ALREADY caught by strictObject.
  // Pinned so the __proto__ guard cannot be "fixed" by narrowing unknown-key detection.
  it('still rejects the other prototype-flavoured keys as unrecognized', () => {
    for (const key of [
      'constructor',
      'prototype',
      'toString',
      'hasOwnProperty',
      '__defineGetter__',
    ]) {
      expect(() => SiteDeployStateSchema.parse(withRawKey(state(), key, '1')), key).toThrow()
    }
  })

  it('accepts a clean jsonb round-trip, so the guard rejects the key and nothing else', () => {
    const clean = JSON.parse(JSON.stringify(state()))

    expect(SiteDeployStateSchema.parse(clean)).toEqual(state())
  })
})

describe('every free string in the column is bounded, not just url', () => {
  const OVER = 'a'.repeat(2049)
  const AT_CAP = 'a'.repeat(2048)

  it('rejects an overlong scriptName, the sibling of url on the same object', () => {
    expect(() => SiteDeployStateSchema.parse(state({ scriptName: OVER }))).toThrow()
  })

  it('rejects an overlong bundleId', () => {
    expect(() => SiteDeployStateSchema.parse(state({ bundleId: OVER }))).toThrow()
  })

  it('rejects an overlong error.message', () => {
    const long = failedState({ error: { code: 'PROVIDER_ERROR', message: OVER } })

    expect(() => SiteDeployStateSchema.parse(long)).toThrow()
  })

  it('rejects an overlong error.code, the field beside the message', () => {
    const long = failedState({ error: { code: OVER, message: 'HTTP 401.' } })

    expect(() => SiteDeployStateSchema.parse(long)).toThrow()
  })

  it('rejects an overlong bundleId INSIDE a history entry, the nested sibling', () => {
    const long = state({ history: [entry({ bundleId: OVER })] })

    expect(() => SiteDeployStateSchema.parse(long)).toThrow()
  })

  it('accepts every one of them at exactly 2048, pinning the cap as inclusive', () => {
    expect(SiteDeployStateSchema.parse(state({ scriptName: AT_CAP })).scriptName).toBe(AT_CAP)
    expect(SiteDeployStateSchema.parse(state({ bundleId: AT_CAP })).bundleId).toBe(AT_CAP)
    expect(
      SiteDeployStateSchema.parse(failedState({ error: { code: 'X', message: AT_CAP } })).error
        ?.message,
    ).toBe(AT_CAP)
    expect(
      SiteDeployStateSchema.parse(state({ history: [entry({ bundleId: AT_CAP })] })).history[0]
        ?.bundleId,
    ).toBe(AT_CAP)
  })
})

describe('the url length cap is pinned on BOTH sides of 2048', () => {
  const urlOfLength = (length: number): string => `https://a.b/${'c'.repeat(length - 12)}`

  it('accepts a url of exactly 2048 characters', () => {
    const exact = urlOfLength(2048)

    expect(exact).toHaveLength(2048)
    expect(SiteDeployStateSchema.parse(state({ url: exact })).url).toBe(exact)
  })

  it('rejects a url of exactly 2049 characters, so an off-by-one cannot survive', () => {
    const overByOne = urlOfLength(2049)

    expect(overByOne).toHaveLength(2049)
    expect(() => SiteDeployStateSchema.parse(state({ url: overByOne }))).toThrow()
  })

  it('applies the same boundary to a history entry url', () => {
    expect(() =>
      SiteDeployStateSchema.parse(state({ history: [entry({ url: urlOfLength(2049) })] })),
    ).toThrow()
    expect(() =>
      SiteDeployStateSchema.parse(state({ history: [entry({ url: urlOfLength(2048) })] })),
    ).not.toThrow()
  })
})

describe('cross-field honesty: status and its evidence must agree', () => {
  it("rejects a 'failed' status with no error, an unexplained failure", () => {
    expect(() => SiteDeployStateSchema.parse(failedState({ error: null }))).toThrow(/error/)
  })

  it("rejects a 'pending' status advertising a live url", () => {
    const lying = state({ status: 'pending', url: 'https://acme.sahoda.site/', deployedAt: null })

    expect(() => SiteDeployStateSchema.parse(lying)).toThrow(/url/)
  })

  it("rejects a 'live' status with no url, the lie fixture.ts refuses to construct", () => {
    expect(() => SiteDeployStateSchema.parse(state({ url: null }))).toThrow(/url/)
  })

  it("rejects a 'failed' status still carrying a url", () => {
    expect(() => SiteDeployStateSchema.parse(failedState({ url: LOCAL_URL }))).toThrow(/url/)
  })

  it("rejects a fabricated deployedAt on a 'failed' deploy", () => {
    expect(() => SiteDeployStateSchema.parse(failedState({ deployedAt: FIXED_ISO }))).toThrow(
      /deployedAt/,
    )
  })

  it("rejects a fabricated deployedAt on a 'pending' deploy", () => {
    const lying = state({ status: 'pending', url: null, deployedAt: FIXED_ISO, error: null })

    expect(() => SiteDeployStateSchema.parse(lying)).toThrow(/deployedAt/)
  })

  it("rejects a 'live' status with no deployedAt", () => {
    expect(() => SiteDeployStateSchema.parse(state({ deployedAt: null }))).toThrow(/deployedAt/)
  })

  it("rejects an error attached to a 'live' deploy that worked", () => {
    const lying = state({ error: { code: 'PROVIDER_ERROR', message: 'HTTP 401.' } })

    expect(() => SiteDeployStateSchema.parse(lying)).toThrow(/error/)
  })

  it("rejects an error attached to a 'pending' deploy, which should be 'failed'", () => {
    const lying = state({
      status: 'pending',
      url: null,
      deployedAt: null,
      error: { code: 'PROVIDER_ERROR', message: 'HTTP 401.' },
    })

    expect(() => SiteDeployStateSchema.parse(lying)).toThrow(/error/)
  })

  it('accepts the three honest shapes: live, pending and failed', () => {
    const pending = state({ status: 'pending', url: null, deployedAt: null, history: [] })

    expect(SiteDeployStateSchema.parse(state()).status).toBe('live')
    expect(SiteDeployStateSchema.parse(pending).status).toBe('pending')
    expect(SiteDeployStateSchema.parse(failedState()).status).toBe('failed')
  })

  it('rejects a file:// url labelled preview: false, a public claim about a local path', () => {
    expect(() => SiteDeployStateSchema.parse(state({ preview: false }))).toThrow(/preview/)
  })

  it('rejects the same lie inside a history entry, the sibling object', () => {
    const lying = state({ history: [entry({ preview: false })] })

    expect(() => SiteDeployStateSchema.parse(lying)).toThrow(/preview/)
    expect(() => SiteDeployHistoryEntrySchema.parse(entry({ preview: false }))).toThrow(/preview/)
  })

  it('still allows preview: false for a real https url, which understates nothing', () => {
    const published = state({ url: 'https://acme.sahoda.site/', preview: false, history: [] })

    expect(SiteDeployStateSchema.parse(published).preview).toBe(false)
  })
})
