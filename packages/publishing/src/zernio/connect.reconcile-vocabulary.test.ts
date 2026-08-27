import { describe, expect, it } from 'vitest'

import { reconcileAccounts } from './connect'
import type { ZernioClient } from './client'

/**
 * THE FILTER THAT MADE A SUCCESSFUL CONNECT INVISIBLE.
 *
 * ── WHAT HAPPENED ────────────────────────────────────────────────────────────
 * A customer pressed Connect on X, approved at the platform, and the screen kept
 * saying "Not connected". Reported as "except instagram and linkedin everything
 * else is not getting connected — it opens in popup but its not getting
 * connected on allow".
 *
 * Nothing had failed. MEASURED 2026-08-26 against the live API, minutes after
 * that attempt, `GET /v1/accounts?profileId=6a7efffaf7c78d193906be18`:
 *
 *   { "_id": "6a8f392d77555aae01c20e81",
 *     "platform": "twitter",
 *     "displayName": "DIVAS MAHAPATRA",
 *     "createdAt": "2026-08-26T19:06:21.176Z" }
 *
 * The grant was real, the account existed, and `reconcileAccounts` was asked for
 * `'x'`. `account.platform === 'x'` is false against `'twitter'`, so the account
 * was filtered out, no row was written, and every layer downstream correctly
 * reported that it had found nothing.
 *
 * Instagram and LinkedIn were never affected, and that is the tell: for those two
 * our channel id and Zernio's platform name are the same string. The bug was
 * invisible in exactly the two places anybody had tested.
 *
 * ── WHY THIS TEST USES REAL FIXTURES ─────────────────────────────────────────
 * `twitter` and `googlebusiness` are not invented for the test. They are the
 * values Zernio actually stores, and a test that made up a name would pass
 * against a mapping that is wrong in the same direction as the code.
 */

/** The two fields the filter reads, plus the id it returns. Real values only. */
function account(id: string, platform: string, profileId: string) {
  return { _id: id, platform, profileId, username: null, displayName: null }
}

function clientWith(accounts: ReturnType<typeof account>[]): ZernioClient {
  return {
    listAccounts: () => Promise.resolve(accounts),
  } as unknown as ZernioClient
}

const PROFILE = '6a7efffaf7c78d193906be18'

describe('reconcileAccounts asks in Zernio’s vocabulary', () => {
  it('finds the X account that is stored as "twitter"', async () => {
    // THE REGRESSION. Before the fix this returned [] and the connect vanished.
    const client = clientWith([account('6a8f392d77555aae01c20e81', 'twitter', PROFILE)])

    const found = await reconcileAccounts(client, { profileId: PROFILE, zernioPlatform: 'twitter' })

    expect(found).toHaveLength(1)
    expect(found[0]?.accountId).toBe('6a8f392d77555aae01c20e81')
  })

  it('finds Google Business, stored as "googlebusiness"', async () => {
    const client = clientWith([account('aaaaaaaaaaaaaaaaaaaaaaaa', 'googlebusiness', PROFILE)])

    const found = await reconcileAccounts(client, {
      profileId: PROFILE,
      zernioPlatform: 'googlebusiness',
    })

    expect(found).toHaveLength(1)
  })

  it('still returns nothing for OUR id, which is what the caller must not pass', async () => {
    // The proof that the parameter is Zernio's vocabulary and not ours. If this
    // ever starts returning the account, the function has grown a translation of
    // its own and the caller's translation is now applied twice.
    const client = clientWith([account('6a8f392d77555aae01c20e81', 'twitter', PROFILE)])

    expect(await reconcileAccounts(client, { profileId: PROFILE, zernioPlatform: 'x' })).toEqual([])
    expect(
      await reconcileAccounts(client, { profileId: PROFILE, zernioPlatform: 'gbp' }),
    ).toHaveLength(0)
  })

  it('does not hand back another platform’s account', async () => {
    // The filter still has to filter. A fix that simply stopped filtering would
    // pass the three tests above and write an Instagram row for a Reddit connect.
    const client = clientWith([
      account('1111111111111111aaaaaaaa', 'twitter', PROFILE),
      account('2222222222222222aaaaaaaa', 'instagram', PROFILE),
      account('3333333333333333aaaaaaaa', 'reddit', PROFILE),
    ])

    const found = await reconcileAccounts(client, { profileId: PROFILE, zernioPlatform: 'reddit' })

    expect(found.map((a) => a.accountId)).toEqual(['3333333333333333aaaaaaaa'])
  })

  it('still refuses an account belonging to another profile', async () => {
    // doc 13 §3: Zernio validates an accountId against the whole TEAM, so a
    // scoped query is a weaker guarantee than it sounds. The second filter is
    // the tenant boundary and this change must not have loosened it.
    const client = clientWith([account('4444444444444444aaaaaaaa', 'twitter', 'someone-elses')])

    const found = await reconcileAccounts(client, { profileId: PROFILE, zernioPlatform: 'twitter' })

    expect(found).toEqual([])
  })
})
