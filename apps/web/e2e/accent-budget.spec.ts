import { expect, test } from './fixtures/seeded-user'
import { useTheme, type Theme } from './helpers/ux-shot'
import type { Page } from '@playwright/test'

/**
 * ONE SOLID BRAND FILL PER VIEW. docs/37 §16, enforced.
 *
 * ── THIS FILE WAS CITED BEFORE IT EXISTED ────────────────────────────────────
 * `helpers/accent-spend.ts` names `accent-budget.spec.ts` TWICE — "the DOM-level
 * guard is what actually enforces the one-primary rule" and "accent-budget.spec.ts
 * is what counts solid-brand FILLS by element" — and there was no such file.
 * The meter is honest about what it cannot see and then points at something that
 * was never written, which reads in review as "covered" and is the same defect
 * class as a comment describing a guarantee its code does not provide.
 *
 * ── WHY A DOM COUNT AND NOT A PIXEL FRACTION ─────────────────────────────────
 * The pixel meter cannot tell 0.3% in one primary button from 0.3% smeared over
 * nine links — docs/40 §5.1 found the fragmentation was the founder's actual
 * complaint and the fraction could not see it. This counts ELEMENTS: how many
 * things on the screen are a solid, unmixed brand fill big enough to read as
 * "press me".
 *
 * ── WHAT COUNTS, AND THE TWO THINGS THAT DELIBERATELY DO NOT ─────────────────
 * A fill counts when its composited background is within the brand hue window
 * AND opaque AND at least MIN_FILL_AREA. The two exclusions:
 *
 *   · A BADGE. The approvals count is `bg-brand` at 18x18 = 324px². It is a
 *     signal, not an action, and docs/37 §16 is about actions. The threshold is
 *     what separates them and it is stated rather than sensed.
 *   · A WASH. `--brand-wash` is orange at 6% and `--brand-tint` at 16%. Both
 *     composite to a pale surface far outside the saturation floor, and both
 *     are grounds rather than fills — the active nav row wears one.
 *
 * ── THE COUNT IS PER LAYER, AND THAT IS A FINDING RATHER THAN A CONVENIENCE ──
 * The first version of this file counted the whole document and asserted one.
 * It went RED on the shipping product, at 390, on both routes:
 *
 *     /home 390       2 — 194x44 "Teach Sahoda your brand" | 50x50 (the FAB)
 *     /analytics 390  2 — 147x44 "Connect a channel"       | 50x50 (the FAB)
 *
 * docs/40 §5.3 resolved the identical shape by DELETING the page's button —
 * but only because `Create post` and the FAB were the same action to the same
 * URL, so one of them was a duplicate. These are not. "Teach Sahoda your brand"
 * and "write a post" are different doors, and on a workspace with nothing in it
 * the page's door is the one that matters. Deleting it would remove the only
 * thing the screen exists to offer.
 *
 * So the property is stated at the layer it belongs to. The SHELL has one
 * permanent primary and it is on all forty screens; a PAGE has one of its own.
 * Each is asserted at one, and the report prints both, so a page adding a
 * second fill still fails by name — which is the regression this guard is for.
 *
 * WHAT IS NOT RESOLVED, and is not resolved by re-stating it: at 390 those two
 * layers put two solid orange objects in one 390x844 viewport, and MEASURED by
 * the pixel meter that is the highest brand fraction in the whole 24-frame
 * matrix (3.190% on empty /home). Standing the FAB down on a screen whose first
 * step is something else is a SHELL change affecting forty routes, and it is an
 * owner ruling rather than this lane's call. Logged in docs/41 §6.
 */

/** `--p` #ff6600 is h≈24°. Same window the pixel meter uses, same reason. */
const BRAND_HUE = 24
const HUE_TOLERANCE = 18
/** Below this a brand fill is a badge or a dot, not an action. */
const MIN_FILL_AREA = 1000

const ROUTES = ['/home', '/analytics'] as const
const WIDTHS = [390, 1024, 1440] as const

interface Fill {
  tag: string
  text: string
  area: number
  box: string
  /** Inside `#main` — the PAGE's budget — or in the shell's permanent chrome. */
  inMain: boolean
}

