import { describe, expect, test } from 'vitest'
import { CONSTRAINTS, MESH_TASK_ACTION } from '@sahoda/shared'
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
    // A "missing" entry whose blocker is a task the mesh already runs would be
    // a feature withheld for no reason. `MESH_TASK_ACTION` is keyed by every
    // task the mesh can run, so membership there IS "the mesh has it". The
    // three names are the ones the drawing's outputs would need.
    const blockers = MISSING_KINDS.flatMap((m) => (m.meshTask ? [m.meshTask] : []))
    expect(blockers).toEqual(
      expect.arrayContaining(['carousel_outline', 'video_script', 'seo_article']),
    )
    for (const task of blockers) {
      expect(Object.keys(MESH_TASK_ACTION)).not.toContain(task)
    }
  })
})

describe('what the customer reads under "What Remix cannot make yet"', () => {
  /** The sentence the reader gets: the page prefixes every `needs` with "Needs ". */
  const rendered = MISSING_KINDS.map((m) => `Needs ${m.needs}`)

  test('no dash inside a sentence', () => {
    for (const sentence of rendered) expect(sentence).not.toMatch(/—|–/)
  })

  test('names nothing from the repository: no task names, no files, no mesh', () => {
    for (const sentence of rendered) {
      expect(sentence).not.toMatch(/\b[a-z]+_[a-z_]+\b/)
      expect(sentence).not.toMatch(/mesh|pricing\.config|\bmime\b|derivative|pipeline/i)
    }
  })

  test('reads as one or more full sentences after the page\'s "Needs "', () => {
    for (const missing of MISSING_KINDS) {
      // "Needs A carousel needs…" is a stitched sentence. A proper noun
      // (WhatsApp, Sahoda) after "Needs " is not.
      expect(missing.needs).not.toMatch(/^(A|An|The|It|This|There)\b/)
      expect(missing.needs).toMatch(/\.$/)
    }
  })

  test('Sahoda speaks in the third person', () => {
    for (const sentence of rendered) expect(sentence).not.toMatch(/\b(I|we|our|us)\b/)
  })
})
