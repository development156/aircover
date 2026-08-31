import { afterEach, describe, expect, it } from 'vitest'

import { autopilotEnabled } from './autopilot-enabled'

const KEY = 'SAHODA_AUTOPILOT_ENABLED'

/**
 * The flag's own tests, because until now its 25-line header was the only
 * statement of what it does.
 *
 * This is the switch that decides whether Sahoda may post to a customer's
 * account with nobody watching. Its header argues at length for exact-match and
 * for unrecognised-means-off, and the whole argument was enforced by nothing: a
 * change to `!== 'false'`, or a `.toLowerCase()` added for kindness, would have
 * turned every one of the values below into a yes and no test would have moved.
 */

afterEach(() => {
  delete process.env[KEY]
})

describe('the autopilot flag', () => {
  it('is OFF when unset, so the deploy that adds the route changes nothing', () => {
    expect(autopilotEnabled()).toBe(false)
  })

  it('is on for the exact string "true" and nothing else', () => {
    process.env[KEY] = 'true'
    expect(autopilotEnabled()).toBe(true)
  })

  // Each of these is a value somebody could plausibly type meaning yes. The
  // safe direction for "may Sahoda post unattended" is no, so every one of them
  // is a no. `TRUE` and ` true ` are here because a case-fold or a trim is the
  // most likely well-meant change to this function.
  const NOT_TRUE = ['', ' ', '1', 'on', 'yes', 'y', 'TRUE', 'True', ' true ', 'true\n', 'false']

  it.each(NOT_TRUE)('leaves it off for %j', (value) => {
    process.env[KEY] = value
    expect(autopilotEnabled()).toBe(false)
  })

  it('does not read any of the three flags that already exist', () => {
    // Reusing one of them would widen a permission somebody already gave for
    // something narrower, which is the defect this flag was created to avoid.
    process.env.SAHODA_LOOP_CRON_MODE = 'on'
    process.env.SAHODA_PUBLISH_DISPATCH_MODE = 'on'
    process.env.SAHODA_PUBLISH_ENABLED = 'true'
    try {
      expect(autopilotEnabled()).toBe(false)
    } finally {
      delete process.env.SAHODA_LOOP_CRON_MODE
      delete process.env.SAHODA_PUBLISH_DISPATCH_MODE
      delete process.env.SAHODA_PUBLISH_ENABLED
    }
  })
})
