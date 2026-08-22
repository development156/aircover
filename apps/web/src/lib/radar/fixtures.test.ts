import { afterEach, describe, expect, test } from 'vitest'

import { fixtureStoreIfAllowed, resetFixtureStore } from './fixtures'

/**
 * PRODUCTION CANNOT REACH THE FIXTURES. ASSERTED, NOT CLAIMED.
 *
 * Fixture data on a customer's Radar would be the worst defect this product
 * could ship: invented claims about named businesses, drawn in the same solid
 * treatment as a real reading. "It is guarded" is the sort of sentence that
 * stays in a comment after the guard has been refactored away, so the guard is
 * executed here with `NODE_ENV` really set to `production`.
 */

const ORIGINAL_ENV = process.env.NODE_ENV
const ORIGINAL_FLAG = process.env.RADAR_FIXTURES

afterEach(() => {
  Object.assign(process.env, { NODE_ENV: ORIGINAL_ENV, RADAR_FIXTURES: ORIGINAL_FLAG })
  resetFixtureStore()
})

describe('the fixture store is double-locked', () => {
  test('production refuses even with the flag explicitly on', () => {
    Object.assign(process.env, { NODE_ENV: 'production', RADAR_FIXTURES: '1' })
    expect(fixtureStoreIfAllowed()).toBeNull()
  })

  test('development refuses without the flag', () => {
    Object.assign(process.env, { NODE_ENV: 'development', RADAR_FIXTURES: undefined })
    expect(fixtureStoreIfAllowed()).toBeNull()
  })

  test('a value other than exactly "1" does not open the lock', () => {
    // `true`, `yes` and `on` all read as opt-in to a human and none of them are.
    Object.assign(process.env, { NODE_ENV: 'development', RADAR_FIXTURES: 'true' })
    expect(fixtureStoreIfAllowed()).toBeNull()
  })

  test('development with the flag returns a store', () => {
    Object.assign(process.env, { NODE_ENV: 'development', RADAR_FIXTURES: '1' })
    expect(fixtureStoreIfAllowed()).not.toBeNull()
  })

  /**
   * THE MEMO CACHES THE STORE, NEVER THE DECISION.
   *
   * Written as `memoized ??= …` around the whole function, a single development
   * call would hand the same store back in production forever after. This is the
   * ordering that would make the test above pass while the property was false.
   */
  test('a store handed out in development is not handed out in production', () => {
    Object.assign(process.env, { NODE_ENV: 'development', RADAR_FIXTURES: '1' })
    expect(fixtureStoreIfAllowed()).not.toBeNull()

    Object.assign(process.env, { NODE_ENV: 'production' })
    expect(fixtureStoreIfAllowed()).toBeNull()
  })

  /** Mutations must survive between calls, or add and remove do nothing. */
  test('the same store is returned across calls, so an addition persists', async () => {
    Object.assign(process.env, { NODE_ENV: 'development', RADAR_FIXTURES: '1' })
    const first = fixtureStoreIfAllowed()
    if (!first) throw new Error('expected a store')
    await first.add('ws-1', { name: 'A Shop', url: 'https://example.com/a', kind: 'website' })

    const second = fixtureStoreIfAllowed()
    if (!second) throw new Error('expected a store')
    const snapshot = await second.read('ws-1')
    expect(snapshot.competitors.map((c) => c.name)).toContain('A Shop')
  })
})
