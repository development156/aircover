import { CONSTRAINTS } from '@sahoda/shared'
import type { Channel, ConstraintViolation } from '@sahoda/shared'
import { describe, expect, test } from 'vitest'

import { decideAttach } from './attach-decision'
import type { AttachCandidate, AttachDecision, ChannelRejection } from './attach-decision'

const MB = 1024 * 1024

const ALL_CHANNELS: readonly Channel[] = ['x', 'gbp', 'linkedin', 'instagram']

/** A plain jpeg every channel takes: right type, 2 MB, comfortably above every minimum. */
const GOOD_JPEG: AttachCandidate = { mime: 'image/jpeg', bytes: 2 * MB, width: 1200, height: 800 }

const GIF: AttachCandidate = { mime: 'image/gif', bytes: 1 * MB, width: 640, height: 480 }

/** Over the 5 MB cap on x/gbp/linkedin, under instagram's 8 MB. */
const SIX_MB_JPEG: AttachCandidate = { mime: 'image/jpeg', bytes: 6 * MB, width: 1200, height: 800 }

/** Over every cap, including instagram's 8 MB. */
const TEN_MB_JPEG: AttachCandidate = {
  mime: 'image/jpeg',
  bytes: 10 * MB,
  width: 1200,
  height: 800,
}

/** Above x's 4×4 minimum, below gbp's 250×250. */
const SMALL_JPEG: AttachCandidate = { mime: 'image/jpeg', bytes: 1 * MB, width: 100, height: 100 }

function channelsOf(rejections: readonly ChannelRejection[]): Channel[] {
  return rejections.map((r) => r.channel)
}

function codesFor(rejections: readonly ChannelRejection[], channel: Channel): string[] {
  return (rejections.find((r) => r.channel === channel)?.violations ?? []).map((v) => v.code)
}

function expectAccepted(decision: AttachDecision): ChannelRejection[] {
  if (!decision.ok) {
    throw new Error(`expected an accepted attach, got: ${decision.message}`)
  }
  return decision.warnings
}

function expectRejected(decision: AttachDecision): {
  rejections: ChannelRejection[]
  message: string
} {
  if (decision.ok) {
    throw new Error('expected a rejected attach, got an accepted one')
  }
  return { rejections: decision.rejections, message: decision.message }
}

describe('decideAttach — what every channel accepts', () => {
  test('accepts a plain jpeg with no warnings when every channel takes it', () => {
    expect(expectAccepted(decideAttach(ALL_CHANNELS, GOOD_JPEG, 0, {}))).toEqual([])
  })
})

describe('decideAttach — some channels object', () => {
  test('accepts a gif for x while warning the channels that will not use it', () => {
    // x lists image/gif; gbp, linkedin and instagram do not. The writer may
    // still want it, so this is an attach with warnings, not a refusal.
    const warnings = expectAccepted(decideAttach(ALL_CHANNELS, GIF, 0, {}))

    expect(channelsOf(warnings).sort()).toEqual(['gbp', 'instagram', 'linkedin'])
    expect(codesFor(warnings, 'gbp')).toContain('MEDIA_TYPE')
  })

  test('accepts a 6 MB jpeg for instagram while warning the 5 MB channels', () => {
    const warnings = expectAccepted(decideAttach(ALL_CHANNELS, SIX_MB_JPEG, 0, {}))

    expect(channelsOf(warnings).sort()).toEqual(['gbp', 'linkedin', 'x'])
    expect(codesFor(warnings, 'x')).toContain('MEDIA_SIZE')
  })

  test('warns gbp about a 100x100 image while x takes it', () => {
    const warnings = expectAccepted(decideAttach(['x', 'gbp'], SMALL_JPEG, 0, {}))

    expect(channelsOf(warnings)).toEqual(['gbp'])
    expect(codesFor(warnings, 'gbp')).toContain('MEDIA_DIMS')
  })
})

describe('decideAttach — no channel can use it', () => {
  test('refuses a file over every channel cap', () => {
    const { rejections } = expectRejected(decideAttach(ALL_CHANNELS, TEN_MB_JPEG, 0, {}))

    expect(channelsOf(rejections).sort()).toEqual(['gbp', 'instagram', 'linkedin', 'x'])
  })

  test('refuses a gif when gbp is the only channel', () => {
    expect(decideAttach(['gbp'], GIF, 0, {}).ok).toBe(false)
  })
})

