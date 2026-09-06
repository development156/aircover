import { describe, it, expect } from 'vitest'
import { createWithCredits } from '@sahoda/billing'
import { creditCost } from '@sahoda/shared'

import type { DueSource, FinishFetchRequest, RadarDb } from './db'
import { FakeLedger } from './fake-ledger'
import { runRadarPass } from './run'

/**
 * THE WEEKLY PASS, WITH THE LEDGER IN THE LOOP.
 *
 * `charge.test.ts` proves the charge in isolation. This file proves the pass
 * actually routes every source through it, with the real cheap-check deciding
 * what "seen" means: a page that answers with words is a scan and is charged;
 * a page that will not load is a gap and is not. Both sentences are on /radar.
 *
 * The transport for the competitor's page is named (`fetchPage`) so no socket
 * is opened; the provider transport throws if touched, because a website check
 * with no escalation must never reach TinyFish or Apify.
 */

const WS_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const WS_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
const COMPETITOR = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SOURCE = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const PRICE = creditCost('radar_scan')
const MONDAY = () => new Date('2026-08-31T03:40:00Z')

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

function fakeDb(subscribers: Record<string, string[]>) {
  const state = {
    finished: [] as FinishFetchRequest['outcome'][],
    seen: [] as boolean[],
    snapshots: 0,
  }
  const db: RadarDb = {
    dueSources: async () => [source],
    // Never reached: only the manual "Read now" path scopes to a competitor.
    sourcesForCompetitor: async () => [source],
    subscribers: async (sourceId) => subscribers[sourceId] ?? [],
    beginFetch: async () => ({ allowed: true, reservationId: 'res-1', subscriberCount: 1 }),
    finishFetch: async (r) => {
      state.finished.push(r.outcome)
    },
    insertSnapshot: async () => {
      state.snapshots += 1
      return { id: 'snap-1', capturedOn: '2026-08-31' }
    },
    previousSnapshot: async () => null,
    insertChange: async () => {},
    rememberCheck: async (_id, _memory, seen) => {
      state.seen.push(seen)
    },
  }
  return { db, state }
}

function pageTransport(answer: 'loads' | 'refuses' | 'not-found') {
  const state = { calls: 0 }
  const fetchPage = async (): Promise<Response> => {
    state.calls += 1
    if (answer === 'refuses') throw new TypeError('fetch failed')
    if (answer === 'not-found') return new Response('gone', { status: 404 })
    return new Response(PAGE, { status: 200, headers: { 'content-type': 'text/html' } })
  }
  return { state, fetchPage }
}

const providerNeverCalled = (async () => {
  throw new Error('the provider transport must not be reached')
}) as never

describe('the rendered rung, TinyFish', () => {
  it('renders a bot-walled page through the provider transport, records provider tinyfish as free, and charges', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A] })
    const begun: Array<{ provider: string; costBasis: string; estimateMicros: number }> = []
    const recordingDb: RadarDb = {
      ...db,
      beginFetch: async (r) => {
        begun.push({
          provider: r.provider,
          costBasis: r.costBasis,
          estimateMicros: r.estimateMicros,
        })
        return { allowed: true, reservationId: `res-${begun.length}`, subscriberCount: 1 }
      },
    }
    // Our own request is refused with a 403: the one failure a residential render fixes.
    const page = { calls: 0 }
    const fetchPage = async (): Promise<Response> => {
      page.calls += 1
      return new Response('forbidden', { status: 403 })
    }
    // The PROVIDER transport answers as TinyFish Fetch does.
    const provider = { calls: [] as string[] }
    const providerFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      provider.calls.push(url)
      const body = JSON.parse(String(init?.body)) as { urls: string[]; format: string; ttl: number }
      expect(body).toEqual({ urls: ['https://competitor.example/'], format: 'html', ttl: 0 })
      return new Response(JSON.stringify({ results: [{ url: body.urls[0], text: PAGE }] }), {
        status: 200,
      })
    }

    const report = await runRadarPass({
      db: recordingDb,
      fetch: providerFetch as never,
      fetchPage: fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
      tinyfishApiKey: 'tf_test',
    })

    expect(provider.calls).toEqual(['https://api.fetch.tinyfish.ai'])
    expect(report).toMatchObject({ considered: 1, changed: 1, couldNotCheck: 0 })
    expect(report.spendMicros).toEqual({ measured: 0, estimated: 0, free: 0 })
    expect(begun.map((b) => b.provider)).toEqual(['direct', 'tinyfish'])
    expect(begun[1]).toEqual({ provider: 'tinyfish', costBasis: 'free', estimateMicros: 0 })
    expect(state.snapshots).toBe(1)
    expect(ledger.entries('DEBIT').map((d) => d.amount)).toEqual([PRICE])
  })

  it('without the key, the same page is a recorded gap and the provider transport is never touched', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A] })
    const fetchPage = async (): Promise<Response> => new Response('forbidden', { status: 403 })
    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })
    expect(report).toMatchObject({ considered: 1, changed: 0, couldNotCheck: 1 })
    expect(state.snapshots).toBe(0)
    expect(ledger.entries('DEBIT')).toEqual([])
  })
})

