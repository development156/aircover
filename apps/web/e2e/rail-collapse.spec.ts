import { expect, test } from './fixtures/seeded-user'
import { useTheme, type Theme } from './helpers/ux-shot'
import type { Page } from '@playwright/test'
import { dismissPlanOffer } from './fixtures/compose'

/**
 * THE RAIL COLLAPSES, IT OPENS COLLAPSED, AND NOTHING LOSES ITS NAME EITHER WAY.
 *
 * ── WHY THIS FILE EXISTS BESIDE `shell-widths.spec.ts` ───────────────────────
 * That file already proves every nav link keeps its accessible name at six
 * widths, and it is the guard that caught nine unnamed nav links. It reads the
 * name at a WIDTH, and until 2026-08-23 width was the only thing that collapsed
 * the rail.
 *
 * The founder's ruling added a second reason — the reader may collapse it, and
 * it opens that way — and a media query cannot see that state. So at 1440,
 * where `shell-widths` expects a labelled rail and finds one, the rail a person
 * actually meets is the icon rail, and NOTHING was measuring it. Every property
 * that file protects had a second, unwatched instance of exactly the same
 * failure mode available to it.
 *
 * ── THE FOUR PROPERTIES ──────────────────────────────────────────────────────
 *  1. It opens COLLAPSED. Asserted on the WIDTH, not on the attribute: an
 *     attribute is what we set, a width is what the reader sees, and the whole
 *     `rail-min`/`rail-icon` variant machinery sits between the two.
 *  2. Every destination keeps its accessible name in BOTH states. `sr-only`
 *     passes this; `display:none` does not, which is the entire point.
 *  3. The choice persists across a navigation and a reload.
 *  4. The toggle is not offered below 1180, where it could not do anything.
 *
 * ── AND IT REPORTS THE CONTRAST RATHER THAN ONLY ASSERTING IT ────────────────
 * The verdict that started this lane was "the text is too faded". That is a
 * measurable claim and it deserved a measurement rather than an opinion, so
 * every rail label's COMPOSITED contrast is computed here — in a browser, on
 * the rendered pixels' colours, in both states and both themes — and printed.
 * A token check could not do it: the rail is `data-surface="inverse"`, so the
 * value of `--ink-mute` inside it is not the value anywhere else in the app.
 */

