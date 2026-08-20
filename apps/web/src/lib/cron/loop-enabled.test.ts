import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { loopCronEnabled } from './loop-enabled'

const KEY = 'SAHODA_LOOP_CRON_MODE'

afterEach(() => {
  delete process.env[KEY]
})

describe('the Loop cron flag', () => {
  it('is OFF when unset — a deploy alone must not start charging anyone', () => {
    // The route it guards spends 20 credits per workspace per week before a
    // person has seen anything, including for workspaces whose owners have
    // never opened the Loop screen.
    expect(loopCronEnabled()).toBe(false)
  })

  it('is on ONLY for the exact string "on"', () => {
    process.env[KEY] = 'on'
    expect(loopCronEnabled()).toBe(true)
  })

  it('leaves a typo OFF — the safe direction for anything that spends money', () => {
    // The opposite rule from SAHODA_METRIC_CAPTURE_MODE next door, which only
    // the literal 'off' disables. That job cannot spend; this one can, and the
    // asymmetry of the two mistakes is what decides the default.
    for (const typo of ['ON', 'On', 'true', 'yes', '1', 'onn', ' on', 'on ']) {
      process.env[KEY] = typo
      expect(loopCronEnabled(), `"${typo}" must not enable the Loop cron`).toBe(false)
    }
  })
})

describe('the Sunday route stops where the feature says it stops', () => {
  const src = readFileSync(
    resolve(import.meta.dirname, '../../app/api/cron/loop/route.ts'),
    'utf8',
  )
  const runner = readFileSync(resolve(import.meta.dirname, 'run-loop.ts'), 'utf8')
  const code = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

  it('cannot reach the create stage', () => {
    // The cron may spend the credits it takes to THINK about a week. Only a
    // person's click, through loop_approve_cost with a JWT this route does not
    // have, causes anything to be written. Asserted structurally rather than
    // argued: neither file mentions the create path at all.
    for (const forbidden of ['runcreatestage', 'loop_approve_cost', 'readapprovedcycleforcreate']) {
      expect(code(src).toLowerCase()).not.toContain(forbidden)
      expect(code(runner).toLowerCase()).not.toContain(forbidden)
    }
  })

  it('cannot publish', () => {
    for (const forbidden of ['publish', 'dispatch', 'runclaimedpublish']) {
      expect(code(src).toLowerCase()).not.toContain(forbidden)
      expect(code(runner).toLowerCase()).not.toContain(forbidden)
    }
  })

  it('runs on the Node runtime and never at build time', () => {
    // Next executes a GET handler with no dynamic API during `next build` —
    // which here would mean starting production cycles, and charging for them,
    // from a build machine.
    expect(code(src)).toContain("export const runtime = 'nodejs'")
    expect(code(src)).toContain("export const dynamic = 'force-dynamic'")
  })

  it('checks authorisation before it does anything else', () => {
    const authAt = code(src).indexOf('isAuthorizedCronRequest')
    const workAt = code(src).indexOf('runScheduledLoopCycles')
    expect(authAt).toBeGreaterThan(-1)
    expect(workAt).toBeGreaterThan(authAt)
  })

  it('only ever opens cycles for workspaces with an unpaused settings row', () => {
    // Opt-in, not opt-out. A workspace that never opened the Loop screen has no
    // loop_settings row and is invisible to this query — which is the whole
    // reason the deploy cannot start charging the database.
    expect(code(runner)).toContain('from loop_settings')
    expect(code(runner)).toContain('where paused = false')
  })
})