describe('decideAttach — the per-channel media count', () => {
  test('accepts the file that lands exactly on the limit', () => {
    // gbp allows 1: attaching the first with none existing is at the limit.
    expect(expectAccepted(decideAttach(['gbp'], GOOD_JPEG, 0, {}))).toEqual([])
  })

  test('reports the file that goes one past the limit', () => {
    const { rejections } = expectRejected(decideAttach(['gbp'], GOOD_JPEG, 1, {}))
    const violation = rejections.find((r) => r.channel === 'gbp')?.violations[0]

    expect(violation?.code).toBe('MAX_MEDIA_COUNT')
    expect(violation?.field).toBe('media')
    expect(violation?.message).toBe('gbp allows 1 media items.')
  })

  test('reports the count problem alongside the file problems, not instead of them', () => {
    const { rejections } = expectRejected(decideAttach(['gbp'], GIF, 1, {}))

    expect(codesFor(rejections, 'gbp')).toEqual(['MEDIA_TYPE', 'MAX_MEDIA_COUNT'])
  })
})

describe('decideAttach — nothing selected yet', () => {
  /**
   * Documented choice: an empty channel list accepts. There is no spec to
   * violate, and a post with no channel cannot publish anyway; the editor
   * re-runs this decision when a channel is added.
   */
  test('accepts with no warnings when the post targets no channel yet', () => {
    expect(expectAccepted(decideAttach([], GOOD_JPEG, 0, {}))).toEqual([])
  })

  test('accepts a file no real channel would take when no channel is selected', () => {
    expect(expectAccepted(decideAttach([], TEN_MB_JPEG, 0, {}))).toEqual([])
  })
})

describe('decideAttach — inputs it cannot measure', () => {
  test('refuses a candidate whose byte count is not a real number', () => {
    const { message, rejections } = expectRejected(
      decideAttach(ALL_CHANNELS, { ...GOOD_JPEG, bytes: Number.NaN }, 0, {}),
    )

    expect(rejections).toEqual([])
    expect(message).toMatch(/could not be checked/i)
  })

  test('refuses a zero-byte candidate rather than calling it under every cap', () => {
    expect(decideAttach(ALL_CHANNELS, { ...GOOD_JPEG, bytes: 0 }, 0, {}).ok).toBe(false)
  })

  test('refuses a 0x0 image, which linkedin and instagram check no dimensions for', () => {
    // linkedin/instagram have no imageDims, so a 0x0 file would otherwise pass them.
    expect(CONSTRAINTS.linkedin.imageDims).toBeUndefined()
    expect(
      decideAttach(['linkedin', 'instagram'], { ...GOOD_JPEG, width: 0, height: 0 }, 0, {}).ok,
    ).toBe(false)
  })

  test('refuses an existing count that is not a whole non-negative number', () => {
    expect(decideAttach(['x'], GOOD_JPEG, Number.NaN, {}).ok).toBe(false)
    expect(decideAttach(['x'], GOOD_JPEG, -1, {}).ok).toBe(false)
    expect(decideAttach(['x'], GOOD_JPEG, 1.5, {}).ok).toBe(false)
  })

  /**
   * Each dimension is checked on its own. A sniffer that read one dimension and
   * lost the other yields a half-measured file, and linkedin/instagram — which
   * declare no `imageDims` — would wave it straight through. Asserting only the
   * 0×0 case lets either guard be deleted with the suite still green.
   */
  test('refuses a file whose height alone is unreadable', () => {
    expect(decideAttach(['linkedin', 'instagram'], { ...GOOD_JPEG, height: 0 }, 0, {}).ok).toBe(
      false,
    )
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, height: Number.NaN }, 0, {}).ok).toBe(false)
  })

  test('refuses a file whose width alone is unreadable', () => {
    expect(decideAttach(['linkedin', 'instagram'], { ...GOOD_JPEG, width: 0 }, 0, {}).ok).toBe(
      false,
    )
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, width: Number.NaN }, 0, {}).ok).toBe(false)
  })

  /**
   * A fractional byte count or pixel dimension is not a small file, it is a
   * number that did not come from a real measurement. Under every channel cap it
   * reads as valid, so it has to surface as "cannot check" like NaN does — the
   * same rule the count already enforces (1.5 above).
   */
  test('refuses a byte count that is not a whole number', () => {
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, bytes: 0.5 }, 0, {}).ok).toBe(false)
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, bytes: 1.5 }, 0, {}).ok).toBe(false)
    expect(
      decideAttach(['linkedin'], { ...GOOD_JPEG, bytes: Number.POSITIVE_INFINITY }, 0, {}).ok,
    ).toBe(false)
  })

  test('refuses pixel dimensions that are not whole numbers', () => {
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, width: 100.5 }, 0, {}).ok).toBe(false)
    expect(decideAttach(['linkedin'], { ...GOOD_JPEG, height: 100.5 }, 0, {}).ok).toBe(false)
  })
})

