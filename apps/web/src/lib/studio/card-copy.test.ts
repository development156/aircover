import { describe, expect, test } from 'vitest'

import type { BrandSignal } from '@sahoda/shared'

import {
  describeBuiltFrom,
  describeCount,
  describeFormat,
  describePicture,
  describeStatus,
} from './card-copy'
import { generatableFormats } from './formats'

const confirmed: BrandSignal = { field: 'voice', certainty: 'confirmed', value: 'warm' }
const guessed: BrandSignal = { field: 'colours', certainty: 'guessed', value: 'blue' }

describe('describeStatus', () => {
  /**
   * The fear when a generation fails is having paid for nothing. The hold was
   * released, so saying it is both reassuring and true.
   */
  test('a failure says nothing was charged, because that is the fear', () => {
    expect(describeStatus('failed')).toMatch(/nothing was charged/i)
    expect(describeStatus('cancelled')).toMatch(/nothing was charged/i)
  })

  test('a success says where the picture went', () => {
    expect(describeStatus('ready')).toMatch(/library/i)
  })

  test('waiting and drawing are different, because one has started and one has not', () => {
    expect(describeStatus('queued')).not.toBe(describeStatus('running'))
  })

  test('every status has a sentence, so no card can render a blank', () => {
    for (const status of ['queued', 'running', 'ready', 'failed', 'cancelled'] as const) {
      expect(describeStatus(status).length, status).toBeGreaterThan(0)
    }
  })
})

describe('describeBuiltFrom', () => {
  /**
   * THE ONE THAT MATTERS. Null means conditioning never ran; empty means it ran
   * and used nothing, which is correct for Explore. Collapsing them tells an
   * Explore user their Brand Brain is broken.
   */
  test('never conditioned and deliberately unconditioned are different sentences', () => {
    expect(describeBuiltFrom(null)).not.toBe(describeBuiltFrom([]))
    expect(describeBuiltFrom([])).toMatch(/on purpose/i)
    expect(describeBuiltFrom(null)).not.toMatch(/on purpose/i)
  })

  test('all confirmed says so and mentions no guesses', () => {
    const said = describeBuiltFrom([confirmed])
    expect(said).toMatch(/confirmed/i)
    expect(said).not.toMatch(/guess/i)
  })

  test('all guessed says Sahoda worked it out', () => {
    expect(describeBuiltFrom([guessed])).toMatch(/worked out/i)
  })

  test('a mixture counts both, and the counts are the real ones', () => {
    const said = describeBuiltFrom([confirmed, guessed, guessed])
    expect(said).toContain('1 confirmed')
    expect(said).toContain('2 guessed')
  })

  test('one thing is singular and two are plural, because a person reads it', () => {
    expect(describeBuiltFrom([confirmed])).toContain('1 thing')
    expect(describeBuiltFrom([confirmed, confirmed])).toContain('2 things')
    expect(describeBuiltFrom([guessed])).toContain('1 thing')
  })
})

describe('describePicture', () => {
  test('a picture that loaded needs no sentence at all', () => {
    expect(describePicture({ status: 'ready', hasAsset: true, hasUrl: true })).toBeNull()
  })

  /**
   * Deleting the file is something the person DID. It is a true report, not an
   * error, and the record of how the picture was made survives it.
   */
  test('a deleted file says so, rather than reading as a fault', () => {
    const said = describePicture({ status: 'ready', hasAsset: false, hasUrl: false })
    expect(said).toMatch(/deleted from your library/i)
    expect(said).not.toMatch(/error|failed|wrong/i)
  })

  /** The file exists. Only the link failed, and saying otherwise loses a picture. */
  test('a link that would not sign does not claim the picture is gone', () => {
    const said = describePicture({ status: 'ready', hasAsset: true, hasUrl: false })
    expect(said).toMatch(/in your library/i)
    expect(said).not.toMatch(/deleted/i)
  })

  test('a failed generation says nothing about a picture it never made', () => {
    expect(describePicture({ status: 'failed', hasAsset: false, hasUrl: false })).toBeNull()
  })

  test('the copy carries no em dash, which is the standing ruling for prose', () => {
    const all = [
      describeStatus('failed'),
      describeBuiltFrom([confirmed, guessed]),
      describePicture({ status: 'ready', hasAsset: false, hasUrl: false }),
    ]
    for (const said of all) expect(said ?? '').not.toMatch(/[—–]/)
  })
})

describe('how many pictures a card holds', () => {
  test('says nothing when only one was ever asked for', () => {
    expect(describeCount({ made: 1, asked: 1 })).toBeNull()
    expect(describeCount({ made: 0, asked: 1 })).toBeNull()
  })

  test('a full set of options says so, which is what makes the thumbnails legible', () => {
    expect(describeCount({ made: 4, asked: 4 })).toMatch(/4 options/)
  })

  /**
   * THE ONE THAT MATTERS. Three of four is neither a success nor a failure, and
   * the card is where somebody looks tomorrow when they are trying to work out
   * what they were charged for.
   */
  test('a partial result names both numbers and what happened to the money', () => {
    const said = describeCount({ made: 3, asked: 4 })
    expect(said).toContain('3')
    expect(said).toContain('4')
    expect(said).toMatch(/charged for those and for nothing else/i)
  })

  test('carries no em dash, which is the standing ruling for prose', () => {
    for (const [made, asked] of [
      [1, 1],
      [4, 4],
      [2, 4],
    ] as const) {
      expect(describeCount({ made, asked }) ?? '').not.toMatch(/[—–]/)
    }
  })
})

describe('the size a picture was made at', () => {
  /**
   * `format_id` is `link-card`. Printing it puts an internal identifier on a
   * customer's screen, which is not wrong so much as not addressed to them.
   */
  test('is the label a person reads, never the row’s key', () => {
    const said = describeFormat('link-card')
    expect(said).not.toContain('link-card')
    expect(said).toMatch(/link card/i)
    expect(said).toMatch(/1200 by 628/)
  })

  /**
   * Old rows outlive the list of sizes. A picture made at a size since retired
   * is still a real picture, so the card says nothing about size rather than
   * printing a key nobody can look up.
   */
  test('a size we no longer offer says nothing rather than showing a key', () => {
    expect(describeFormat('a-preset-that-was-retired')).toBeNull()
    expect(describeFormat(null)).toBeNull()
  })

  test('every size the picker offers has a readable label', () => {
    for (const format of generatableFormats()) {
      const said = describeFormat(format.id)
      expect(said, format.id).not.toBeNull()
      expect(said, format.id).not.toContain(format.id)
    }
  })
})
