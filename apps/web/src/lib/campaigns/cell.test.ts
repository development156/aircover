import { describe, it, expect } from 'vitest'
import { toChannelSet, type Channel, type PostStatus } from '@sahoda/shared'

import { campaignRowCells, livePublishCount, type VariantsRead } from './cell'
import type { VariantStatusRow } from '@/lib/posts/variant-status'

/**
 * The grid is the campaign screen's whole argument, so these execute the four
 * cell kinds rather than asserting the mapping table exists.
 *
 * The two that matter most are the pair the absence vocabulary keeps apart:
 * a channel a post never targeted, and a channel whose row could not be read.
 * They must never render the same, and the way that regression arrives is a
 * `catch` that returns an empty map — which is exactly what `listVariantStates`
 * does today. So the unreadable case is executed with a real empty map, proving
 * the arm is reached by the READ STATUS and not by the map's contents.
 */

const POST = 'post-1'

function variantRow(channel: Channel, over: Partial<VariantStatusRow> = {}): VariantStatusRow {
  return {
    channel,
    status: 'pending',
    permalink: null,
    platformPostId: null,
    simulated: false,
    errorMessage: null,
    errorCode: null,
    gateRefusal: null,
    retryable: true,
    ...over,
  }
}

function read(rows: readonly VariantStatusRow[]): VariantsRead {
  return { status: 'ok', byPost: new Map([[POST, rows]]) }
}

function cells(
  status: PostStatus,
  channels: readonly Channel[],
  columns: readonly Channel[],
  variants: VariantsRead,
) {
  // Through `toChannelSet`, never as a bare array: the branded type is what
  // makes the dedupe unskippable, and a test that bypassed it would be
  // exercising a shape the app cannot produce.
  return campaignRowCells({ id: POST, status, channels: toChannelSet(channels) }, columns, variants)
}

describe('a channel the post never targeted has no slot', () => {
  it('is `absent`, not a dash and not an unmeasured mark', () => {
    const out = cells('draft', ['instagram'], ['instagram', 'linkedin'], read([]))
    // eslint-disable-next-line no-console -- print the kinds; the shape IS the claim.
    console.log(
      '[cell] draft targeting instagram only →',
      out.map((c) => `${c.channel}:${c.kind}`),
    )
    expect(out[1]).toEqual({ kind: 'absent', channel: 'linkedin' })
  })

  it('stays `absent` even when the variant read FAILED — no slot cannot be unreadable', () => {
    const out = cells('draft', ['instagram'], ['instagram', 'linkedin'], { status: 'unreadable' })
    expect(out.map((c) => c.kind)).toEqual(['unreadable', 'absent'])
  })
})

describe('a failed read never renders as "no body yet"', () => {
  /**
   * The defect this pins: `listVariantStates` returns an EMPTY MAP on any read
   * failure. If the cell branched on the map's contents rather than on the read
   * status, an outage would report every targeted channel as unwritten — a false
   * claim about the customer's own work, on every cell at once.
   */
  it('an empty map with status ok means unwritten; status unreadable means unreadable', () => {
    const columns: Channel[] = ['instagram', 'linkedin']
    const okButEmpty = cells('draft', ['instagram', 'linkedin'], columns, {
      status: 'ok',
      byPost: new Map(),
    })
    const failedRead = cells('draft', ['instagram', 'linkedin'], columns, { status: 'unreadable' })

    // eslint-disable-next-line no-console -- the two must be visibly different.
    console.log(
      '[cell] empty map →',
      okButEmpty.map((c) => c.kind),
      '· failed read →',
      failedRead.map((c) => c.kind),
    )

    expect(okButEmpty.map((c) => c.kind)).toEqual(['unwritten', 'unwritten'])
    expect(failedRead.map((c) => c.kind)).toEqual(['unreadable', 'unreadable'])
    expect(okButEmpty.map((c) => c.kind)).not.toEqual(failedRead.map((c) => c.kind))
  })
})

describe('per-channel certainty comes from that channel’s rows alone', () => {
  it('one live channel and one pending channel do NOT wear the same signature', () => {
    const out = cells(
      'approved',
      ['instagram', 'linkedin'],
      ['instagram', 'linkedin'],
      read([
        variantRow('instagram', { status: 'published', permalink: 'https://ig.example/p/1' }),
        variantRow('linkedin', { status: 'pending' }),
      ]),
    )
    const signatures = out.map((c) =>
      c.kind === 'variant' ? `${c.channel}:${c.certainty}` : c.kind,
    )
    // eslint-disable-next-line no-console -- run 13 shipped a pass that read "S Sah"; print the words.
    console.log('[cell] one out, one waiting →', signatures)

    expect(out[0]).toMatchObject({ kind: 'variant', certainty: 'real', status: 'published' })
    expect(out[1]).toMatchObject({ kind: 'variant', certainty: 'committed', status: 'pending' })
    expect(signatures[0]).not.toBe(signatures[1])
  })

  it('a fixture publish is `simulated` and carries the required word', () => {
    const out = cells(
      'approved',
      ['x'],
      ['x'],
      read([variantRow('x', { status: 'published', simulated: true })]),
    )
    expect(out[0]).toMatchObject({
      kind: 'variant',
      certainty: 'simulated',
      certaintyLabel: 'Simulated',
    })
  })

  it('a failed channel does not deny the channel that went out', () => {
    const out = cells(
      'approved',
      ['instagram', 'x'],
      ['instagram', 'x'],
      read([
        variantRow('instagram', { status: 'published', permalink: 'https://ig.example/p/2' }),
        variantRow('x', { status: 'failed', errorCode: 'rate_limited' }),
      ]),
    )
    expect(out[0]).toMatchObject({ certainty: 'real' })
    expect(out[1]).toMatchObject({ certainty: 'failed', status: 'failed' })
  })

  it('a draft with a written body is proposed, not committed', () => {
    const out = cells('draft', ['linkedin'], ['linkedin'], read([variantRow('linkedin')]))
    expect(out[0]).toMatchObject({ kind: 'variant', certainty: 'proposed' })
  })
})

describe('the live fraction refuses to report a zero it cannot stand behind', () => {
  it('counts only slots that exist, and only platform-confirmed cells as live', () => {
    const rows = [
      {
        cells: cells(
          'approved',
          ['instagram', 'linkedin'],
          ['instagram', 'linkedin', 'x'],
          read([
            variantRow('instagram', { status: 'published', permalink: 'https://ig.example/p/3' }),
            variantRow('linkedin', { status: 'scheduled' }),
          ]),
        ),
      },
    ]
    const count = livePublishCount(rows)
    // eslint-disable-next-line no-console -- both numbers are real; print both.
    console.log('[cell] live fraction →', JSON.stringify(count))
    // Three columns, but X was never targeted, so the denominator is 2 — not 3.
    expect(count).toEqual({ live: 1, slots: 2 })
  })

  it('returns null — never 0 of 0 — when any cell could not be read', () => {
    const rows = [
      { cells: cells('approved', ['instagram'], ['instagram'], { status: 'unreadable' }) },
    ]
    expect(livePublishCount(rows)).toBeNull()
  })

  it('a simulated publish is NOT counted as live', () => {
    const rows = [
      {
        cells: cells(
          'approved',
          ['x'],
          ['x'],
          read([variantRow('x', { status: 'published', simulated: true })]),
        ),
      },
    ]
    expect(livePublishCount(rows)).toEqual({ live: 0, slots: 1 })
  })
})
