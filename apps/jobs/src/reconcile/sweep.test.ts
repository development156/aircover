import { describe, it, expect, vi } from 'vitest'
import { ZernioError } from '@sahoda/publishing'

import { ZernioNotProvisionedError } from './failures'
import {
  runReconcileSweep,
  type ConnectionToCheck,
  type ReconcileSweepDeps,
  type UnresolvedPublish,
} from './sweep'

/**
 * The batch the production cron actually passes (`RECONCILE_BATCH = 15` in
 * apps/web's cron route); `DEFAULT_LIMIT` in deps.ts is 25. Both are per-QUEUE
 * caps, so a full tick is up to 15 connections AND up to 15 publishes. The
 * suite uses 25 because that is the number the sweep was asked about.
 */
const BATCH = 25

const connection = (n: number): ConnectionToCheck => ({
  connectionId: `c-${n}`,
  workspaceId: `ws-${n}`,
  profileId: `p-${n}`,
  accountId: `a-${n}`,
  platform: 'instagram',
})

const publish = (n: number): UnresolvedPublish => ({
  variantId: `v-${n}`,
  workspaceId: `ws-${n}`,
  postId: `post-${n}`,
  channel: 'instagram',
  providerPostId: `0123456789abcdef0123456${n % 10}`,
})

const zernioError = (status: number, code: string): ZernioError =>
  new ZernioError({
    // A message that would be catastrophic in a public response body, so any test
    // asserting the body is clean has something real to catch.
    message: 'postgres://sahoda:hunter2@db.rloztdhzfliyvpvxsgjl.supabase.co:5432/postgres',
    status,
    code,
    type: 'api_error',
    rateLimit: { limit: null, remaining: null, reset: null },
  })

function deps(overrides: Partial<ReconcileSweepDeps> = {}): ReconcileSweepDeps {
  return {
    mode: 'on',
    listConnectionsToCheck: vi.fn(async () => []),
    listUnresolvedPublishes: vi.fn(async () => []),
    readAccounts: vi.fn(async () => []),
    readPublish: vi.fn(async () => ({ kind: 'pending' }) as const),
    applyAccountFacts: vi.fn(async () => {}),
    applyResolution: vi.fn(async () => {}),
    ...overrides,
  }
}

/** Every connection read throws, and every publish read throws. Nothing survives. */
function allFailing(overrides: Partial<ReconcileSweepDeps> = {}): ReconcileSweepDeps {
  return deps({
    listConnectionsToCheck: async () => Array.from({ length: BATCH }, (_, i) => connection(i)),
    listUnresolvedPublishes: async () => Array.from({ length: BATCH }, (_, i) => publish(i)),
    readAccounts: async () => {
      throw zernioError(500, 'INTERNAL_ERROR')
    },
    readPublish: async () => {
      throw zernioError(429, 'RATE_LIMITED')
    },
    ...overrides,
  })
}

describe('runReconcileSweep — the mode gate', () => {
  it('reads nothing at all when off', async () => {
    const listConnectionsToCheck = vi.fn(async () => [connection(1)])
    const listUnresolvedPublishes = vi.fn(async () => [publish(1)])

    const report = await runReconcileSweep(
      deps({ mode: 'off', listConnectionsToCheck, listUnresolvedPublishes }),
    )

    expect(listConnectionsToCheck).not.toHaveBeenCalled()
    expect(listUnresolvedPublishes).not.toHaveBeenCalled()
    expect(report.mode).toBe('off')
    expect(report.outcome).toBe('clean')
  })

  it('counts what it WOULD write in report mode rather than claiming it wrote it', async () => {
    const applyAccountFacts = vi.fn(async () => {})
    const applyResolution = vi.fn(async () => {})

    const report = await runReconcileSweep(
      deps({
        mode: 'report',
        applyAccountFacts,
        applyResolution,
        listConnectionsToCheck: async () => [connection(1)],
        listUnresolvedPublishes: async () => [publish(1)],
        readAccounts: async () => [
          {
            accountId: 'a-1',
            needsReconnection: false,
            platformStatus: 'ok',
            tokenExpiresAt: '2026-10-01T00:00:00.000Z',
          },
        ],
        readPublish: async () => ({
          kind: 'published',
          permalink: 'https://x/1',
          platformPostId: '9',
        }),
      }),
    )

    expect(applyAccountFacts).not.toHaveBeenCalled()
    expect(applyResolution).not.toHaveBeenCalled()
    // Nothing was written, so nothing may be counted as written.
    expect(report.connectionsUpdated).toBe(0)
    expect(report.publishesResolved).toBe(0)
    // What it would have done is still reported, so a dry run predicts `on`.
    expect(report.wouldUpdate).toBe(1)
    expect(report.wouldResolve).toBe(1)
  })
})

