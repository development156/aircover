import { describe, it, expect } from 'vitest'

import { toSnapshot, readRunCost } from './apify'

/**
 * THE BOUNDARY WHERE A SCRAPER'S ANSWER BECOMES A STORED FACT.
 *
 * Two rules meet here, and both are about the same thing: not inventing a number.
 *
 * 1. A COUNT THE PLATFORM DID NOT GIVE US IS ABSENT, NEVER ZERO. Instagram
 *    withholds counts from some accounts and returns the field missing rather
 *    than 0. `?? 0` at this boundary would turn "they declined to say" into "they
 *    have none", and on a chart those are the same line.
 *
 * 2. A COST WE COULD NOT READ IS NULL, NEVER ZERO. MEASURED 2026-08-22: the run
 *    object returned by `?waitForFinish=` reports `usageTotalUsd: 0` because
 *    pay-per-event charges are accounted after the run terminates. A collector
 *    that believed it would have recorded every social check as free.
 */

describe('a count the platform withheld stays withheld', () => {
  it('omits every metric the actor did not return', () => {
    const snapshot = toSnapshot('rival', { username: 'rival' })
    console.log('  payload for a silent profile:', JSON.stringify(snapshot))
    expect(snapshot).toEqual({ kind: 'social', handle: 'rival', posts: [] })
    // Written as three separate checks because `toEqual` above would also pass if
    // the keys were present and undefined, and `undefined` serialises out of JSON
    // — so the row would look right and the schema would disagree.
    expect('followers' in snapshot).toBe(false)
    expect('following' in snapshot).toBe(false)
    expect('postCount' in snapshot).toBe(false)
  })

  it('keeps a genuine zero, which is a different fact', () => {
    const snapshot = toSnapshot('rival', {
      username: 'rival',
      followersCount: 0,
      postsCount: 0,
    })
    expect(snapshot.followers).toBe(0)
    expect(snapshot.postCount).toBe(0)
  })

  it('drops a post the platform gave no id for, rather than inventing one', () => {
    // The differ compares SETS OF IDS. A fabricated id would be new every day and
    // would report a fresh post every night for ever.
    const snapshot = toSnapshot('rival', {
      username: 'rival',
      latestPosts: [{ caption: 'no id here' }, { shortCode: 'ABC', caption: 'has one' }],
    })
    console.log('  posts kept:', JSON.stringify(snapshot.posts.map((p) => p.id)))
    expect(snapshot.posts).toHaveLength(1)
    expect(snapshot.posts[0]!.id).toBe('ABC')
  })
})

describe('a cost we could not read is not a cost of zero', () => {
  const runResponse = (data: unknown) =>
    ({ ok: true, json: async () => ({ data }) }) as unknown as Response

  it('returns null while the charge has not been accounted yet', async () => {
    // This is the exact body `?waitForFinish=` returns, measured against a run
    // that had in fact just charged $0.0026.
    const cost = await readRunCost('run-1', {
      token: 't',
      fetch: async () => runResponse({ usageTotalUsd: 0, eventUsage: {} }),
    })
    console.log('  cost read from a just-finished run:', cost)
    expect(cost).toBeNull()
  })

  it('reads the per-event total once the run has settled', async () => {
    const cost = await readRunCost('run-1', {
      token: 't',
      fetch: async () =>
        runResponse({
          usageTotalUsd: 0.0026,
          eventUsage: {
            profile: { eventTitle: 'Profile', eventTotalUsd: 0.0026 },
            'about-account': { eventTitle: 'Add-on', eventTotalUsd: 0 },
          },
        }),
    })
    console.log('  cost read from a settled run:', cost, 'micros')
    expect(cost).toBe(2600)
  })

  it('returns null rather than zero when Apify will not answer at all', async () => {
    const cost = await readRunCost('run-1', {
      token: 't',
      fetch: async () => ({ ok: false, status: 500 }) as unknown as Response,
    })
    expect(cost).toBeNull()
  })
})