/** WCAG 2.1 relative luminance. */
function luminance(rgb: [number, number, number]): number {
  const [r, g, b] = rgb.map((c) => {
    const v = c / 255
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(fg: [number, number, number], bg: [number, number, number]): number {
  const a = luminance(fg)
  const b = luminance(bg)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

function parseRgb(value: string): [number, number, number] | null {
  const m = value.match(/rgba?\(([^)]+)\)/)
  if (!m) return null
  const parts = m[1]!
    .split(/[,\s/]+/)
    .filter(Boolean)
    .map(Number)
  if (parts.length < 3 || parts.slice(0, 3).some(Number.isNaN)) return null
  return [parts[0]!, parts[1]!, parts[2]!]
}

interface LabelReading {
  label: string
  color: string
  background: string
  ratio: number
}

/**
 * Read every rail label's colour and the colour actually behind it.
 *
 * The background is walked up the ancestor chain until something opaque is
 * found, because a nav row's own background is `transparent` at rest and the
 * fill that matters is the panel's. An ALPHA fill on the way up (the active
 * row's 6% brand wash) is composited over what it sits on rather than being
 * treated as the ground — reading the wash as if it were opaque would report a
 * ratio nothing renders.
 */
async function readRailText(page: Page): Promise<LabelReading[]> {
  return page.evaluate(() => {
    function composite(
      over: [number, number, number, number],
      under: [number, number, number],
    ): [number, number, number] {
      const a = over[3]
      return [
        over[0] * a + under[0] * (1 - a),
        over[1] * a + under[1] * (1 - a),
        over[2] * a + under[2] * (1 - a),
      ]
    }
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
    /** The opaque colour under `el`, compositing every alpha layer above it. */
    function groundOf(el: Element): [number, number, number] {
      const stack: [number, number, number, number][] = []
      let node: Element | null = el
      while (node) {
        const bg = rgba(getComputedStyle(node).backgroundColor)
        if (bg && bg[3] > 0) {
          stack.push(bg)
          if (bg[3] >= 1) break
        }
        node = node.parentElement
      }
      let ground: [number, number, number] = [255, 255, 255]
      for (let i = stack.length - 1; i >= 0; i -= 1) ground = composite(stack[i]!, ground)
      return ground
    }

    /* THE WHOLE RAIL, not only the nav. The 2.49:1 this guard was written for
       was on nav labels, and the same stale alias was reaching "Credits left",
       "Usage", the workspace name and the role in the foot — four more strings
       on the same panel that a nav-only reader would have reported clean. */
    const rail = document.querySelector('aside[data-guide="nav.rail"]')
    if (!rail) return []
    const out: { label: string; color: string; background: string; ratio: number }[] = []
    for (const el of Array.from(rail.querySelectorAll('*'))) {
      // Its OWN text, not its descendants'. A wrapper reports the colour of a
      // box, and every leaf below it would be counted twice.
      const own = Array.from(el.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => (n.textContent ?? '').trim())
        .join(' ')
        .trim()
      if (!own) continue
      const style = getComputedStyle(el)
      // `sr-only` is clipped to 1px, never `display:none` — it is still read
      // aloud, but it is not something a sighted reader can be short-changed
      // by, so it is not part of a contrast verdict.
      if (style.display === 'none' || style.visibility === 'hidden') continue
      const box = el.getBoundingClientRect()
      if (box.width <= 2 || box.height <= 2) continue
      const ground = groundOf(el)
      out.push({
        label: own.length > 18 ? `${own.slice(0, 17)}\u2026` : own,
        color: style.color,
        background: `rgb(${ground.map((c) => Math.round(c)).join(', ')})`,
        ratio: 0,
      })
    }
    return out
  })
}

function withRatios(readings: LabelReading[]): LabelReading[] {
  return readings.map((r) => {
    const fg = parseRgb(r.color)
    const bg = parseRgb(r.background)
    return { ...r, ratio: fg && bg ? Math.round(contrast(fg, bg) * 100) / 100 : 0 }
  })
}

/**
 * The destinations `shell-widths.spec.ts` names, minus nothing.
 *
 * Kept as a literal rather than imported from `sections.ts` for the same reason
 * `roadmap-honesty.spec.ts` hand-writes its allow-list: a test that derives its
 * expectation from the thing it is testing passes under any mutation of it. If
 * a section leaves the rail, this fails by name and somebody decides.
 */
// `Remix`, `Sites` and `Playbooks` are NOT here: the founder's ruling of
// 2026-08-25 removed all three from `lib/nav/sections.ts` (built, not "soon",
// simply absent from the rail; `reachable.test.ts` says how each is reached).
// This list still named them and the collapsed check failed on "Remix" for
// three attempts (run 34012814133), pinning a menu the product no longer has.
const RAIL_LABELS = [
  'Home',
  'Brand Brain',
  'Posts',
  'Campaigns',
  'Assets',
  'Planner',
  'Approvals',
  'Inbox',
  'Leads',
  'Analytics',
  'CMO Report',
  'The Loop',
] as const

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

  /**
   * ── THIS BOOTSTRAP ENDS ON /onboarding, AND SINCE wt-boot THAT MATTERS ───────
   * The lines above deliberately wait for `/onboarding`, so the user they leave
   * behind is a workspace with NO Brand Brain — `onboardingStateRead` calls that
   * `not-started`. `(app)/layout.tsx` now asks `decideLanding()` first, and a
   * `not-started` account is redirected off /home, so the shell this whole file
   * measures never renders and `railWidth` waits 300s for an <aside> that was
   * never going to arrive.
   *
   * Neither branch could see it: the landing rule and this spec were written in
   * different lanes, and each was green alone.
   *
   * The defer cookie is the product's OWN "Save & exit" path — `landing.ts` sends
   * a deferred visitor `through` — so this asks for the dashboard the way a real
   * customer does, rather than faking a Brand Brain this spec has no use for.
   */
  await page.context().addCookies([
    {
      name: 'sahoda_onb_defer',
      value: '1',
      url: new URL(page.url()).origin,
    },
  ])
}

async function railWidth(page: Page): Promise<number> {
  return page
    .locator('aside[data-guide="nav.rail"]')
    .evaluate((el) => Math.round(el.getBoundingClientRect().width))
}

/** Every nav destination, by ACCESSIBLE NAME. The property, in one function. */
async function expectEveryNameSurvives(page: Page, where: string) {
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const label of RAIL_LABELS) {
    const link = nav.getByRole('link', { name: label, exact: true })
    await expect(link, `${where}: nav "${label}" must keep its accessible name`).toHaveCount(1)
  }
}

test.describe('the rail collapses @smoke', () => {
  test.setTimeout(5 * 60_000)

  test('opens collapsed, expands, persists, and never loses a name', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 900 })
    await bootstrap(page)
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await dismissPlanOffer(page)
    await page.waitForTimeout(600)

    // ── 1 · IT OPENS COLLAPSED, and the assertion is on the rendered width.
    const collapsed = await railWidth(page)
    expect(collapsed, 'the rail opens collapsed at 1440 — founder ruling').toBe(62)

    // ── 2 · Every name survives the state a reader MEETS FIRST.
    await expectEveryNameSurvives(page, 'collapsed')

    // …and the labels are genuinely not on screen, or "collapsed" means nothing.
    const homeLabel = page
      .getByRole('navigation', { name: 'Main' })
      .getByRole('link', { name: 'Home', exact: true })
      .locator('span')
      .first()
    await expect(homeLabel, 'a collapsed rail draws no label').not.toBeInViewport()
    // The name is CLIPPED, never removed: `display:none` would take the
    // accessible name with it, which is the defect this whole file is about.
    expect(
      await homeLabel.evaluate((el) => getComputedStyle(el).display),
      'the label is clipped by sr-only, never display:none',
    ).not.toBe('none')

    // ── 3 · The toggle expands it.
    const toggle = page.getByTestId('rail-toggle')
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await toggle.click()
    await page.mouse.move(-50, -50)
    await page.waitForTimeout(400)
    expect(await railWidth(page), 'expanded is the labelled rail').toBe(240)
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')
    await expectEveryNameSurvives(page, 'expanded')
    await expect(homeLabel, 'an expanded rail draws its labels').toBeInViewport()

    // ── 4 · The choice persists across a real navigation and a reload.
    await page.goto('/posts', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)
    expect(await railWidth(page), 'the choice survives a navigation').toBe(240)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)
    expect(await railWidth(page), 'the choice survives a reload').toBe(240)

    // …and collapsing again persists too, so the control is not one-way.
    await page.getByTestId('rail-toggle').click()
    await page.mouse.move(-50, -50)
    await page.waitForTimeout(400)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(400)
    expect(await railWidth(page), 'collapsing again persists too').toBe(62)

    // ── 5 · Below 1180 the rail is collapsed by the media query, so the control
    //        would flip an attribute and change nothing. It is not offered.
    await page.setViewportSize({ width: 1024, height: 768 })
    await page.waitForTimeout(300)
    expect(await railWidth(page), 'the forced collapse keeps its measured 56px').toBe(56)
    await expect(
      page.getByTestId('rail-toggle'),
      'no toggle where it could not do anything',
    ).toBeHidden()
    await expectEveryNameSurvives(page, '1024 forced-collapse')
  })

  /**
   * The measurement the founder's verdict asked for, and it is REPORTED whole
   * rather than reduced to a pass. A floor is asserted too — 4.5:1, WCAG AA for
   * body text — but the table is the deliverable.
   */
  test('every rail label measured, both states, both themes', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await page.setViewportSize({ width: 1440, height: 900 })
    await bootstrap(page)

    const rows: string[] = []
    let worst = { ratio: 99, label: '', where: '' }

    for (const theme of ['light', 'dark'] as Theme[]) {
      await useTheme(page, theme)
      for (const state of ['collapsed', 'expanded'] as const) {
        await page.goto('/home', { waitUntil: 'domcontentloaded' })
        await dismissPlanOffer(page)
        await page.waitForTimeout(500)
        const isExpanded = await page.getByTestId('rail-toggle').getAttribute('aria-expanded')
        if ((isExpanded === 'true') !== (state === 'expanded')) {
          await page.getByTestId('rail-toggle').click()
          await page.mouse.move(-50, -50)
          await page.waitForTimeout(400)
        }

        for (const reading of withRatios(await readRailText(page))) {
          rows.push(
            `  ${theme.padEnd(5)} ${state.padEnd(9)} ${reading.label.padEnd(14)} ` +
              `${reading.color.padEnd(22)} on ${reading.background.padEnd(20)} ${reading.ratio.toFixed(2)}:1`,
          )
          if (reading.ratio > 0 && reading.ratio < worst.ratio) {
            worst = { ratio: reading.ratio, label: reading.label, where: `${theme}/${state}` }
          }
        }
      }
    }

    console.log('\n──── RAIL LABEL CONTRAST ────')
    for (const row of rows) console.log(row)
    console.log(`  WORST: ${worst.label} at ${worst.where} — ${worst.ratio}:1\n`)

    expect(rows.length, 'the reader must actually have read some labels').toBeGreaterThan(20)
    expect(
      worst.ratio,
      `the faintest rail label is "${worst.label}" at ${worst.where}, ${worst.ratio}:1`,
    ).toBeGreaterThanOrEqual(4.5)
  })
})