describe('decideAttach — repeated and unknown channels', () => {
  test('reports a duplicated channel once', () => {
    const warnings = expectAccepted(decideAttach(['x', 'gbp', 'gbp'], GIF, 0, {}))

    expect(channelsOf(warnings)).toEqual(['gbp'])
  })

  /** Accepted limitation: a channel with no spec is skipped, not given invented limits. */
  test('ignores a channel it has no spec for instead of inventing limits for it', () => {
    const decision = decideAttach(['tiktok' as Channel], GIF, 0, {})

    expect(expectAccepted(decision)).toEqual([])
  })
})

describe('the rejection message shown to the writer', () => {
  /**
   * `decideAttach` composes its message from violations the frozen engine
   * produced, never from caller-supplied text — `validateMedia` is the only
   * source, and its `message` fields are pre-written user-facing strings. This
   * pins that the composed result stays user-facing and names the channel that
   * objected, so a writer can act on it.
   */
  test('names the objecting channel and the reason, in user-facing words', () => {
    const oversized: AttachCandidate = {
      mime: 'image/png',
      bytes: 20 * MB,
      width: 800,
      height: 800,
    }

    const decision = decideAttach(['gbp'], oversized, 0, {})

    expect(decision.ok).toBe(false)
    if (decision.ok) return
    expect(decision.message).toMatch(/gbp/i)
    expect(decision.message).toMatch(/\bMB\b/)
  })

  test('carries no database, storage or stack internals', () => {
    const decision = decideAttach(
      ['gbp'],
      { mime: 'image/gif', bytes: 1, width: 9, height: 9 },
      0,
      {},
    )

    expect(decision.ok).toBe(false)
    if (decision.ok) return
    for (const leak of [
      'constraint',
      'PGRST',
      'SQLSTATE',
      'at Object.',
      'storage/v1',
      'undefined',
    ]) {
      expect(decision.message.toLowerCase()).not.toContain(leak.toLowerCase())
    }
  })
})

/**
 * ── THE FORMAT IS PART OF THE MEDIA RULE ────────────────────────────────────
 * FSD §3.1 puts media validation at attach time, and this is the ONLY place the
 * pixel dimensions exist — `PublishRequestMedia` carries `storagePath`, `mime`
 * and `bytes` and no width, so an aspect rule written into the publish path
 * would pass forever and read like a guard.
 *
 * WHAT WOULD MAKE THESE WORTHLESS: testing only that a story refuses a landscape
 * photo. That passes against an implementation that refuses landscape
 * everywhere, which would block a perfectly good 1200×800 feed photo. So every
 * test below has a control: the same file, the same channel, a different format.
 */

/** 9:16 (0.56) — the shape a story is, and OUTSIDE Instagram's feed range. */
const NINE_SIXTEEN: AttachCandidate = {
  mime: 'image/jpeg',
  bytes: 1 * MB,
  width: 1080,
  height: 1920,
}
/** 4:5 (0.8) — upright AND inside the feed range. Legal as either. */
const FOUR_FIVE: AttachCandidate = { mime: 'image/jpeg', bytes: 1 * MB, width: 1080, height: 1350 }

