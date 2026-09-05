import type { SupabaseClient } from '@supabase/supabase-js'

import { adminClient, expect, test } from './fixtures/seeded-user'
import { dismissPlanOffer } from './fixtures/compose'
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
 * ── WHAT COUNTS: AN ACTION, NOT AN AREA ──────────────────────────────────────
 * docs/37 §16's rule is **one primary ACTION per view**, and the first version
 * of this file used SIZE as the proxy for "is it an action" — any opaque
 * brand-hue fill over 1000px². The header even argued for it: "the approvals
 * count is `bg-brand` at 18x18 = 324px², a signal not an action, and the
 * threshold is what separates them".
 *
 * The threshold does not separate them. MEASURED the moment this guard began
 * visiting the POPULATED state: `Badge rung="urgent"` is
 * `bg-brand text-primary-foreground`, and "In review" renders ~75x20 = 1500px²
 * — over the floor, and not an action. Populated /home failed at 1024 and 1440
 * in both themes for `Create post` plus a status pill.
 *
 * So the discriminator is INTERACTIVITY, which is what the rule was always
 * about: an `<a>`, a `<button>`, or `[role="button"]`. Everything else that is
 * a large brand fill is still counted and still PRINTED, under `marks`, so a
 * decorative orange slab cannot hide behind this correction — it just does not
 * fail the one-primary assertion, because it is not competing to be pressed.
 *
 * A WASH is excluded on a different axis and that has not changed:
 * `--brand-wash` is orange at 6% and `--brand-tint` at 16%, both composite to a
 * pale surface far outside the saturation floor, and both are grounds rather
 * than fills — the active nav row wears one.
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
 *
 * ── IT VISITS BOTH DATA STATES, AND THE FIRST VERSION DID NOT ────────────────
 * It bootstrapped a workspace and stopped, so every pass measured an EMPTY one.
 * A mutation adding a second brand fill to `greeting-banner.tsx` was applied,
 * built and run, and this guard stayed GREEN — because an empty workspace
 * renders `GetStarted` and `GreetingBanner` is not on the page at all. The
 * mutation missed its target, and a guard aimed only at a state the founder is
 * not looking at would have read in review as coverage of one he is.
 *
 * ONE POST IS ENOUGH. `workspaceHasStarted` gates the dashboard on it, so a
 * single row switches /home from `GetStarted` to the real screen and puts the
 * greeting, the stat strip and the queue in frame. Inserted through the service
 * key; deleted by the fixture along with the workspace.
 *
 * With no service key the populated half cannot run, and the run SAYS SO and
 * fails rather than reporting half a sweep as a clean one.
 */

/** `--p` #ff6600 is h≈24°. Same window the pixel meter uses, same reason. */
const BRAND_HUE = 24
const HUE_TOLERANCE = 18
/** Below this a brand fill is a dot or an icon chip, not something you press. */
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
  /** Something you can press. Only these compete to be the one primary. */
  actionable: boolean
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
        actionable: boolean
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
          actionable:
            el.tagName === 'A' ||
            el.tagName === 'BUTTON' ||
            el.getAttribute('role') === 'button' ||
            // A brand-filled wrapper AROUND a link is the same object to a
            // reader as the link — `buttonVariants` on a <Link> renders an <a>,
            // but a card whose whole surface is the target does not.
            el.querySelector('a,button,[role="button"]') !== null,
        })
      }
      return out
    },
    { hue: BRAND_HUE, tolerance: HUE_TOLERANCE, minArea: MIN_FILL_AREA },
  )
}

/**
 * One post, so /home stops being `GetStarted` and becomes the dashboard.
 * `false` when there is no service key — see the header.
 */
async function seedOnePost(clerkUserId: string): Promise<boolean> {
  const admin = adminClient() as SupabaseClient | null
  if (!admin) return false
  const { data } = await admin
    .from('workspaces')
    .select('id')
    .eq('created_by', clerkUserId)
    .limit(1)
  const workspaceId = data?.[0]?.id
  if (!workspaceId) return false
  const { error } = await admin.from('posts').insert({
    workspace_id: workspaceId,
    title: 'Saturday cupping, five seats',
    body: 'Saturday cupping is open again. Five seats, no charge, 9am.',
    status: 'review',
    channels: ['instagram'],
    created_by: clerkUserId,
  })
  return !error
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
  test.setTimeout(8 * 60_000)

  test('no view spends its accent on more than one solid fill', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()
    await bootstrap(page)

    const report: string[] = []
    const over: string[] = []
    const visited: string[] = []

    for (const state of ['empty', 'populated'] as const) {
      if (state === 'populated' && !(await seedOnePost(signedIn.clerkUserId))) {
        console.log('\n  NOTE: no service key — the populated state was NOT measured.\n')
        break
      }
      visited.push(state)
      await sweep(page, state, report, over)
    }

    console.log('\n──── SOLID BRAND FILLS PER VIEW ────')
    for (const line of report) console.log(line)
    console.log('')

    expect(
      visited,
      'both data states must be visited — an empty-only pass never renders the dashboard',
    ).toEqual(['empty', 'populated'])
    expect(report.length, 'every composition must actually have been visited').toBe(24)
    expect(
      over,
      'docs/37 §16: one primary action per LAYER — the page has one, the shell has one',
    ).toEqual([])
  })
})

/** Every route x width x theme, for one data state. */
async function sweep(page: Page, state: string, report: string[], over: string[]): Promise<void> {
  for (const theme of ['light', 'dark'] as Theme[]) {
    await useTheme(page, theme)
    for (const route of ROUTES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 })
        await page.goto(route, { waitUntil: 'domcontentloaded' })
        // /home opens the plan offer for a workspace on Free, which every seeded
        // account is, and its recommended plan carries a solid brand fill. That
        // is a SECOND fill on this page and this guard would have counted it —
        // intermittently, since the dialog waits on Clerk's client SDK, which is
        // the worst way for a guard to fail. The dialog is the customer's to
        // close and this measures the screen behind it.
        await dismissPlanOffer(page)
        // Park the pointer off-screen. A hovered primary paints `--brand-deep`
        // (black) and would be MISSED, so a run that left the mouse on the
        // button would report one fewer fill than ships.
        await page.mouse.move(-50, -50)
        await page.waitForTimeout(500)

        const fills = await solidBrandFills(page)
        const where = `${state} ${route} ${width} ${theme}`
        const actions = fills.filter((f) => f.actionable)
        const inPage = actions.filter((f) => f.inMain)
        const inShell = actions.filter((f) => !f.inMain)
        const marks = fills.filter((f) => !f.actionable)
        report.push(
          `  ${where.padEnd(36)} page ${inPage.length} shell ${inShell.length}` +
            ` — ${
              actions
                .map((f) => `${f.inMain ? 'page' : 'shell'} ${f.box} "${f.text}"`)
                .join(' | ') || '(no action)'
            }` +
            // Printed, never asserted on. A status pill is not competing to be
            // pressed, and a decorative slab still shows up here by name.
            (marks.length
              ? `  [marks: ${marks.map((f) => `${f.box} "${f.text}"`).join(', ')}]`
              : ''),
        )
        if (inPage.length > 1) over.push(`${where}: ${inPage.length} in #main`)
        if (inShell.length > 1) over.push(`${where}: ${inShell.length} in the shell`)
      }
    }
  }
}
