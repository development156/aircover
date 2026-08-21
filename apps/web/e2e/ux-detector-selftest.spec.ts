import { expect, test } from '@playwright/test'

import { DETECTORS } from './helpers/ux-detect'

/**
 * THE DETECTORS ARE SHOWN A KNOWN-GOOD AND A KNOWN-BAD BEFORE THEY ARE BELIEVED.
 *
 * A peer's contrast detector produced eight "invisible text" findings that were
 * its own clamping artefact — the very signature it was hunting. That is not a
 * bug in a regex, it is what happens when a measuring instrument is never
 * calibrated. Every detector this lane relies on is calibrated here, against a
 * synthetic page whose right answer is arithmetic rather than opinion.
 *
 * This runs without a server and without an account: `about:blank` plus
 * `setContent`. It is fast, it is deterministic, and if it fails, NOTHING
 * downstream of it may be reported.
 *
 * Not tagged `@smoke` only because the whole ux lane is out of the gate; it is
 * cheap enough to be in it if the lane is ever kept.
 */

const FIXTURE = `
<!doctype html><html><head><style>
  :root { --brand: var(--p); --p: #ff6600; }
  body { margin: 0; background: #ffffff; font: 13px system-ui; }
  .brandfill { background: var(--brand); width: 120px; height: 30px; }
  .tiny-brand { background: #ff6600; width: 10px; height: 2px; }
  .invisible { color: #ffffff; background: #ffffff; }
  .black-on-white { color: #000000; background: #ffffff; }
  .grey-on-white { color: #8c8c8c; background: #ffffff; }
  .on-image { color: #ffffff; background-image: linear-gradient(#fff, #fff); }
  .pointer { cursor: pointer; }
  .tall { height: 48px; display: block; }
  .short { height: 20px; display: block; }
</style></head><body>
  <h1>The one heading</h1>
  <h2>A section</h2>

  <!-- BRAND FILL: exactly one countable fill, plus one deliberately too small -->
  <button class="brandfill pointer">Do the thing</button>
  <div class="tiny-brand"></div>

  <!-- CONTRAST: one truly invisible, two clearly fine, one unknowable -->
  <p class="invisible">white on white</p>
  <p class="black-on-white">black on white</p>
  <p class="grey-on-white">grey on white</p>
  <p class="on-image">white on a gradient</p>

  <!-- CURSORS: one correct, one arrow, one disabled (must NOT count) -->
  <button class="pointer tall">Has a pointer</button>
  <button class="tall" id="arrow">Has an arrow</button>
  <button class="tall" disabled>Disabled, not a finding</button>

  <!-- NAMES: one named, one unnamed, one aria-hidden (must NOT count) -->
  <button class="pointer tall" aria-label="Named by aria">&nbsp;</button>
  <button class="pointer tall" id="nameless"></button>
  <button class="pointer tall" aria-hidden="true"></button>

  <!-- DEAD END -->
  <button disabled>Coming soon</button>

  <!-- OVERFLOW: one element wider than the viewport -->
  <div style="width: 3000px; height: 4px; background: #eee"></div>

  <!-- TOUCH: one under 44px that is not inside a paragraph -->
  <a class="short" href="#x">Short link</a>
</body></html>`

