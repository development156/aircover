import { expect, test } from '@playwright/test'

/**
 * THE WORD SPACE IS A MEASURED PROPERTY OF THE SHIPPED FACE, SO IT IS MEASURED —
 * ON REAL ELEMENTS, IN THEIR OWN COMPUTED STYLE.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * v5 changed the UI family to Plus Jakarta Sans for its letterforms. Its word
 * space is 14.3% of an em where a normal UI face gives ~28%, and at that width
 * words run together: "Needs your attention" read as one word in a 3x crop of
 * the first shipped frame. Nothing in the type system could see it — a token
 * file cannot know a font's metrics, and every numeric check on the page
 * (sizes, weights, line-heights, contrast) was correct while the text was hard
 * to read.
 *
 * ── AND THE DEFECT IN THE FIRST VERSION OF THIS GUARD ────────────────────────
 * It measured a synthetic span built from `--ws-word` read off documentElement.
 * That is a TOKEN check wearing a browser costume: it reported byte-identical
 * numbers before and after the correction moved from the root onto each type
 * utility, because it was never looking at a type utility at all. A guard that
 * cannot see the layer it is guarding is the "--pfg was correct for weeks while
 * three components wrote text-white" failure with extra steps.
 *
 * So this walks the REAL elements on /design-system, reads each one's OWN
 * computed font, letter-spacing and word-spacing, and measures the advance those
 * produce. If a component overrides the step, this sees the override.
 */

/** Just under the 24-30% the correction achieves, and well clear of the 14.3% defect. */
const FLOOR = 0.22

/** The steps /design-system renders. A step with no example there is itself a finding. */
const STEPS = [
  'type-display',
  'type-h1',
  'type-h2',
  'type-h3',
  'type-body',
  'type-sm',
  'type-eyebrow',
] as const

test.describe('the word space survives the typeface', () => {
  test('every rendered type step keeps its words apart', async ({ page }) => {
    // /design-system is public, so this needs no Clerk handshake.
    await page.goto('/design-system')
    await page.waitForLoadState('networkidle')

    const measured = await page.evaluate((steps: readonly string[]) => {
      /** One space's advance under an EXISTING element's own computed style. */
      function advanceFor(el: Element) {
        const cs = getComputedStyle(el)
        const width = (text: string) => {
          const s = document.createElement('span')
          s.textContent = text
          s.style.position = 'absolute'
          s.style.left = '-9999px'
          s.style.whiteSpace = 'pre'
          // Copied from the real element, not reconstructed from tokens.
          s.style.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily}`
          s.style.letterSpacing = cs.letterSpacing
          s.style.wordSpacing = cs.wordSpacing
          document.body.appendChild(s)
          const w = s.getBoundingClientRect().width
          s.remove()
          return w
        }
        const px = width('n n') - width('nn')
        return {
          px: Math.round(px * 100) / 100,
          size: parseFloat(cs.fontSize),
          ws: cs.wordSpacing,
          ls: cs.letterSpacing,
          ratio: Math.round((px / parseFloat(cs.fontSize)) * 1000) / 1000,
        }
      }

      return steps.map((cls) => {
        const el = document.querySelector(`.${cls}`)
        if (!el) return { cls, missing: true as const }
        return { cls, missing: false as const, ...advanceFor(el) }
      })
    }, STEPS)

    console.log('\n──── WORD SPACE · measured on the rendered element ────')
    for (const m of measured) {
      if (m.missing) {
        console.log(`  ${m.cls.padEnd(16)} NOT RENDERED on /design-system`)
        continue
      }
      console.log(
        `  ${m.cls.padEnd(16)} ${String(m.size).padStart(4)}px  ws=${String(m.ws).padStart(7)}  ` +
          `space ${String(m.px).padStart(5)}px  ${(m.ratio * 100).toFixed(1)}%`,
      )
    }

    for (const m of measured) {
      expect(m.missing, `${m.cls} has no example on /design-system, so nothing proves it`).toBe(
        false,
      )
    }
    for (const m of measured) {
      if (m.missing) continue
      expect(
        m.ratio,
        `${m.cls}: one space measures ${m.px}px, ${(m.ratio * 100).toFixed(1)}% of ${m.size}px ` +
          `(word-spacing computed to ${m.ws}). Below ${FLOOR * 100}% the words run together — the ` +
          `shipped face gives 14.3% unaided, which is why --ws-word exists and why it has to be ` +
          `declared on each step rather than inherited as one computed pixel value.`,
      ).toBeGreaterThanOrEqual(FLOOR)
    }
  })

  /**
   * THE DETECTOR, SHOWN FAILING.
   *
   * The same measurement with the correction switched off — the state v5 shipped
   * in for about twenty minutes. If this could not fail, the assertions above
   * would prove nothing.
   */
  test('the detector catches the uncorrected face', async ({ page }) => {
    await page.goto('/design-system')
    await page.waitForLoadState('networkidle')

    const bare = await page.evaluate(() => {
      const el = document.querySelector('.type-body') ?? document.body
      const cs = getComputedStyle(el)
      const width = (text: string) => {
        const s = document.createElement('span')
        s.textContent = text
        s.style.cssText = `position:absolute;left:-9999px;white-space:pre`
        s.style.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`
        s.style.letterSpacing = cs.letterSpacing
        s.style.wordSpacing = 'normal' // <- the correction, removed
        document.body.appendChild(s)
        const w = s.getBoundingClientRect().width
        s.remove()
        return w
      }
      return (width('n n') - width('nn')) / parseFloat(cs.fontSize)
    })

    console.log(`  uncorrected face: ${(bare * 100).toFixed(1)}% of the size`)
    expect(
      bare,
      'the uncorrected face must be under the floor, or this guard proves nothing',
    ).toBeLessThan(FLOOR)
  })
})