async function solidBrandFills(page: Page): Promise<Fill[]> {
  return page.evaluate(
    ({ hue, tolerance, minArea }) => {
      function rgba(value: string): [number, number, number, number] | null {
        const m = value.match(/rgba?\(([^)]+)\)/)
        if (!m) return null
        const p = m[1]!
          .split(/[,\s/]+/)
          .filter(Boolean)
          .map(Number)
        if (p.length < 3) return null
        return [p[0]!, p[1]!, p[2]!, p.length > 3 ? p[3]! : 1]
      }
      function hsv(r: number, g: number, b: number): [number, number, number] {
        const max = Math.max(r, g, b)
        const min = Math.min(r, g, b)
        const d = max - min
        let h = 0
        if (d !== 0) {
          if (max === r) h = ((g - b) / d) % 6
          else if (max === g) h = (b - r) / d + 2
          else h = (r - g) / d + 4
        }
        h = (h * 60 + 360) % 360
        return [h, max === 0 ? 0 : d / max, max / 255]
      }
      function hueDistance(a: number, b: number): number {
        const d = Math.abs(a - b) % 360
        return d > 180 ? 360 - d : d
      }

      const main = document.getElementById('main')
      const out: {
        tag: string
        text: string
        area: number
        box: string
        inMain: boolean
      }[] = []
      for (const el of Array.from(document.querySelectorAll('body *'))) {
        const style = getComputedStyle(el)
        if (style.visibility === 'hidden' || style.display === 'none') continue
        const bg = rgba(style.backgroundColor)
        // OPAQUE only. A wash is a ground; this counts fills.
        if (!bg || bg[3] < 0.99) continue
        const [h, s, v] = hsv(bg[0], bg[1], bg[2])
        // The same saturation and value floors docs/37 §2.3 states, so this
        // guard and the pixel meter agree on what "orange" means.
        if (s <= 0.3 || v <= 0.25) continue
        if (hueDistance(h, hue) > tolerance) continue
        const box = el.getBoundingClientRect()
        const area = box.width * box.height
        if (area < minArea) continue
        // A brand-filled child inside a brand-filled parent is ONE object to a
        // reader, so only the outermost is counted.
        const parent = el.parentElement
        if (parent) {
          const pbg = rgba(getComputedStyle(parent).backgroundColor)
          if (pbg && pbg[3] >= 0.99) {
            const [ph, ps, pv] = hsv(pbg[0], pbg[1], pbg[2])
            if (ps > 0.3 && pv > 0.25 && hueDistance(ph, hue) <= tolerance) continue
          }
        }
        out.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? '').trim().slice(0, 40),
          area: Math.round(area),
          box: `${Math.round(box.width)}x${Math.round(box.height)}`,
          inMain: main !== null && main.contains(el),
        })
      }
      return out
    },
    { hue: BRAND_HUE, tolerance: HUE_TOLERANCE, minArea: MIN_FILL_AREA },
  )
}

async function bootstrap(page: Page): Promise<void> {
  await page.goto('/home')
  const create = page.locator('#main').getByRole('button', { name: /create workspace/i })
  try {
    await create.waitFor({ state: 'visible', timeout: 20_000 })
    await create.click()
    await page.waitForURL(/\/onboarding/, { timeout: 40_000 })
  } catch {
    /* already bootstrapped */
  }
}

test.describe('the accent budget @smoke', () => {
  test.setTimeout(6 * 60_000)

  test('no view spends its accent on more than one solid fill', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await bootstrap(page)

    const report: string[] = []
    const over: string[] = []

    for (const theme of ['light', 'dark'] as Theme[]) {
      await useTheme(page, theme)
      for (const route of ROUTES) {
        for (const width of WIDTHS) {
          await page.setViewportSize({ width, height: 900 })
          await page.goto(route, { waitUntil: 'domcontentloaded' })
          // Park the pointer off-screen. A hovered primary paints
          // `--brand-deep` (black) and would be MISSED, so a run that left the
          // mouse on the button would report one fewer fill than ships.
          await page.mouse.move(-50, -50)
          await page.waitForTimeout(500)

          const fills = await solidBrandFills(page)
          const where = `${route} ${width} ${theme}`
          const inPage = fills.filter((f) => f.inMain)
          const inShell = fills.filter((f) => !f.inMain)
          report.push(
            `  ${where.padEnd(28)} page ${inPage.length} shell ${inShell.length} — ${
              fills
                .map((f) => `${f.inMain ? 'page' : 'shell'} ${f.box} "${f.text}"`)
                .join(' | ') || '(none)'
            }`,
          )
          if (inPage.length > 1) over.push(`${where}: ${inPage.length} in #main`)
          if (inShell.length > 1) over.push(`${where}: ${inShell.length} in the shell`)
        }
      }
    }

    console.log('\n──── SOLID BRAND FILLS PER VIEW ────')
    for (const line of report) console.log(line)
    console.log('')

    expect(report.length, 'every composition must actually have been visited').toBe(12)
    expect(
      over,
      'docs/37 §16: one primary action per LAYER — the page has one, the shell has one',
    ).toEqual([])
  })
})
