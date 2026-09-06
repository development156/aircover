import { describe, expect, test } from 'vitest'
import { CONSTRAINTS, validateMedia } from '@sahoda/shared'

import { CENTRE, fitInBand, inBand, intersectBands, placeCrop, planCrop } from './crop-geometry'
import { targetFor, targetsFor } from './targets'

const IG = targetFor('instagram', null)
const IG_STORY = targetFor('instagram', 'story')
const X = targetFor('x', null)
const LINKEDIN = targetFor('linkedin', null)
const GBP = targetFor('gbp', null)

describe('what the specs actually declare', () => {
  test('linkedin declares a floor and no aspect rule', () => {
    // RETARGETED 2026-09-03, not relaxed. The claim is unchanged: this file says
    // out loud what each spec declares, so a report can never invent a rule the
    // Constraint Engine does not hold. What changed is the spec. linkedin
    // carried no dimension rule at all, so an image the platform refuses passed
    // every check we make; docs/31 §2.2 gives 552x276 and the engine now holds
    // it. The moment either number moves, this fails and the report is rewritten.
    expect(LINKEDIN.aspect).toBeNull()
    expect(LINKEDIN.minW).toBe(552)
    expect(LINKEDIN.minH).toBe(276)
  })

  test('gbp declares floors but no aspect rule', () => {
    // RETARGETED with the same reasoning: the floor was 250x250, which is below
    // what Google Business Profile actually accepts (docs/31 §2.4, 400x300).
    expect(GBP.aspect).toBeNull()
    expect(GBP.minW).toBe(400)
    expect(GBP.minH).toBe(300)
  })

  test('x declares a 4x4 floor and no aspect rule', () => {
    expect(X.aspect).toBeNull()
    expect(X.minW).toBe(4)
  })

  test('instagram feed declares the measured 0.75-1.91 band', () => {
    expect(IG.aspect).toEqual({ min: 0.75, max: 1.91 })
    expect(IG.minW).toBe(320)
  })

  test("the story format's maxAspect REPLACES the feed band rather than stacking", () => {
    // Stacked, a story could never be satisfied: 9:16 is 0.5625, below the feed
    // floor of 0.75. The override is the whole reason format-rules.ts exists.
    expect(IG_STORY.aspect).toEqual({ min: null, max: 1 })
  })
})

describe('the band comparison matches the engine exactly', () => {
  // The boundary Zernio's own validator settled: 0.7500 in, 0.7490 out.
  test.each([
    [750, 1000, true],
    [749, 1000, false],
    [1910, 1000, true],
    [1911, 1000, false],
  ])('%ix%i in the instagram band -> %s', (width, height, expected) => {
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    expect(inBand(width / height, band)).toBe(expected)

    // …and the engine agrees, which is the point. A band check that drifted from
    // validateMedia would cut a crop the attach then refuses.
    const violations = validateMedia([CONSTRAINTS.instagram], {
      mime: 'image/jpeg',
      bytes: 1000,
      width,
      height,
    })[0]
    const hasAspect = violations?.violations.some((v) => v.code === 'MEDIA_ASPECT') ?? false
    expect(hasAspect).toBe(!expected)
  })
})

describe('fitInBand', () => {
  test('returns the original untouched when it is already in band', () => {
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    expect(fitInBand(1080, 1080, band)).toEqual({ x: 0, y: 0, width: 1080, height: 1080 })
  })

  test('cuts a 9:16 phone photo to the NEAREST edge, not to a square', () => {
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    const fit = fitInBand(1080, 1920, band)
    // 1080 / 0.75 = 1440. Full width kept; only the height is trimmed. A resize
    // to 1080x1080 would throw away 360 more rows for no declared reason.
    expect(fit).toEqual({ x: 0, y: 0, width: 1080, height: 1440 })
  })

  test('cuts an ultra-wide photo down to the upper edge', () => {
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    const fit = fitInBand(4000, 1000, band)
    expect(fit).not.toBeNull()
    expect(fit?.height).toBe(1000)
    expect(fit?.width).toBe(1910)
  })

  test('an odd height that rounds BELOW the floor is corrected, not shipped', () => {
    // round(999 * 0.75) = 749, and 749/999 = 0.74975 — under the floor. The naive
    // implementation returns that and the engine then refuses the crop it asked
    // for. The search has to reject it and pick a verified neighbour.
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    const fit = fitInBand(600, 999, band)
    expect(fit).not.toBeNull()
    expect(fit!.width / fit!.height).toBeGreaterThanOrEqual(0.75)
  })

  test('every result over a wide sweep of sizes verifies against the engine', () => {
    // The property that matters. A crop that is out of band is not a near miss —
    // it is a file the attach refuses, minted by the code that offered to fix it.
    const band = intersectBands([IG])
    if (band === 'empty') throw new Error('unreachable')
    let cropped = 0
    for (let w = 320; w <= 2000; w += 7) {
      for (let h = 320; h <= 2000; h += 11) {
        const fit = fitInBand(w, h, band)
        expect(fit).not.toBeNull()
        const violations = validateMedia([CONSTRAINTS.instagram], {
          mime: 'image/jpeg',
          bytes: 1000,
          width: fit!.width,
          height: fit!.height,
        })[0]
        expect(violations?.violations ?? []).toEqual([])
        expect(fit!.width).toBeLessThanOrEqual(w)
        expect(fit!.height).toBeLessThanOrEqual(h)
        if (fit!.width !== w || fit!.height !== h) cropped += 1
      }
    }
    // Guard against a fit that "passes" by never cropping anything.
    expect(cropped).toBeGreaterThan(1000)
    // 30s, not the 5s default. This is a property sweep over a wide grid of
    // sizes, and it is genuinely CPU-bound. MEASURED 2026-08-27: it took 5224ms
    // inside the full 5,734-test run and tripped the 5000ms default by 224ms.
    // Nothing is weakened - every size in the sweep must still verify.
  }, 30_000)

  test('an unbounded band never crops', () => {
    const band = intersectBands([X, LINKEDIN])
    if (band === 'empty') throw new Error('unreachable')
    expect(fitInBand(4000, 3, band)).toEqual({ x: 0, y: 0, width: 4000, height: 3 })
  })
})