describe('decideAttach — the kind of post the version says it is', () => {
  test('THE ONE THAT MATTERS: a 9:16 photo attaches to a story', () => {
    // Instagram's own `aspectRange` is [0.8, 1.91] and 9:16 is 0.56, so the
    // frozen engine refuses this file — correctly, for a FEED post. Stacked, a
    // story would have been unattachable while the message said the upright
    // picture was the wrong shape for an upright format.
    const asFeed = expectRejected(decideAttach(['instagram'], NINE_SIXTEEN, 0, {}))
    expect(codesFor(asFeed.rejections, 'instagram')).toContain('MEDIA_ASPECT')

    expect(
      expectAccepted(decideAttach(['instagram'], NINE_SIXTEEN, 0, { instagram: 'story' })),
    ).toEqual([])
  })

  test('a story still refuses a landscape photo', () => {
    // Replacing the engine's rule must not mean having none.
    const { rejections } = expectRejected(
      decideAttach(['instagram'], GOOD_JPEG, 0, { instagram: 'story' }),
    )
    expect(codesFor(rejections, 'instagram')).toContain('FORMAT_MEDIA_ASPECT')
  })

  test('and the SAME landscape photo is fine on the SAME channel as a feed post', () => {
    // The control separating "the story rule works" from "landscape is blocked
    // everywhere". 1200×800 is 1.5:1, inside Instagram's 0.8–1.91 range.
    expect(
      expectAccepted(decideAttach(['instagram'], GOOD_JPEG, 0, { instagram: 'image' })),
    ).toEqual([])
  })

  test('the override drops ONLY the aspect verdict, never the others', () => {
    // A 100×100 story photo is upright, so the format is content — and it is
    // still under Instagram's 320×320 minimum, which has nothing to do with shape.
    const { rejections } = expectRejected(
      decideAttach(['instagram'], SMALL_JPEG, 0, { instagram: 'story' }),
    )
    expect(codesFor(rejections, 'instagram')).toContain('MEDIA_DIMS')
  })

  test('a version that says one photo refuses the second', () => {
    // One already attached. The channel would take ten; the version said one.
    const { rejections } = expectRejected(
      decideAttach(['instagram'], FOUR_FIVE, 1, { instagram: 'image' }),
    )
    expect(codesFor(rejections, 'instagram')).toContain('MAX_MEDIA_COUNT')
    // Control: as a set, the same second photo is welcome.
    expect(
      expectAccepted(decideAttach(['instagram'], FOUR_FIVE, 1, { instagram: 'carousel' })),
    ).toEqual([])
  })

  test('a set still cannot exceed the CHANNEL’s own cap', () => {
    // A format may narrow a platform limit, never widen it. Instagram takes 10.
    const cap = CONSTRAINTS.instagram.maxMediaCount
    expect(
      expectAccepted(decideAttach(['instagram'], FOUR_FIVE, cap - 1, { instagram: 'carousel' })),
    ).toEqual([])
    const { rejections } = expectRejected(
      decideAttach(['instagram'], FOUR_FIVE, cap, { instagram: 'carousel' }),
    )
    expect(codesFor(rejections, 'instagram')).toContain('MAX_MEDIA_COUNT')
  })

  test('a text-only version takes no photo at all', () => {
    const { rejections } = expectRejected(decideAttach(['x'], GOOD_JPEG, 0, { x: 'text' }))
    expect(codesFor(rejections, 'x')).toContain('MAX_MEDIA_COUNT')
  })

  test('one channel’s format never speaks for another', () => {
    // X says text-only; LinkedIn says one photo. The file is accepted because
    // SOME channel takes it, and X is reported rather than silently ignored.
    const warnings = expectAccepted(
      decideAttach(['x', 'linkedin'], GOOD_JPEG, 0, { x: 'text', linkedin: 'image' }),
    )
    expect(channelsOf(warnings)).toEqual(['x'])
  })

  test('no format stated restores the pre-format behaviour exactly', () => {
    // The reason `{}` is the honest empty value rather than a missing argument.
    expect(expectAccepted(decideAttach(ALL_CHANNELS, GOOD_JPEG, 0, {}))).toEqual([])
    expect(expectAccepted(decideAttach(['instagram'], FOUR_FIVE, 1, {}))).toEqual([])
    expect(expectAccepted(decideAttach(['instagram'], GOOD_JPEG, 0, { instagram: null }))).toEqual(
      [],
    )
  })
})
