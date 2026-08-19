import { describe, expect, test } from 'vitest'
import type { Channel, VariantPublishStatus } from '@sahoda/shared'

import { SCHEDULE_DELIVERY_WINDOW_MS } from './delivery-window'
import { autoPublishTruth, AUTO_PUBLISH_COPY, AUTO_PUBLISH_COPY_LIVE } from './schedule-status'
import type { VariantStatusRow } from './variant-status'

/**
 * What may honestly be said under a post that carries a time.
 *
 * The rule used to be `posts.status` plus a clock, and a clock cannot answer
 * "did this go out". It said "this time has passed and nothing was published"
 * over four production posts whose own channel chips, two inches above, read
 * "published" — see the `evidence` blocks below, whose inputs are the shapes
 * those rows actually have. Every claim here now has to be backed by
 * `post_variants.publish_status`, and the only thing the clock still decides is
 * which of two things to say when NOTHING has published.
 */

const NOW = new Date('2026-07-25T12:00:00.000Z')

/**
 * Past the DELIVERY WINDOW, not merely past due.
 *
 * This was `11:59` — one minute before `NOW` — and it asserted `overdue`, which
 * PINNED THE DEFECT: publishing runs on a five-minute cron and every measured
 * production delivery landed 73-199 s after its time, so one-minute-past is what
 * a perfectly healthy post looks like. The test was green and the behaviour it
 * protected was wrong. Moved to 30 minutes past, which is late by any reading.
 *
 * Every other use of this constant asserts an evidence-driven verdict (`none`,
 * `partial`, `simulated`) that the clock does not decide, so widening it changes
 * nothing about what those tests mean.
 */
const EARLIER = '2026-07-25T11:30:00.000Z'

/** One minute past due: inside the window, and therefore not late. */
const JUST_PAST = '2026-07-25T11:59:00.000Z'

const LATER = '2026-07-25T12:01:00.000Z'

function row(
  channel: Channel,
  status: VariantPublishStatus,
  overrides: Partial<VariantStatusRow> = {},
): VariantStatusRow {
  return {
    channel,
    status,
    permalink: status === 'published' ? `https://example.test/${channel}` : null,
    platformPostId: status === 'published' ? `pp_${channel}` : null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    gateRefusal: null,
    retryable: false,
    ...overrides,
  }
}

/** A fixture publish: the row says `published`, and no platform ever saw it. */
function fixtureRow(channel: Channel): VariantStatusRow {
  return row(channel, 'published', { simulated: true, permalink: null, platformPostId: null })
}

/** What a genuinely-waiting post looks like — the shape production carries. */
const WAITING = [row('instagram', 'pending')]

describe('posts that make no auto-publish promise', () => {
  test.each(['idea', 'draft', 'review', 'published', 'failed', 'expired'] as const)(
    '%s says nothing, even with a date on it',
    (status) => {
      // A dated draft promises nothing — the date is a plan, not a commitment.
      // Labelling every one of these would train users to ignore the label,
      // which costs us the past-due case that actually matters.
      expect(autoPublishTruth(status, EARLIER, NOW, WAITING)).toBe('none')
    },
  )

  test('an approved post with no date on it says nothing', () => {
    // Approval commits to the CONTENT, not to a time. Nothing on the card
    // implies a publish, so there is no promise here to correct.
    expect(autoPublishTruth('approved', null, NOW, WAITING)).toBe('none')
  })
})

/**
 * `approved` + a date IS the scheduled post of this product.
 *
 * The gate used to read `status === 'scheduled'`, which apps/web never writes —
 * `approvePost` is the one sanctioned status write and it writes `approved`. So
 * the labelling was unreachable and nobody ever saw it. The card renders the
 * date whenever `scheduled_at` is set, so that is where the promise is made.
 * See `schedule-status-reachability.test.ts`, which fails if this drifts back.
 */
describe('an approved post carrying a date — what the app actually writes', () => {
  test('is told it will not post itself', () => {
    expect(autoPublishTruth('approved', LATER, NOW, WAITING)).toBe('awaiting')
  })

  test('gets the stronger claim once its time has passed', () => {
    expect(autoPublishTruth('approved', EARLIER, NOW, WAITING)).toBe('overdue')
  })
})

describe('a scheduled post whose time has not come', () => {
  test('is told it will not post itself', () => {
    expect(autoPublishTruth('scheduled', LATER, NOW, WAITING)).toBe('awaiting')
  })

  test('is told so even without a time — the badge alone makes the promise', () => {
    expect(autoPublishTruth('scheduled', null, NOW, WAITING)).toBe('awaiting')
  })

  test('is not called overdue on an unparseable timestamp', () => {
    // We cannot assert a time has passed when we cannot read the time. The
    // weaker claim is still true, so it is the one we make.
    expect(autoPublishTruth('scheduled', 'whenever', NOW, WAITING)).toBe('awaiting')
  })

  test('is not called overdue on an unreadable clock', () => {
    expect(autoPublishTruth('scheduled', EARLIER, new Date(Number.NaN), WAITING)).toBe('awaiting')
  })

  test('is not called overdue at the exact scheduled instant', () => {
    // Strictly past, matching `staleHoldNote`. A post due this very second has
    // not yet been missed, and claiming otherwise is a race we would lose.
    expect(autoPublishTruth('scheduled', NOW.toISOString(), NOW, WAITING)).toBe('awaiting')
  })
})

