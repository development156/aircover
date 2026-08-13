import type { Channel, VariantPublishStatus } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { outcomeOf, postOutcome, publishEvidence } from './publish-evidence'
import type { VariantStatusRow } from './variant-status'

/**
 * The boundary: what a post ACTUALLY did, from the only table that records it.
 *
 * Every test here is written against the defect that made this module
 * necessary — `posts.status` is stale by design, because the publish path
 * writes `post_variants` and never touches the post row. So the rules under
 * test are about EVIDENCE and its absence, not about a lifecycle column.
 *
 * The direction is the point. Under-claiming is always allowed; over-claiming
 * never is, and neither is over-DENYING — "nothing was published" is a claim
 * too, and it was the one that shipped wrong.
 */

const row = (
  over: Partial<VariantStatusRow> & { status: VariantPublishStatus },
): VariantStatusRow => ({
  channel: 'instagram' as Channel,
  permalink: null,
  platformPostId: null,
  simulated: false,
  errorMessage: null,
  errorCode: null,
  gateRefusal: null,
  retryable: false,
  ...over,
})

const live = () => row({ status: 'published', permalink: 'https://example.test/p/1' })
const fixture = () => row({ status: 'published', simulated: true })

describe('publishEvidence counts what the rows prove', () => {
  test('a live publish and a fixture publish are counted APART, never summed', () => {
    // They support opposite sentences. Folding them together is the one
    // arithmetic mistake that turns a simulation into a claimed publish.
    const evidence = publishEvidence([live(), fixture()])

    expect(evidence.live).toBe(1)
    expect(evidence.simulated).toBe(1)
  })

  test('simulated is READ off the row, never re-derived from the permalink', () => {
    // `variantStatusRow` computes the flag from the `fixture://` permalink and
    // then NULLS that permalink. By the time a row reaches this module the
    // permalink is gone, so anything that re-sniffed it would score every
    // fixture run as live. This row is exactly that shape: simulated, no
    // permalink left to tell.
    const stripped = row({ status: 'published', simulated: true, permalink: null })

    expect(publishEvidence([stripped]).simulated).toBe(1)
    expect(publishEvidence([stripped]).live).toBe(0)
  })

  test('a truthy permalink does not make an unsimulated row live on its own', () => {
    // The inverse guard: `status` decides, not the presence of a URL.
    const pending = row({ status: 'pending', permalink: 'https://example.test/p/9' })

    expect(publishEvidence([pending]).live).toBe(0)
  })

  test('publishing is OUTSTANDING — a claim is being decided as we render', () => {
    expect(publishEvidence([row({ status: 'publishing' })]).outstanding).toBe(1)
  })

  test('skipped is neither published nor outstanding — it was never going', () => {
    const evidence = publishEvidence([row({ status: 'skipped' })])

    expect(evidence.live + evidence.simulated + evidence.outstanding).toBe(0)
    // But it WAS read, which is the difference that matters below.
    expect(evidence.channels).toBe(1)
  })

  test('failed is a subset of outstanding, counted separately', () => {
    const evidence = publishEvidence([row({ status: 'failed' }), row({ status: 'pending' })])

    expect(evidence.outstanding).toBe(2)
    expect(evidence.failed).toBe(1)
  })

  test('channels counts every row read, so an outage is distinguishable from silence', () => {
    expect(publishEvidence([]).channels).toBe(0)
    expect(publishEvidence([row({ status: 'skipped' })]).channels).toBe(1)
  })
})

describe('postOutcome — the honest answer', () => {
  test('NO ROWS is unknown, never "nothing published"', () => {
    // `listVariantStates` returns an empty map on ANY read failure, and `.get()`
    // cannot tell that from a post with no variants. Calling it `none` would let
    // a variant-read outage demote every published post on the page — or, worse,
    // revive the exact "nothing was published" lie this work removed.
    expect(outcomeOf([])).toBe('unknown')
  })

  test('all channels live is the ONLY route to `live`', () => {
    expect(outcomeOf([live(), live()])).toBe('live')
  })

  test('live somewhere and outstanding elsewhere is partial', () => {
    expect(outcomeOf([live(), row({ status: 'pending' })])).toBe('partial')
    expect(outcomeOf([live(), row({ status: 'failed' })])).toBe('partial')
  })

  test('a fixture channel alongside a live one keeps the post partial', () => {
    // The row says published and no platform saw it, so the post is NOT out
    // everywhere it was aimed. Reporting `live` here would claim a destination
    // that was never reached.
    expect(outcomeOf([live(), fixture()])).toBe('partial')
  })

  test('fixture-only is simulated — it does not deny the chips, it names them', () => {
    expect(outcomeOf([fixture(), fixture()])).toBe('simulated')
  })

  test('every channel failed is failed', () => {
    expect(outcomeOf([row({ status: 'failed' }), row({ status: 'failed' })])).toBe('failed')
  })

  test('ONE untried channel among failures is not a failed post', () => {
    // The whole guard on the failed branch. A `pending` channel has not happened
    // yet; writing the post off would report a loss on an attempt nobody made.
    expect(outcomeOf([row({ status: 'failed' }), row({ status: 'pending' })])).toBe('none')
  })

  test('rows that exist but have published nothing are `none`, which is not `unknown`', () => {
    // Known, and genuinely nothing yet — distinct from having read nothing.
    expect(outcomeOf([row({ status: 'pending' })])).toBe('none')
    expect(outcomeOf([row({ status: 'skipped' })])).toBe('none')
  })

  test('a live channel outranks the rest — nothing below may deny it', () => {
    // The ordering rule, stated as a test: whatever else is on the post, a
    // platform holding it can never produce `failed`, `simulated` or `none`.
    const withLive = [
      [live(), row({ status: 'failed' })],
      [live(), fixture()],
      [live(), row({ status: 'skipped' })],
      [live(), row({ status: 'publishing' })],
    ]
    for (const rows of withLive) {
      expect(['live', 'partial']).toContain(outcomeOf(rows))
    }
  })

  test('postOutcome is total — every reachable evidence shape returns an answer', () => {
    const statuses: VariantPublishStatus[] = [
      'pending',
      'scheduled',
      'publishing',
      'published',
      'failed',
      'skipped',
    ]
    for (const a of statuses) {
      for (const b of statuses) {
        for (const simulated of [false, true]) {
          const answer = postOutcome(
            publishEvidence([row({ status: a, simulated }), row({ status: b })]),
          )
          expect(answer, `${a}+${b}/sim=${simulated}`).toBeTruthy()
        }
      }
    }
  })
})
