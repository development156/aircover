import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { holdReaperFromEnv, staleHoldNote } from './balance'

/**
 * THE TEST THAT READS THE OTHER SIDE OF THE SEAM.
 *
 * ── WHAT WENT WRONG, AND WHY NOTHING CAUGHT IT ───────────────────────────────
 * `balance.test.ts` carried a case titled "does not promise a release that
 * nothing in the system performs", with this comment:
 *
 *     Pinned limitation: no expired-hold reaper exists anywhere — nothing reads
 *     hold_expires_at to settle a stalled hold. … If a reaper lands, this test
 *     fails and forces a rewrite of the copy.
 *
 * A reaper landed. `apps/jobs/src/holds/sweep.ts` RELEASEs every unsettled HOLD
 * past its TTL through `apply_ledger_entry`; `apps/web/vercel.json` schedules
 * `/api/cron/sweeps` every five minutes; `api/cron/sweeps/route.ts` calls
 * `sweepExpiredHolds`. The test did not fail, and could not have: it asserted
 * the COPY, and the copy is the half that does not change when a reaper ships.
 *
 * One fact — "do stranded credits come back on their own?" — living in four
 * artifacts, with every existing test reading only the fourth:
 *
 *   1. vercel.json            is the sweep scheduled at all?
 *   2. api/cron/sweeps/route  does the tick call the hold sweep?
 *   3. SAHODA_HOLD_SWEEP_MODE does the sweep write, or only report?
 *   4. lib/wallet/balance.ts  what the customer is told
 *
 * This file reads 1, 2 and 3 as TEXT and asserts they agree with 4. Reading the
 * source rather than importing it is the point: an import would run the same
 * code the copy already runs, and prove nothing about the deployment.
 */

const REPO = join(import.meta.dirname, '../../../../..')
const WEB = join(REPO, 'apps/web')

const read = (rel: string): string => readFileSync(join(REPO, rel), 'utf8')

const NOW = new Date('2026-07-19T12:00:00.000Z')
const EXPIRED = [{ hold_expires_at: '2026-07-19T11:00:00.000Z' }]

describe('artifact 1 — the sweep is scheduled', () => {
  const vercelJson = JSON.parse(readFileSync(join(WEB, 'vercel.json'), 'utf8')) as {
    crons?: Array<{ path?: string; schedule?: string }>
  }

  test('vercel.json schedules /api/cron/sweeps', () => {
    const sweep = (vercelJson.crons ?? []).find((c) => c.path === '/api/cron/sweeps')

    // If this ever goes away the wallet's "not released automatically" becomes
    // true again by itself — which is exactly why the sentence must be derived
    // from the deployment and not written down beside it.
    expect(sweep, 'no /api/cron/sweeps entry in vercel.json').toBeDefined()
    expect(sweep?.schedule).toBeTruthy()
  })
})

describe('artifact 2 — the tick calls the hold sweep', () => {
  const route = read('apps/web/src/app/api/cron/sweeps/route.ts')

  test('the sweeps route invokes sweepExpiredHolds', () => {
    // Read as text on purpose. Importing the route would drag in the whole env
    // proxy and would still only prove the module parses.
    expect(route).toMatch(/sweepExpiredHolds\s*\(/)
  })

  test('the thing it invokes is the one that writes a RELEASE', () => {
    const sweep = read('apps/jobs/src/holds/sweep.ts')

    // A sweep that only reported would leave the old copy true. The literal
    // entry type is what makes this a ledger write rather than a scan.
    expect(sweep).toMatch(/entryType:\s*'RELEASE'/)
    // And it must still be gated by the mode, or artifact 3 below is a fiction.
    expect(sweep).toMatch(/mode/)
  })
})

describe('artifact 3 — the mode reaches apps/web at all', () => {
  test('SAHODA_HOLD_SWEEP_MODE is in the @sahoda/web#build env allowlist', () => {
    const turbo = JSON.parse(read('turbo.json')) as {
      tasks?: Record<string, { env?: string[] }>
    }
    const webBuild = turbo.tasks?.['@sahoda/web#build']?.env ?? []

    // Turbo's strict env mode STRIPS anything not listed, so a variable absent
    // from here reads as undefined in the built app — and `undefined` resolves
    // to 'not-running', which would silently restore the old false sentence on
    // a deployment where the reaper is on.
    expect(webBuild).toContain('SAHODA_HOLD_SWEEP_MODE')
  })

  test('apps/web and apps/jobs agree that only "on" writes', () => {
    const jobsEnv = read('apps/jobs/src/env.ts')

    // apps/jobs owns the vocabulary: readMode returns 'off' for an unset or
    // unrecognised value, and only three modes exist.
    expect(jobsEnv).toMatch(/if \(raw === undefined\) return 'off'/)
    expect(holdReaperFromEnv(undefined)).toBe('not-running')
    expect(holdReaperFromEnv('report')).toBe('not-running')
    expect(holdReaperFromEnv('on')).toBe('running')
  })
})

describe('artifact 4 — what the customer is told matches artifacts 1-3', () => {
  test('the wallet claims an automatic release only when the reaper writes', () => {
    const running = staleHoldNote(EXPIRED, NOW, holdReaperFromEnv('on')) ?? ''
    const off = staleHoldNote(EXPIRED, NOW, holdReaperFromEnv('off')) ?? ''

    expect(running).toMatch(/come back on their own|every few minutes/i)
    expect(off).toMatch(/not released automatically/i)
  })

  test('the sentence is not a literal — no branch of it is hard-coded true', () => {
    const balance = read('apps/web/src/lib/wallet/balance.ts')

    // The regression this exists to stop is someone "simplifying" the two
    // branches back into one string. Both halves must be present in the source,
    // and the parameter that chooses between them must be too.
    expect(balance).toMatch(/not released\s*` \+\s*`?\s*automatically|not released automatically/)
    expect(balance).toMatch(/reaper === 'running'/)
  })
})