describe('runReconcileSweep — a pass where every item fails', () => {
  it('is reported as failed, not as a clean pass', async () => {
    const report = await runReconcileSweep(allFailing())

    expect(report.outcome).toBe('failed')
    expect(report.connectionsChecked).toBe(BATCH)
    expect(report.publishesChecked).toBe(BATCH)
  })

  it('is distinguishable from a pass that found nothing to do', async () => {
    const failed = await runReconcileSweep(allFailing())
    const noop = await runReconcileSweep(deps())

    expect(noop.outcome).toBe('clean')
    expect(noop.failures).toEqual([])
    expect(failed.outcome).not.toBe(noop.outcome)
  })

  it('names the cause of each failure instead of discarding it', async () => {
    const report = await runReconcileSweep(allFailing())

    expect(report.failures).toEqual([
      { scope: 'connection', stage: 'read', code: 'INTERNAL_ERROR', status: 500, count: BATCH },
      { scope: 'publish', stage: 'read', code: 'RATE_LIMITED', status: 429, count: BATCH },
    ])
  })

  it('separates which half of the pass failed', async () => {
    const report = await runReconcileSweep(
      allFailing({
        readAccounts: async () => [],
      }),
    )

    // A profile that lists no accounts is a real signal, not a failure.
    expect(report.connectionsFailed).toBe(0)
    expect(report.publishesFailed).toBe(BATCH)
    expect(report.outcome).toBe('degraded')
  })

  it('hands the raw cause to onFailure so the caller can log what the body cannot say', async () => {
    const onFailure = vi.fn()

    await runReconcileSweep(allFailing({ onFailure }))

    expect(onFailure).toHaveBeenCalledTimes(BATCH * 2)
    const first = onFailure.mock.calls[0]![0]
    expect(first.scope).toBe('connection')
    expect(first.stage).toBe('read')
    expect(first.error).toBeInstanceOf(ZernioError)
  })

  it('keeps the sweep running — a poison row does not strand the rest of the batch', async () => {
    let call = 0
    const report = await runReconcileSweep(
      allFailing({
        readAccounts: async () => {
          call += 1
          if (call === 1) throw zernioError(500, 'INTERNAL_ERROR')
          return []
        },
      }),
    )

    expect(report.connectionsChecked).toBe(BATCH)
    expect(report.connectionsFailed).toBe(1)
  })
})

describe('runReconcileSweep — what a public response body may carry', () => {
  it('never carries an error message, a host or an id', async () => {
    const report = await runReconcileSweep(allFailing())
    const body = JSON.stringify(report)

    expect(body).not.toContain('supabase.co')
    expect(body).not.toContain('hunter2')
    expect(body).not.toContain('postgres://')
    // No row identifiers either: the body crosses a public URL.
    expect(body).not.toContain('ws-1')
    expect(body).not.toContain('c-1')
    expect(body).not.toContain('v-1')
  })

  it('refuses a provider error code that is not a short token', async () => {
    const report = await runReconcileSweep(
      allFailing({
        readAccounts: async () => {
          throw zernioError(400, 'connect ECONNREFUSED db.rloztdhzfliyvpvxsgjl.supabase.co:5432')
        },
      }),
    )

    expect(report.failures[0]!.code).toBe('zernio-error')
  })

  it('names an unprovisioned rail as itself rather than as an unknown fault', async () => {
    const report = await runReconcileSweep(
      allFailing({
        readAccounts: async () => {
          throw new ZernioNotProvisionedError()
        },
      }),
    )

    expect(report.failures[0]).toMatchObject({ code: 'not-provisioned', status: null })
  })

  it('classifies a failure to write our own row as a write, not as a platform fault', async () => {
    const report = await runReconcileSweep(
      deps({
        listConnectionsToCheck: async () => [connection(1)],
        readAccounts: async () => [
          {
            accountId: 'a-1',
            needsReconnection: false,
            platformStatus: 'ok',
            tokenExpiresAt: null,
          },
        ],
        applyAccountFacts: async () => {
          throw new Error('deadlock detected on relation connections')
        },
      }),
    )

    expect(report.failures).toEqual([
      { scope: 'connection', stage: 'write', code: 'write-failed', status: null, count: 1 },
    ])
  })
})
