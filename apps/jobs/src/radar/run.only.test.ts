import { describe, it, expect } from 'vitest'
import { createWithCredits } from '@sahoda/billing'
import { creditCost } from '@sahoda/shared'

import type { DueSource, RadarDb } from './db'
import { FakeLedger } from './fake-ledger'
import { runRadarPass } from './run'

/**
 * "READ NOW" — the same pass, scoped to one competitor and one payer.
 *
 * ── THE THREE PROPERTIES THIS FILE EXISTS FOR, AND WHY EACH IS MONEY ────────
 *   1. A COMPETITOR THE CALLER DOES NOT WATCH IS NEVER READ. The list comes
 *      from `sourcesForCompetitor`, joined to the subscription, and the
 *      subscriber filter is a second refusal on top of it. Both are asserted,
 *      because either alone is one deletion away from a free fetch on a
 *      stranger's watch list.
 *   2. ONLY THE CALLER PAYS. A source is shared. Charging six subscribers
 *      because one of them pressed a button takes five people's credits for a
 *      scan they did not ask for.
 *   3. AN EMPTY SUBSCRIBER LIST IS A SKIP, NOT A FREE PASS. `chargeSubscribers`
 *      runs the read when nobody is subscribed — correct for the weekly pass,
 *      where the spending gate's own NO_SUBSCRIBERS refusal is the record — so
 *      the manual path must `continue` BEFORE it, never hand it an empty array.
 *      That is the mutation this file was proved against: deleting the
 *      `continue` in `run.ts` makes `refuses to read a competitor this
 *      workspace does not watch` fail with the page fetched once.
 */

const WS_MINE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WS_NEIGHBOUR = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const COMPETITOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SOURCE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PRICE = creditCost('radar_scan')

const source: DueSource = {
  sourceId: SOURCE,
  competitorId: COMPETITOR,
  kind: 'website',
  locator: 'competitor.example',
  cadence: 'weekly',
  etag: null,
  lastModified: null,
  contentHash: null,
  lastSeenAt: null,
}

const PAGE = `<html><title>Rival</title><body>${'A real page with enough words to pass the thin-page check. '.repeat(5)}</body></html>`

/**
 * A registry where `dueSources` returns NOTHING.
 *
 * Deliberate: the weekly queue is cadence-relative, and a source read an hour
 * ago is exactly the one a person presses the button for. If the manual path
 * ever falls back to `dueSources` this fake reads as "nothing to do" and every
 * assertion below fails loudly rather than passing on the wrong list.
 */
function fakeDb(subscribers: string[]) {
  const state = { scoped: [] as Array<{ competitorId: string; workspaceId: string }>, due: 0 }
  const db: RadarDb = {
    dueSources: async () => {
      state.due += 1
      return []
    },
    sourcesForCompetitor: async (competitorId, workspaceId) => {
      state.scoped.push({ competitorId, workspaceId })
      return competitorId === COMPETITOR && subscribers.includes(workspaceId) ? [source] : []
    },
    subscribers: async () => subscribers,
    beginFetch: async () => ({ allowed: true, reservationId: 'res-1', subscriberCount: 1 }),
    finishFetch: async () => {},
    insertSnapshot: async () => ({ id: 'snap-1', capturedOn: '2026-09-06' }),
    previousSnapshot: async () => null,
    insertChange: async () => {},
    rememberCheck: async () => {},
  }
  return { db, state }
}

function pageTransport() {
  const state = { calls: 0 }
  const fetchPage = async (): Promise<Response> => {
    state.calls += 1
    return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } })
  }
  return { state, fetchPage }
}

const providerNeverCalled = (async () => {
  throw new Error('the provider transport must not be reached')
}) as never

describe('a manual read is scoped to one competitor and one payer', () => {
  it('reads the competitor now and charges the caller once', async () => {
    const ledger = new FakeLedger({ [WS_MINE]: 50 })
    const { db, state } = fakeDb([WS_MINE])
    const page = pageTransport()

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      only: { competitorId: COMPETITOR, workspaceId: WS_MINE },
    })

    expect(state.scoped).toEqual([{ competitorId: COMPETITOR, workspaceId: WS_MINE }])
    // The cadence queue is not consulted at all: a person pressing the button is
    // asking to bypass exactly that.
    expect(state.due).toBe(0)
    expect(page.state.calls).toBe(1)
    expect(report.considered).toBe(1)
    expect(report.credits.debited).toBe(1)
    expect(ledger.entries('DEBIT', WS_MINE)).toHaveLength(1)
    expect(ledger.entries('DEBIT', WS_MINE)[0]?.amount).toBe(PRICE)
  })

  it('charges the caller only, never the neighbours watching the same business', async () => {
    const ledger = new FakeLedger({ [WS_MINE]: 50, [WS_NEIGHBOUR]: 50 })
    const { db } = fakeDb([WS_MINE, WS_NEIGHBOUR])
    const page = pageTransport()

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      only: { competitorId: COMPETITOR, workspaceId: WS_MINE },
    })

    expect(report.credits.debited).toBe(1)
    expect(ledger.entries('DEBIT', WS_MINE)).toHaveLength(1)
    // Untouched. The neighbour did not press anything, and a HOLD alone would
    // still have taken their spendable balance.
    expect(ledger.entries('HOLD', WS_NEIGHBOUR)).toHaveLength(0)
    expect(ledger.entries('DEBIT', WS_NEIGHBOUR)).toHaveLength(0)
  })

  it('refuses to read a competitor this workspace does not watch, and fetches nothing', async () => {
    const ledger = new FakeLedger({ [WS_MINE]: 50 })
    // The source exists and the NEIGHBOUR watches it. The caller does not.
    const { db } = fakeDb([WS_NEIGHBOUR])
    const page = pageTransport()
    const scopedDb: RadarDb = {
      ...db,
      // The scoping query is bypassed on purpose, so this test proves the
      // SUBSCRIBER filter rather than re-proving the SQL join. Both refusals
      // have to hold; a single one is a deletion away from a free fetch.
      sourcesForCompetitor: async () => [source],
    }

    const report = await runRadarPass({
      db: scopedDb,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      only: { competitorId: COMPETITOR, workspaceId: WS_MINE },
    })

    expect(page.state.calls).toBe(0)
    expect(report.credits.debited).toBe(0)
    expect(report.refused).toEqual([{ sourceId: SOURCE, reason: 'NOT_SUBSCRIBED' }])
    expect(ledger.rows).toEqual([])
  })

  it('a wallet too short to pay refuses the read rather than reading for free', async () => {
    const ledger = new FakeLedger({ [WS_MINE]: 0 })
    const { db } = fakeDb([WS_MINE])
    const page = pageTransport()

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      only: { competitorId: COMPETITOR, workspaceId: WS_MINE },
    })

    expect(page.state.calls).toBe(0)
    expect(report.credits.debited).toBe(0)
    expect(report.credits.unpaid).toBe(1)
    expect(report.refused).toEqual([{ sourceId: SOURCE, reason: 'CREDIT_INSUFFICIENT' }])
  })

  it('leaves the weekly pass alone: no `only` still reads the cadence queue', async () => {
    const ledger = new FakeLedger({ [WS_MINE]: 50 })
    const { db, state } = fakeDb([WS_MINE])

    await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: (async () => new Response(PAGE, { status: 200 })) as never,
      withCredits: createWithCredits(ledger),
    })

    expect(state.due).toBe(1)
    expect(state.scoped).toEqual([])
  })
})