describe('runRadarPass charges radar_scan', () => {
  it('debits every subscriber once when the page loads', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20, [WS_B]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A, WS_B] })
    const page = pageTransport('loads')

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    expect(report).toMatchObject({ considered: 1, changed: 1, couldNotCheck: 0 })
    expect(report.credits).toEqual({ debited: 2, unpaid: 0 })
    expect(page.state.calls).toBe(1)
    expect(state.snapshots).toBe(1)
    expect(ledger.entries('DEBIT').map((d) => [d.workspaceId, d.amount])).toEqual([
      [WS_A, PRICE],
      [WS_B, PRICE],
    ])
    // The ref names the week the pass ran in, so the wallet line is traceable.
    expect(ledger.entries('DEBIT')[0]?.objectRef).toBe(`${COMPETITOR}:2026-W36:${WS_A}`)
  })

  it('a page that will not load is skipped and not charged: held, released, recorded as a gap', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A] })
    const page = pageTransport('refuses')

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    expect(report).toMatchObject({ considered: 1, changed: 0, couldNotCheck: 1 })
    expect(report.credits).toEqual({ debited: 0, unpaid: 0 })
    expect(ledger.entries('HOLD')).toHaveLength(1)
    expect(ledger.entries('RELEASE')).toHaveLength(1)
    expect(ledger.entries('DEBIT')).toHaveLength(0)
    expect(await ledger.balance(WS_A)).toEqual({ total: 20, held: 0 })
    // The gap is on record, and the source stays unseen so next week retries it.
    expect(state.finished).toEqual(['could_not_check'])
    expect(state.seen).toEqual([false])
  })

  it('a 404 is a page that will not load too: no charge', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db } = fakeDb({ [SOURCE]: [WS_A] })

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: pageTransport('not-found').fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    expect(report.couldNotCheck).toBe(1)
    expect(ledger.entries('DEBIT')).toHaveLength(0)
    expect(ledger.entries('RELEASE')).toHaveLength(1)
  })

  it('a sole subscriber with no credits: the page is never fetched and the source is reported refused', async () => {
    const ledger = new FakeLedger({ [WS_A]: PRICE - 1 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A] })
    const page = pageTransport('loads')

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    expect(page.state.calls).toBe(0)
    expect(state.snapshots).toBe(0)
    expect(report.refused).toEqual([{ sourceId: SOURCE, reason: 'CREDIT_INSUFFICIENT' }])
    expect(report.credits).toEqual({ debited: 0, unpaid: 1 })
    // Not a gap: nothing was tried, and "we could not read it" would be false.
    expect(report.couldNotCheck).toBe(0)
    expect(ledger.rows).toHaveLength(0)
    /**
     * ⚠ AND THE ATTEMPT IS ON RECORD, WHICH IS THE WHOLE BATCH ⚠
     * `dueSources` orders by the last attempt, and the attempt IS this row. A
     * skipped source that wrote nothing would keep `last_seen_at` NULL and sort
     * first for ever: one empty wallet watching 100 competitors would occupy
     * every weekly batch and no other customer's competitor would be read
     * again. Same starvation the ordering was changed to fix, ordinary cause.
     */
    expect(state.finished).toEqual(['could_not_check'])
    // The source is still unseen, so next week retries it rather than treating
    // an unpaid week as a reading.
    expect(state.seen).toEqual([])
  })

  it('one empty wallet does not cost the other subscriber their read', async () => {
    const ledger = new FakeLedger({ [WS_A]: 0, [WS_B]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A, WS_B] })
    const page = pageTransport('loads')

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: page.fetchPage as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    expect(page.state.calls).toBe(1)
    expect(state.snapshots).toBe(1)
    expect(report.credits).toEqual({ debited: 1, unpaid: 1 })
    expect(ledger.entries('DEBIT').map((d) => d.workspaceId)).toEqual([WS_B])
  })

  it('a 304 is a reading and IS charged: the site answered, it just had not moved', async () => {
    /**
     * The money decision this pins. "One scan per business per week, at 5
     * credits each" names ONE exemption — a page that will not load — and a
     * site that answers 304 has been read: we asked it and it told us nothing
     * moved. Charging only for CHANGES would price a change feed on the
     * competitor's publishing schedule rather than on our reading, and a quiet
     * month would be free while costing the same to run.
     */
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db, state } = fakeDb({ [SOURCE]: [WS_A] })
    const seenBefore: DueSource = { ...source, etag: 'W/"v1"', contentHash: 'abc' }
    db.dueSources = async () => [seenBefore]
    let asked: string | null = null

    const report = await runRadarPass({
      db,
      fetch: providerNeverCalled,
      fetchPage: (async (_url: string, init: RequestInit) => {
        asked = new Headers(init.headers).get('if-none-match')
        return new Response(null, { status: 304 })
      }) as never,
      withCredits: createWithCredits(ledger),
      now: MONDAY,
    })

    // The validator went out, so this really is the conditional-GET rung.
    expect(asked).toBe('W/"v1"')
    expect(report).toMatchObject({ unchanged: 1, changed: 0, couldNotCheck: 0 })
    expect(report.credits).toEqual({ debited: 1, unpaid: 0 })
    expect(ledger.entries('DEBIT').map((d) => [d.workspaceId, d.amount])).toEqual([[WS_A, PRICE]])
    // Seen, so the cadence starts again from tonight.
    expect(state.seen).toEqual([true])
  })

  it('a second pass in the same week charges nobody twice', async () => {
    const ledger = new FakeLedger({ [WS_A]: 20 })
    const { db } = fakeDb({ [SOURCE]: [WS_A] })
    const withCredits = createWithCredits(ledger)
    const run = () =>
      runRadarPass({
        db,
        fetch: providerNeverCalled,
        fetchPage: pageTransport('loads').fetchPage as never,
        withCredits,
        now: MONDAY,
      })

    await run()
    // The fake `dueSources` returns the source again, which the real query
    // would not — this is the stronger case, and the ledger keys still hold.
    await run()

    expect(ledger.entries('DEBIT')).toHaveLength(1)
    expect(await ledger.balance(WS_A)).toEqual({ total: 20 - PRICE, held: 0 })
  })
})