describe('intersectBands', () => {
  test('a channel set with one declared band takes that band', () => {
    expect(intersectBands([IG, X, LINKEDIN, GBP])).toEqual({ lo: 0.75, hi: 1.91 })
  })

  test('no declared band at all is unbounded', () => {
    expect(intersectBands([X, LINKEDIN, GBP])).toEqual({ lo: 0, hi: Number.POSITIVE_INFINITY })
  })

  test('non-overlapping bands are reported, never silently resolved', () => {
    // Not reachable from today's specs — only instagram declares a band — so this
    // is constructed. It is here because the alternative to an honest 'empty' is
    // a crop that satisfies neither channel and is refused by both.
    const conflicting = [
      { ...IG, aspect: { min: 0.75, max: 1.91 } },
      { ...IG, channel: 'x' as const, aspect: { min: 0.1, max: 0.5 } },
    ]
    expect(intersectBands(conflicting)).toBe('empty')
  })
})

describe('placeCrop keeps the subject in frame', () => {
  test('centres on the focal point when the image allows it', () => {
    const rect = placeCrop(1000, 1000, { width: 400, height: 400 }, { x: 0.5, y: 0.5 })
    expect(rect).toEqual({ x: 300, y: 300, width: 400, height: 400 })
  })

  test('a subject at the very top produces a crop flush with the top', () => {
    // The founder's actual complaint: a centre crop cuts heads off. A focal point
    // at the top must not produce a rectangle hanging off the image.
    const rect = placeCrop(1000, 2000, { width: 1000, height: 1333 }, { x: 0.5, y: 0 })
    expect(rect.y).toBe(0)
    expect(rect.x).toBe(0)
  })

  test('a subject at the very bottom lands flush with the bottom', () => {
    const rect = placeCrop(1000, 2000, { width: 1000, height: 1333 }, { x: 0.5, y: 1 })
    expect(rect.y).toBe(2000 - 1333)
  })

  test('a subject at the far LEFT lands flush with the left edge', () => {
    // The horizontal sibling of the two tests above. Written because a mutation
    // that removed the x clamp and left the y clamp alone survived the whole
    // suite: every existing case happened to have an x that clamped to itself.
    // An unclamped x is a negative origin, and sharp refuses to extract one.
    const rect = placeCrop(2000, 1000, { width: 1333, height: 1000 }, { x: 0, y: 0.5 })
    expect(rect.x).toBe(0)
  })

  test('a subject at the far RIGHT lands flush with the right edge', () => {
    const rect = placeCrop(2000, 1000, { width: 1333, height: 1000 }, { x: 1, y: 0.5 })
    expect(rect.x).toBe(2000 - 1333)
  })

  test('every placement over a sweep stays wholly inside the original', () => {
    // The property, not four examples: a rectangle that hangs off the image in
    // ANY direction is one sharp cannot extract.
    for (const focal of [0, 0.13, 0.5, 0.87, 1]) {
      for (const size of [
        { width: 1, height: 1 },
        { width: 999, height: 5 },
        { width: 1000, height: 1000 },
      ]) {
        const rect = placeCrop(1000, 1000, size, { x: focal, y: focal })
        expect(rect.x).toBeGreaterThanOrEqual(0)
        expect(rect.y).toBeGreaterThanOrEqual(0)
        expect(rect.x + rect.width).toBeLessThanOrEqual(1000)
        expect(rect.y + rect.height).toBeLessThanOrEqual(1000)
      }
    }
  })

  test('an unreadable focal point is centred rather than trusted', () => {
    const rect = placeCrop(1000, 1000, { width: 400, height: 400 }, { x: Number.NaN, y: 99 })
    expect(rect).toEqual({ x: 300, y: 600, width: 400, height: 400 })
  })
})

describe('planCrop', () => {
  test('refuses rather than upscaling when the crop would fall under a floor', () => {
    // gbp needs 250x250. A 260x2000 strip cropped into the instagram band keeps
    // its 260 width but nothing can raise it; cropping only ever removes pixels.
    const targets = targetsFor(['instagram', 'gbp'], {})
    const plan = planCrop({ width: 260, height: 2000 }, targets, CENTRE)
    expect(plan.ok).toBe(false)
    if (plan.ok) throw new Error('unreachable')
    expect(plan.reason).toBe('below_floor')
  })

  test('reports no change for a photo that is already right', () => {
    const plan = planCrop({ width: 1080, height: 1080 }, targetsFor(['instagram'], {}), CENTRE)
    expect(plan.ok).toBe(true)
    if (!plan.ok) throw new Error('unreachable')
    expect(plan.changed).toBe(false)
  })

  test('a story takes an upright photo untouched and trims a landscape one', () => {
    const story = targetsFor(['instagram'], { instagram: 'story' })
    const upright = planCrop({ width: 1080, height: 1920 }, story, CENTRE)
    expect(upright.ok && upright.changed).toBe(false)

    const landscape = planCrop({ width: 1920, height: 1080 }, story, CENTRE)
    expect(landscape.ok).toBe(true)
    if (!landscape.ok) throw new Error('unreachable')
    expect(landscape.rect.width / landscape.rect.height).toBeLessThanOrEqual(1)
  })
})