/**
 * The delivery window (`delivery-window.ts`). Publishing polls every five
 * minutes, so "past due" and "late" are different facts, and the gap between
 * them is every healthy post's normal life.
 *
 * The old code had no window, so all four of the production deliveries below —
 * the only ones that have ever happened — rendered a warning triangle and
 * "Late · check" while working exactly as designed.
 */
describe('a scheduled post that is past due but still inside the delivery window', () => {
  test('is not called late one minute past its time', () => {
    expect(autoPublishTruth('scheduled', JUST_PAST, NOW, WAITING)).toBe('awaiting')
    expect(autoPublishTruth('approved', JUST_PAST, NOW, WAITING)).toBe('awaiting')
  })

  test('is not called late at any lag production has actually produced', () => {
    // MEASURED from post_publish_logs, every `cron:` delivery: 73, 73, 110, 199s.
    for (const lag of [73, 110, 199]) {
      const due = new Date(NOW.getTime() - lag * 1000).toISOString()
      expect(autoPublishTruth('scheduled', due, NOW, WAITING), `${lag}s late`).toBe('awaiting')
    }
  })

  test('IS called late once the window has passed — the claim still exists', () => {
    // The counter-guard. A window that swallowed the verdict entirely would
    // satisfy every assertion above and leave a genuinely failed post silent.
    const past = new Date(NOW.getTime() - SCHEDULE_DELIVERY_WINDOW_MS - 1000).toISOString()
    expect(autoPublishTruth('scheduled', past, NOW, WAITING)).toBe('overdue')
  })

  test('the window does not override evidence that something published', () => {
    // Evidence outranks the clock in both directions; the window must not have
    // become a second, competing authority on what happened.
    expect(autoPublishTruth('scheduled', JUST_PAST, NOW, [row('instagram', 'published')])).toBe(
      'none',
    )
  })
})

describe('a scheduled post whose time has passed', () => {
  test('gets the stronger claim: it did not happen', () => {
    expect(autoPublishTruth('scheduled', EARLIER, NOW, WAITING)).toBe('overdue')
  })

  test('still gets it long after the fact', () => {
    expect(autoPublishTruth('scheduled', '2020-01-01T00:00:00.000Z', NOW, WAITING)).toBe('overdue')
  })
})

/**
 * ── THE DEFECT THIS FUNCTION WAS CHANGED FOR ────────────────────────────────
 *
 * Four production posts sat at `approved`/`scheduled` with a past date and
 * published variants. The old rule read the post status and the clock, never the
 * variants, and told every one of them "nothing was published — copy it across
 * to post it": an instruction to publish again, printed under chips that already
 * said the channels were done.
 *
 * The inputs below are those rows' real shapes, taken from the `post_variants`
 * query, not invented for the test.
 */
describe('a post that has already published — the reported defect', () => {
  test('is never told nothing was published, however long the date is past', () => {
    const truth = autoPublishTruth('scheduled', '2020-01-01T00:00:00.000Z', NOW, [
      row('instagram', 'published'),
      row('linkedin', 'published'),
    ])
    expect(truth).not.toBe('overdue')
    expect(truth).toBe('none')
  })

  test('live on two channels with a third still waiting reads as partly out', () => {
    expect(
      autoPublishTruth('approved', EARLIER, NOW, [
        row('gbp', 'published'),
        row('x', 'published'),
        row('instagram', 'pending'),
      ]),
    ).toBe('partial')
  })

  test('live on one channel and failed on another is partly out, not missed', () => {
    // `f0a777cf` in production: instagram published live, linkedin failed. The
    // failure is the chips' business; what matters here is that the note may not
    // tell someone to send a post that is already on Instagram.
    expect(
      autoPublishTruth('scheduled', EARLIER, NOW, [
        row('instagram', 'published'),
        row('linkedin', 'failed'),
      ]),
    ).toBe('partial')
  })

  test('a channel that was skipped does not keep a finished post unfinished', () => {
    // `skipped` means the post went out everywhere it was MEANT to — the same
    // reading `publishEvidence` takes, where it counts as neither published nor
    // outstanding. It cannot be something still waiting to send.
    expect(
      autoPublishTruth('approved', EARLIER, NOW, [
        row('x', 'published'),
        row('instagram', 'skipped'),
      ]),
    ).toBe('none')
  })

  test('a claim held right now is not "nothing was published"', () => {
    // `publishing` means a publisher holds the lease as we render. Whether
    // anything published is being decided, not settled.
    expect(autoPublishTruth('scheduled', EARLIER, NOW, [row('instagram', 'publishing')])).toBe(
      'overdue',
    )
  })
})

