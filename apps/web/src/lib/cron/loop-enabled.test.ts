import { describe, it, expect, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { assess, type LoopFacts } from '@/lib/loop/eligibility'

import { loopCronEnabled } from './loop-enabled'

const KEY = 'SAHODA_LOOP_CRON_MODE'

/** A workspace that would otherwise be planned for; each call breaks one thing. */
function facts(over: Partial<LoopFacts> = {}): LoopFacts {
  return {
    workspaceId: 'ws-1',
    settings: { paused: false, weeklyBudgetCredits: 150 },
    connections: [{ platform: 'instagram', status: 'active' }],
    availableCredits: 1260,
    planningWeek: { isoYear: 2026, isoWeek: 35 },
    openCycle: null,
    dial: [{ channel: 'instagram', level: 1 }],
    ...over,
  }
}

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
  const src = readFileSync(resolve(import.meta.dirname, '../../app/api/cron/loop/route.ts'), 'utf8')
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
    // Opt-in, not opt-out: a workspace that never opened the Loop screen must not
    // be charged by the deploy that adds the schedule.
    //
    // ── THIS USED TO GREP THE RUNNER'S SQL, AND THAT WAS THE WEAKER TEST ─────
    // It asserted the source contained `from loop_settings` and
    // `where paused = false`. That pinned one SPELLING of the rule, and it could
    // not tell whether the query was used, ignored, or overridden three lines
    // later. When the query correctly became a LEFT JOIN from `workspaces` — so
    // the cron could SAY why a workspace is skipped instead of silently not
    // seeing it — this test went red on a change that strengthened the very
    // guarantee it exists to protect.
    //
    // The guarantee is behavioural, so it is asserted behaviourally, against the
    // function that now makes the decision.
    expect(assess(facts({ settings: null })).eligible).toBe(false)
    expect(assess(facts({ settings: { paused: true, weeklyBudgetCredits: 150 } })).eligible).toBe(
      false,
    )
    // And the two are DIFFERENT answers, which is the point of the rewrite.
    const never = assess(facts({ settings: null }))
    const paused = assess(facts({ settings: { paused: true, weeklyBudgetCredits: 150 } }))
    expect(never.eligible === false && never.reason).toBe('never_enabled')
    expect(paused.eligible === false && paused.reason).toBe('paused')
  })

  it('reaches no paid work without a verdict', () => {
    // The structural half the behavioural test cannot cover: nothing may call
    // `planOneWorkspace` before `assess` has answered for that workspace.
    const assessAt = code(runner).indexOf('assess(facts)')
    const planAt = code(runner).indexOf('await planOneWorkspace(')
    expect(assessAt).toBeGreaterThan(-1)
    expect(planAt).toBeGreaterThan(assessAt)
  })
})
