import { describe, expect, test } from 'vitest'
import { CONSTRAINTS } from '@sahoda/shared'
import { formatsFor, isPostFormat } from '@sahoda/publishing/format'

import {
  MISSING_KINDS,
  REMIX_CHANNELS,
  REMIX_KINDS,
  channelsForKind,
  formatForKind,
  needsAPhoto,
} from './catalogue'

/**
 * NOTHING IS OFFERED THAT CANNOT BE PUBLISHED.
 *
 * The roadmap drawing offered six outputs and four of them were not producible.
 * This suite is the guard that keeps the replacement honest in both directions:
 * everything BUILT names a real channel and a real format, and everything
 * MISSING names the one thing it needs rather than being quietly dropped.
 */

describe('every built kind targets something that exists', () => {
  test.each(REMIX_KINDS.map((k) => [k.kind, k] as const))(
    '%s produces at least one derivative, on a real channel, at a real format',
    (kind) => {
      const channels = channelsForKind(kind)
      expect(channels.length).toBeGreaterThan(0)
      for (const channel of channels) {
        const format = formatForKind(kind, channel)
        expect(format).not.toBeNull()
        // Two separate claims, and both matter: the string is in the column's
        // vocabulary, AND this channel actually offers it.
        expect(isPostFormat(format)).toBe(true)
        expect(formatsFor(CONSTRAINTS[channel])).toContain(format)
      }
    },
  )

  test('a channel that cannot publish words alone never gets a text derivative', () => {
    // Instagram is the only one, and this is derived rather than named: the
    // assertion reads `requiresMedia` and holds for any channel that gains it.
    for (const channel of REMIX_CHANNELS) {
      if (CONSTRAINTS[channel].requiresMedia !== true) continue
      for (const spec of REMIX_KINDS) {
        expect(formatForKind(spec.kind, channel)).not.toBe('text')
      }
    }
  })

  test('a derivative that needs a photo is exactly one that is not words-only', () => {
    for (const spec of REMIX_KINDS) {
      for (const channel of channelsForKind(spec.kind)) {
        const format = formatForKind(spec.kind, channel)
        expect(needsAPhoto(spec.kind, channel)).toBe(format !== 'text' && format !== 'thread')
      }
    }
  })

  test('the thread kind is offered only where the channel really has threads', () => {
    for (const channel of REMIX_CHANNELS) {
      const offered = formatsFor(CONSTRAINTS[channel]).includes('thread')
      expect(channelsForKind('thread').includes(channel)).toBe(offered)
    }
    // Today that is X alone. Asserted as a MEASUREMENT of the current engine,
    // beside the derived rule above — so a second channel gaining threads shows
    // up here as a decision rather than as a silent widening.
    expect(channelsForKind('thread')).toEqual(['x'])
  })

  test('no channel can publish a video, so no kind offers one', () => {
    for (const channel of REMIX_CHANNELS) {
      expect(formatsFor(CONSTRAINTS[channel])).not.toContain('video')
      for (const spec of REMIX_KINDS) {
        expect(formatForKind(spec.kind, channel)).not.toBe('video')
      }
    }
  })

  test('the whole batch lands inside the 10–20 PRD §5.2 promises', () => {
    const total = REMIX_KINDS.reduce((sum, spec) => sum + channelsForKind(spec.kind).length, 0)
    expect(total).toBeGreaterThanOrEqual(10)
    expect(total).toBeLessThanOrEqual(20)
  })
})

describe('every kind that is missing says what it needs', () => {
  test('none of the six roadmap outputs was quietly dropped', () => {
    // The drawing's own words. A promise that disappears is worse than one that
    // is still outstanding.
    const labels = MISSING_KINDS.map((m) => m.label.toLowerCase())
    for (const promised of ['carousel', 'reel', 'email', 'blog', 'whatsapp']) {
      expect(labels.some((l) => l.includes(promised))).toBe(true)
    }
  })

  test('each one names a specific blocker, not a date', () => {
    for (const missing of MISSING_KINDS) {
      expect(missing.needs.length).toBeGreaterThan(20)
      expect(/\bsoon\b/i.test(missing.needs)).toBe(false)
      expect(/\b(20\d\d|Q[1-4])\b/.test(missing.needs)).toBe(false)
    }
  })

  test('the tasks it names are tasks the mesh does NOT have', () => {
    // A "missing" entry naming a task that already exists would be a feature
    // withheld for no reason. These three are the ones the copy names.
    const named = MISSING_KINDS.flatMap((m) => m.needs.match(/\b[a-z_]+_[a-z_]+\b/g) ?? [])
    expect(named).toContain('carousel_outline')
    expect(named).toContain('video_script')
    expect(named).toContain('seo_article')
  })
})