/**
 * The fixture rail writes `publish_status = 'published'` and a `fixture://`
 * permalink. Every one of the four affected production posts is this case, so it
 * is the one the fix is actually observed on.
 *
 * "Nothing was published" is TRUE of the platforms here and false of the screen,
 * which shows those channels marked published. So the note names the simulation
 * rather than denying the chips beside it.
 */
describe('a post whose only publishes were simulated', () => {
  test('says it was a simulation instead of denying the chips', () => {
    // `65dc1a34` in production: status `scheduled`, instagram + linkedin both
    // published through the fixture rail.
    expect(
      autoPublishTruth('scheduled', '2026-08-08T14:00:33.694Z', NOW, [
        fixtureRow('instagram'),
        fixtureRow('linkedin'),
      ]),
    ).toBe('simulated')
  })

  test('says so for the demo posts too, skipped channel and all', () => {
    // `4236ecc6`: approved, gbp + x fixture-published, instagram skipped.
    expect(
      autoPublishTruth('approved', '2026-07-22T03:30:00.000Z', NOW, [
        fixtureRow('gbp'),
        row('instagram', 'skipped'),
        fixtureRow('x'),
      ]),
    ).toBe('simulated')
  })

  test('says so before its time as well as after — evidence is not a clock', () => {
    expect(autoPublishTruth('scheduled', LATER, NOW, [fixtureRow('instagram')])).toBe('simulated')
  })

  test('a fixture channel beside a live one leaves the post partly out', () => {
    // The live one proves a platform has it; the fixture one proves the other
    // platform does not. Neither fact may erase the other.
    expect(
      autoPublishTruth('scheduled', EARLIER, NOW, [
        row('instagram', 'published'),
        fixtureRow('linkedin'),
      ]),
    ).toBe('partial')
  })
})

describe('when there are no variant rows to read', () => {
  test('the past-due claim degrades to the floor rather than asserting a negative', () => {
    // `listVariantStates` returns an empty map on ANY read failure and `.get()`
    // cannot tell that from a post with no variants. Reading it as proof that
    // nothing published would revive the whole defect during an outage — on
    // every card at once.
    expect(autoPublishTruth('scheduled', EARLIER, NOW, [])).toBe('awaiting')
    expect(autoPublishTruth('approved', '2020-01-01T00:00:00.000Z', NOW, [])).toBe('awaiting')
  })

  test('the promise is still corrected — the note does not go silent', () => {
    expect(autoPublishTruth('scheduled', LATER, NOW, [])).not.toBe('none')
  })
})

describe('the copy itself', () => {
  test('never promises a publish will happen later', () => {
    // "will publish", "will go out", "posting soon" — any future-tense promise
    // here is the same lie in gentler words. Nothing is scheduled to run.
    for (const copy of Object.values(AUTO_PUBLISH_COPY)) {
      expect(copy.note).not.toMatch(/will (publish|post|go out)/i)
      expect(copy.note).toMatch(/auto-publish isn't live yet/i)
    }
  })

  test('says outright that nothing was published, once the time has passed', () => {
    expect(AUTO_PUBLISH_COPY.overdue.note).toMatch(/nothing was published/i)
  })

  test('says nothing of the kind where a channel is already out', () => {
    // The regression guard for the reported defect. `partial` is only ever
    // reached with a LIVE published variant in hand, so any sentence denying a
    // publish — or asking for another one — is false on its face there.
    expect(AUTO_PUBLISH_COPY.partial.note).not.toMatch(/nothing (was |reached)/i)
    expect(AUTO_PUBLISH_COPY_LIVE.partial.note).not.toMatch(/nothing (was |reached)/i)
    expect(AUTO_PUBLISH_COPY.partial.note).not.toMatch(/copy it across/i)
  })

  test('names the simulation rather than claiming nothing was published', () => {
    for (const copy of [AUTO_PUBLISH_COPY.simulated, AUTO_PUBLISH_COPY_LIVE.simulated]) {
      expect(copy.note).toMatch(/simulation/i)
      // The chips beside it say "published". Contradicting them flatly is what
      // sent users to publish a post twice.
      expect(copy.note).not.toMatch(/nothing was published/i)
    }
  })

  test('carries a short form for tight surfaces that still reads as a warning', () => {
    // The week grid has ~14 characters of room. It may abbreviate, but it may
    // not soften into something a user reads as "on track".
    for (const copy of [
      ...Object.values(AUTO_PUBLISH_COPY),
      ...Object.values(AUTO_PUBLISH_COPY_LIVE),
    ]) {
      expect(copy.short.length).toBeLessThanOrEqual(20)
    }
    expect(AUTO_PUBLISH_COPY.overdue.short).toMatch(/not posted/i)
    expect(AUTO_PUBLISH_COPY.simulated.short).toMatch(/simulated/i)
  })
})
