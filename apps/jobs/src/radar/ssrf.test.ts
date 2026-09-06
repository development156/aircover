import { describe, it, expect } from 'vitest'
import { createWithCredits } from '@sahoda/billing'

import { FakeLedger } from './fake-ledger'
import { runRadarPass } from './run'
import type { DueSource, RadarDb } from './db'

/**
 * THE DEFAULT HAS TO BE THE SAFE ONE.
 *
 * The defect this file pins was not a missing check — it was a missing DECISION.
 * `scripts/radar-pass.ts` handed `globalThis.fetch` to the pass and nothing in
 * the type system, the tests or the review had an opinion about that, so a
 * competitor row reading `http://169.254.169.254/latest/meta-data/` was fetched
 * from our own server, nightly, with the redirect chain resolved inside undici.
 *
 * So this asserts the thing a reviewer cannot see by reading: a pass constructed
 * with NO page transport named refuses a private address. If the default ever
 * goes back to the global fetch, these fail — which is the only way a default is
 * actually pinned.
 *
 * No network is reached on any path here. The guard refuses at the address, before
 * a socket exists, which is exactly why the assertion can be deterministic.
 */

/**
 * ⚠ THE FIXTURE TRAP THIS FILE WALKED INTO FIRST ⚠
 * The first draft used full URLs as locators and every case "passed" — because
 * `checkWebsite` builds `https://${locator}/`, so `https://x/` became
 * `https://https://x//`, whose host is the word `https`, which resolves to
 * nothing. Six refusals earned by a malformed URL, none of them by the guard.
 *
 * A locator is a BARE HOST: `app.radar_normalize_locator` strips the scheme,
 * the path, the port and the userinfo before the row is written. So these are
 * bare hosts, which is what `dueSources` actually returns — and each is one the
 * DB normaliser accepts today, because its domain pattern is
 * `[a-z0-9-]` labels separated by dots and `169.254.169.254` satisfies it.
 */
const HOSTILE: ReadonlyArray<readonly [string, string]> = [
  ['the AWS/GCP metadata endpoint', '169.254.169.254'],
  ['loopback', '127.0.0.1'],
  ['loopback, another octet', '127.1.1.1'],
  ['RFC1918 ten', '10.0.0.1'],
  ['RFC1918 one-nine-two', '192.168.1.1'],
  ['RFC1918 one-seven-two', '172.16.0.1'],
  ['carrier-grade NAT', '100.64.0.1'],
  ['this-network', '0.0.0.0'],
]

/** The one workspace watching every hostile source below. */
const WATCHER = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

function sourceFor(locator: string): DueSource {
  return {
    sourceId: 'src-1',
    competitorId: 'comp-1',
    kind: 'website',
    locator,
    cadence: 'daily',
    etag: null,
    lastModified: null,
    contentHash: null,
    lastSeenAt: null,
  }
}

/** Records every write, so "nothing was stored" is counted rather than assumed. */
function spyDb(source: DueSource) {
  const calls = {
    snapshots: 0,
    changes: 0,
    finished: [] as string[],
    /** WHY the check failed, which is the only thing that separates a refusal
     *  from a connection that merely did not answer. */
    why: [] as unknown[],
  }
  const db: RadarDb = {
    dueSources: async () => [source],
    // Never reached: only the manual "Read now" path scopes to a competitor.
    sourcesForCompetitor: async () => [source],
    // A real watcher, so a refused address is also proved to be a refused
    // CHARGE. A source nobody subscribes to would never reach the ledger and
    // the "nothing was billed" half of this file would be vacuous.
    subscribers: async () => [WATCHER],
    beginFetch: async () => ({ allowed: true, reservationId: 'res-1', subscriberCount: 1 }),
    finishFetch: async (r) => {
      calls.finished.push(r.outcome)
      calls.why.push(r.detail.why)
    },
    insertSnapshot: async () => {
      calls.snapshots += 1
      return { id: 'snap-1', capturedOn: '2026-08-23' }
    },
    previousSnapshot: async () => null,
    insertChange: async () => {
      calls.changes += 1
    },
    rememberCheck: async () => {},
  }
  return { db, calls }
}

describe('the nightly pass, with no page transport named', () => {
  for (const [name, locator] of HOSTILE) {
    it(`refuses ${name} and stores nothing: ${locator}`, async () => {
      const { db, calls } = spyDb(sourceFor(locator))
      const neverCalled = (async () => {
        throw new Error('the provider transport must not be reached for a website check')
      }) as never
      const ledger = new FakeLedger({ [WATCHER]: 100 })

      const report = await runRadarPass({
        db,
        fetch: neverCalled,
        withCredits: createWithCredits(ledger),
      })

      // AND NOBODY PAID FOR IT. The hold is taken before the read and released
      // when the read sees nothing, so an address we refuse to look at costs the
      // customer nothing — the same sentence /radar prints about a page that
      // will not load.
      expect(ledger.entries('DEBIT')).toHaveLength(0)
      expect(await ledger.balance(WATCHER)).toEqual({ total: 100, held: 0 })

      expect(report.couldNotCheck).toBe(1)
      expect(report.changed).toBe(0)
      expect(calls.snapshots).toBe(0)
      expect(calls.changes).toBe(0)
      // The refusal is recorded as a GAP, never as "nothing happened".
      expect(calls.finished).toEqual(['could_not_check'])
      /**
       * ⚠ THE ASSERTION THAT MAKES THIS TEST WORTH ANYTHING ⚠
       * Counting `could_not_check` is NOT enough, and a mutation run proved it:
       * with the raw global fetch restored as the default, `https://10.0.0.1/`
       * still fails — the connection is refused or times out — and every
       * assertion above still passed. The suite reported a guard that was not
       * there. `UnsafeUrlError` is thrown by `assertPublicUrl` BEFORE a socket
       * exists, so this is the one observation that distinguishes "we refused
       * to look" from "we looked and it did not answer".
       */
      expect(calls.why).toEqual(['transport: UnsafeUrlError'])
    })
  }

  it('uses the caller transport when one IS named, so the default is the only silent path', async () => {
    const { db, calls } = spyDb(sourceFor('competitor.example'))
    const seen: string[] = []
    const report = await runRadarPass({
      db,
      withCredits: createWithCredits(new FakeLedger({ [WATCHER]: 100 })),
      fetch: (async () => {
        throw new Error('provider transport must not be reached')
      }) as never,
      // A transport that answers, so only the guard above it can refuse hop two.
      fetchPage: (async (url: string) => {
        seen.push(url)
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      }) as never,
    })

    // fetchPage is named here, so this proves the CALLER's own transport is used —
    // and that a caller supplying a naive one is the only way back to the defect.
    expect(seen).toEqual(['https://competitor.example/'])
    expect(report.changed).toBe(0)
    expect(calls.snapshots).toBe(0)
  })
})