test.describe('ux detector self-test', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 800, height: 600 })
    await page.setContent(FIXTURE)
  })

  test('brand fills resolve through an alias token and ignore hairlines', async ({ page }) => {
    const r = (await page.evaluate(DETECTORS.brandFills)) as {
      resolved: string | null
      count: number
      items: { text: string }[]
    }
    // THE bug this catches: `--brand: var(--p)` can come back as the literal
    // text `var(--p)`, which matches no element and reports a clean screen.
    expect(r.resolved).toBe('rgb(255, 102, 0)')
    expect(r.count).toBe(1)
    expect(r.items[0]?.text).toBe('Do the thing')
  })

  test('contrast: white-on-white is caught, black-on-white is not, a gradient is skipped', async ({
    page,
  }) => {
    const r = (await page.evaluate(DETECTORS.invisibleText)) as {
      checked: number
      skipped: number
      count: number
      items: { text: string; ratio: number }[]
    }
    const texts = r.items.map((i) => i.text)
    expect(texts).toContain('white on white')
    expect(texts).not.toContain('black on white')
    expect(texts).not.toContain('grey on white')
    // The calibration the brief names: 1.00 for same-on-same, 21 for ink on paper.
    const ww = r.items.find((i) => i.text === 'white on white')
    expect(ww?.ratio).toBe(1)
    // An unknowable ground must be skipped, never scored.
    expect(texts).not.toContain('white on a gradient')
    expect(r.skipped).toBeGreaterThan(0)
    expect(r.count).toBe(1)
  })

  test('black on white measures 21:1 — the far end of the same instrument', async ({ page }) => {
    // Proving the detector can see the GOOD case is what makes its silence mean
    // something. Measured through the same code path, not asserted from theory.
    const ratio = await page.evaluate(`${DETECTORS.invisibleText.split(';(() =>')[0]}
      ;(() => {
        const el = document.querySelector('.black-on-white')
        return Math.round(_ratio(_parse(getComputedStyle(el).color), _bgOf(el)) * 100) / 100
      })()`)
    expect(ratio).toBe(21)
  })

  test('arrow cursors: the arrow is caught, the pointer and the disabled are not', async ({
    page,
  }) => {
    const r = (await page.evaluate(DETECTORS.arrowCursors)) as {
      considered: number
      count: number
      items: { text: string }[]
    }
    const texts = r.items.map((i) => i.text)
    expect(texts).toContain('Has an arrow')
    expect(texts).not.toContain('Has a pointer')
    expect(texts).not.toContain('Disabled, not a finding')
  })

  test('unnamed: the nameless button is caught, aria-label and aria-hidden are not', async ({
    page,
  }) => {
    const r = (await page.evaluate(DETECTORS.unnamed)) as {
      count: number
      items: { cls: string; tag: string }[]
    }
    // One and only one: `#nameless`. The aria-labelled one has a name and the
    // aria-hidden one is not in the accessibility tree at all.
    expect(r.count).toBe(1)
    expect(r.items[0]?.tag).toBe('button')
  })

  test('dead ends: a disabled "Coming soon" is reported as one', async ({ page }) => {
    const r = (await page.evaluate(DETECTORS.deadEnds)) as {
      count: number
      items: { text: string; comingSoon: boolean }[]
    }
    const soon = r.items.find((i) => i.text === 'Coming soon')
    expect(soon).toBeTruthy()
    expect(soon?.comingSoon).toBe(true)
  })

  test('overflow: a 3000px child inside an 800px viewport is named', async ({ page }) => {
    const r = (await page.evaluate(DETECTORS.overflow)) as {
      overflows: boolean
      count: number
      items: { w: number }[]
    }
    expect(r.overflows).toBe(true)
    expect(r.items.some((i) => i.w >= 3000)).toBe(true)
  })

  test('touch: a 20px link is under the floor, a 48px button is not', async ({ page }) => {
    const r = (await page.evaluate(DETECTORS.touch)) as {
      count: number
      items: { text: string; h: number }[]
    }
    const short = r.items.find((i) => i.text === 'Short link')
    expect(short?.h).toBe(20)
    expect(r.items.some((i) => i.text === 'Has a pointer')).toBe(false)
  })

  test('headings: the spine is read in document order with real pixel sizes', async ({ page }) => {
    const r = (await page.evaluate(DETECTORS.headings)) as {
      count: number
      items: { level: number; text: string; px: number }[]
    }
    expect(r.items[0]).toMatchObject({ level: 1, text: 'The one heading' })
    expect(r.items[1]?.level).toBe(2)
    expect(r.items[0]!.px).toBeGreaterThan(r.items[1]!.px)
  })

  test('motion: a page with no animation reports none, rather than reporting nothing', async ({
    page,
  }) => {
    const r = (await page.evaluate(DETECTORS.motion)) as {
      animating: number
      transitions: unknown[]
    }
    expect(r.animating).toBe(0)
    expect(Array.isArray(r.transitions)).toBe(true)
  })
})
