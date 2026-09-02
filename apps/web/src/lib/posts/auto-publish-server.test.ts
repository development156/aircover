import { afterEach, describe, expect, test, vi } from 'vitest'

import { publishFromCronEnabled } from '@/lib/cron/publish-enabled'
import { autoPublishEnabled, autoPublishGap } from './auto-publish-server'
import { autoPublishCopy, scheduleFieldNote } from './schedule-status'

/**
 * The promise under a scheduled post and the switch the sweep actually reads
 * have to be the same fact.
 *
 * Until 2026-09-02 `autoPublishEnabled()` read `SAHODA_PUBLISH_DISPATCH_MODE`
 * alone and selected "Goes out on its own at this time." The sweep publishes
 * only when `SAHODA_PUBLISH_ENABLED` is ALSO `true` (`publishFromCronEnabled`,
 * the predicate `cron/sweeps/route.ts` calls before building a publisher), and
 * only reaches a platform when `SAHODA_PUBLISH_MODE` is `live` rather than the
 * fixture rail it defaults to. An operator who turned on the dispatcher alone
 * would have every card say "Auto-posts" and nothing go out.
 *
 * The sweep's own predicate is imported rather than restated, so a change to it
 * changes what this file requires.
 */

const FLAGS = [
  'SAHODA_PUBLISH_DISPATCH_MODE',
  'SAHODA_PUBLISH_ENABLED',
  'SAHODA_PUBLISH_MODE',
] as const

function stub(flags: Partial<Record<(typeof FLAGS)[number], string>>): void {
  for (const name of FLAGS) {
    const value = flags[name]
    if (value === undefined) vi.stubEnv(name, '')
    else vi.stubEnv(name, value)
  }
}

/** What the sweep would actually do with these flags: publish to a platform, or not. */
function sweepWouldReachAPlatform(): boolean {
  return (
    process.env.SAHODA_PUBLISH_DISPATCH_MODE === 'on' &&
    publishFromCronEnabled() &&
    process.env.SAHODA_PUBLISH_MODE === 'live'
  )
}

afterEach(() => {
  vi.unstubAllEnvs()
})

const LIVE = /goes out on its own/i

describe('autoPublishEnabled agrees with the sweep', () => {
  const combos: Partial<Record<(typeof FLAGS)[number], string>>[] = []
  for (const dispatch of ['on', 'report', 'off', undefined]) {
    for (const enabled of ['true', 'on', '1', undefined]) {
      for (const mode of ['live', 'fixture', undefined]) {
        combos.push({
          ...(dispatch === undefined ? {} : { SAHODA_PUBLISH_DISPATCH_MODE: dispatch }),
          ...(enabled === undefined ? {} : { SAHODA_PUBLISH_ENABLED: enabled }),
          ...(mode === undefined ? {} : { SAHODA_PUBLISH_MODE: mode }),
        })
      }
    }
  }

  test.each(combos)('%j', (flags) => {
    stub(flags)

    expect(autoPublishEnabled()).toBe(sweepWouldReachAPlatform())
  })

  test('the one combination that is live, is live', () => {
    // Guards the table above against a predicate that is simply always false.
    stub({
      SAHODA_PUBLISH_DISPATCH_MODE: 'on',
      SAHODA_PUBLISH_ENABLED: 'true',
      SAHODA_PUBLISH_MODE: 'live',
    })

    expect(autoPublishEnabled()).toBe(true)
    expect(autoPublishGap()).toBeNull()
  })

  test('the dispatcher alone is not enough, which is the reported defect', () => {
    stub({ SAHODA_PUBLISH_DISPATCH_MODE: 'on' })

    expect(autoPublishEnabled()).toBe(false)
  })
})

describe('which switch is off is named, for whoever is reading the server', () => {
  test('the dispatcher first, because without it nothing is even classified', () => {
    stub({ SAHODA_PUBLISH_ENABLED: 'true', SAHODA_PUBLISH_MODE: 'live' })
    expect(autoPublishGap()).toBe('dispatch')
  })

  test('then the publish permission', () => {
    stub({ SAHODA_PUBLISH_DISPATCH_MODE: 'on', SAHODA_PUBLISH_MODE: 'live' })
    expect(autoPublishGap()).toBe('publish')
  })

  test('then the rail, because a fixture publish reaches no platform', () => {
    stub({ SAHODA_PUBLISH_DISPATCH_MODE: 'on', SAHODA_PUBLISH_ENABLED: 'true' })
    expect(autoPublishGap()).toBe('rail')
    stub({
      SAHODA_PUBLISH_DISPATCH_MODE: 'on',
      SAHODA_PUBLISH_ENABLED: 'true',
      SAHODA_PUBLISH_MODE: 'fixture',
    })
    expect(autoPublishGap()).toBe('rail')
  })
})

describe('the copy the customer reads follows the same fact', () => {
  test('the live promise appears only when the sweep would reach a platform', () => {
    stub({ SAHODA_PUBLISH_DISPATCH_MODE: 'on' })
    const off = autoPublishEnabled()
    expect(off).toBe(false)
    expect(autoPublishCopy(off).awaiting.note).not.toMatch(LIVE)
    expect(scheduleFieldNote(off)).not.toMatch(/goes out on its own|will (publish|post|go out)/i)
    // The off copy is not vaguer than the truth: it says nothing goes out by
    // itself, which is exactly true when any of the three switches is off.
    expect(scheduleFieldNote(off)).toMatch(/doesn't publish it/i)

    stub({
      SAHODA_PUBLISH_DISPATCH_MODE: 'on',
      SAHODA_PUBLISH_ENABLED: 'true',
      SAHODA_PUBLISH_MODE: 'live',
    })
    const on = autoPublishEnabled()
    expect(on).toBe(true)
    expect(autoPublishCopy(on).awaiting.note).toMatch(LIVE)
  })
})
