import { expect, test } from './fixtures/seeded-user'
import { leaveOnboarding, dismissPlanOffer } from './fixtures/compose'
import type { Page } from '@playwright/test'

/**
 * The 44px touch floor on the shell, ASSERTED — in both account states.
 *
 * ── WHAT THIS FILE USED TO BE, AND WHY THAT WAS NOT ENOUGH ───────────────────
 * It measured the same thing and asserted NOTHING. It printed a count of shell
 * controls under 44px, was skipped unless `DESIGN_AUDIT=1`, and carried no
 * `@smoke` tag — so on a normal run it did not execute, and on an audit run its
 * finding reached a console and stopped there. Six controls were raised to the
 * floor in `95ed24f` (mark 26→44, switcher 38→44, brain ring 40→44, credit chip
 * 34→44, theme toggle 32→44, Clerk user menu 28→44) and nothing has held them
 * there since. An instrument that reports and an instrument that enforces are
 * different objects; this file was the first and was counted as the second.
 *
 * ── WHY BOTH ACCOUNT STATES, AND WHY THAT IS THE WHOLE POINT ─────────────────
 * Three of those six controls — the credit chip, the brain ring and the
 * workspace switcher — DO NOT EXIST until the account has a workspace. A guard
 * that signs in and goes straight to /home measures a row three items short of
 * the one a real user sees, which is exactly how the 17px topbar overflow lived
 * behind a green suite (`topbar-two-states.spec.ts` records that episode). So
 * this sweeps STATE A (no workspace) and STATE B (workspace bootstrapped), and
 * a control that only appears in B is precisely the one worth measuring.
 *
 * ── WHY ONLY THE PHONE WIDTHS ────────────────────────────────────────────────
 * The floor is deliberately a MAX-NARROW rule. `SPECIFICATION.md` §10 asks for
 * 44px on a phone AND a dense desktop, and the kit's 34px control height above
 * 700px is a decision, not an oversight. Asserting 44 at 1440 would fail the
 * design as written. The shell's own `narrow` breakpoint is 700, so 360 and 390
 * are the widths under test and 1440 is swept only to record that desktop was
 * not dragged up with them — the regression `2f9fca1` had to undo.
 */

/**
 * Interactive shell chrome only.
 *
 * Deliberately NOT every control on the page: `/brain`'s tab links (41px) and
 * `/planner`'s channel chips (28px) are logged pre-existing findings outside the
 * shell, and a guard that fails on them from day one is a guard that gets
 * skipped rather than fixed. This asserts the surface `95ed24f` actually raised.
 */
const SHELL_SELECTOR = [
  // `header[data-guide="topbar.root"]`, not `header`. Cards carry their own <header>
  // elements, so a bare `header a` pulled three "View all" links and a "Manage" out of
  // page content and reported them as shell chrome.
  'header[data-guide="topbar.root"] a',
  'header[data-guide="topbar.root"] button',
  // The rail AND the phone bottom bar both label themselves `nav[aria-label="Main"]`,
  // so one selector covers both without matching page content. An earlier draft used
  // `[class*=bottom]` and matched a `bottom-0` utility class on an in-page empty state,
  // which put "Create workspace" — a 34px content button that is not shell chrome at all
  // — into a shell measurement. A guard that reports the wrong element is worse than one
  // that reports nothing, because somebody will go and "fix" it.
  'nav[aria-label="Main"] a',
  'nav[aria-label="Main"] button',
].join(', ')

/** The floor itself. One number, one place. */
const TOUCH_FLOOR = 44

/** Sub-pixel layout rounds; a control measured at 43.6 is a 44 that rendered. */
const TOLERANCE = 0.5

/** Below the shell's `narrow` breakpoint (700), the floor applies. */
const PHONE_WIDTHS = [360, 390] as const

/** Swept but NOT asserted against the floor — desktop is meant to stay dense. */
const DESKTOP_WIDTH = 1440

interface Measured {
  label: string
  width: number
  height: number
  /** The Sahoda Guide anchor, when the control carries one. A STABLE identity. */
  guide: string | null
}

/**
 * The two anchors that tell the account states apart.
 *
 * `topbar.workspace-create` is the switcher's no-workspace trigger;
 * `topbar.workspace` is the switcher itself. Exactly one of them is on screen, and
 * which one is the whole difference between STATE A and STATE B.
 */
const CREATE_ANCHOR = 'topbar.workspace-create'
const SWITCHER_ANCHOR = 'topbar.workspace'

async function measureShell(page: Page): Promise<Measured[]> {
  return page.evaluate((sel) => {
    return [...document.querySelectorAll<HTMLElement>(sel)]
      .filter((el) => {
        const cs = getComputedStyle(el)
        if (cs.display === 'none' || cs.visibility === 'hidden') return false
        const r = el.getBoundingClientRect()
        return r.width > 0 && r.height > 0
      })
      .map((el) => {
        const r = el.getBoundingClientRect()
        return {
          label:
            el.innerText.replace(/\s+/g, ' ').trim().slice(0, 28) ||
            el.getAttribute('aria-label') ||
            `<${el.tagName.toLowerCase()}>`,
          width: Math.round(r.width * 10) / 10,
          height: Math.round(r.height * 10) / 10,
          guide: el.getAttribute('data-guide'),
        }
      })
  }, SHELL_SELECTOR)
}

function underFloor(controls: readonly Measured[]): string[] {
  return controls
    .filter((c) => c.height < TOUCH_FLOOR - TOLERANCE || c.width < TOUCH_FLOOR - TOLERANCE)
    .map((c) => `"${c.label}" ${c.width}×${c.height}`)
}

/**
 * A width's measurements, or a thrown error.
 *
 * NOT `?? []`. An empty array reads as "nothing under the floor" and would turn a width
 * that was never swept into a pass — the same class of defect this whole file exists to
 * close.
 */
function at(sweepResult: ReadonlyMap<number, Measured[]>, width: number): Measured[] {
  const controls = sweepResult.get(width)
  if (controls === undefined) throw new Error(`${width}px was never swept`)
  return controls
}

async function sweep(page: Page, state: string): Promise<Map<number, Measured[]>> {
  const out = new Map<number, Measured[]>()
  for (const width of [...PHONE_WIDTHS, DESKTOP_WIDTH]) {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await page.waitForLoadState('networkidle')
    const controls = await measureShell(page)
    out.set(width, controls)
    const small = underFloor(controls)
    console.log(`\n──── ${state} · ${width}px · ${controls.length} shell controls ────`)
    controls.forEach((c) =>
      console.log(`   ${c.label} → ${c.width}×${c.height}${c.guide ? `  [${c.guide}]` : ''}`),
    )
    console.log(`   under ${TOUCH_FLOOR}px: ${small.length}`)
    small.forEach((s) => console.log('   ! ' + s))
  }
  return out
}

test.describe('the shell clears the 44px touch floor on a phone @smoke', () => {
  test.setTimeout(6 * 60_000)

  test('in both account states, and desktop stays dense', async ({ page, signedIn }) => {
    expect(signedIn).toBeTruthy()

    // ── STATE A: signed in, no workspace. The shape a lazier guard measures.
    const before = await sweep(page, 'STATE A · no workspace')

    // ── STATE B: bootstrap a workspace, exactly as a real account does. The
    //    credit chip, the brain ring and the switcher exist only from here.
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.goto('/home')
    await page
      .locator('#main')
      .getByRole('button', { name: /create workspace/i })
      .click()
    await page.waitForURL(/\/onboarding/, { timeout: 60_000 })
    await leaveOnboarding(page)

    // Landing on /onboarding proves the ACTION succeeded; it does not prove the shell
    // has re-read the workspace. Wait for the switcher itself before measuring, so a
    // slow read cannot turn STATE B into a second, quieter measurement of STATE A.
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await dismissPlanOffer(page)
    await page
      .locator(`header[data-guide="topbar.root"] [data-guide="${SWITCHER_ANCHOR}"]`)
      .waitFor({ state: 'visible', timeout: 30_000 })

    const after = await sweep(page, 'STATE B · workspace present')

    for (const width of PHONE_WIDTHS) {
      expect(
        underFloor(at(before, width)),
        `shell controls under ${TOUCH_FLOOR}px at ${width}px with NO workspace`,
      ).toEqual([])
      expect(
        underFloor(at(after, width)),
        `shell controls under ${TOUCH_FLOOR}px at ${width}px WITH a workspace — the state every real user is in`,
      ).toEqual([])
    }

    // ── THE SENTINEL: STATE B WAS REALLY MEASURED WITH A WORKSPACE ─────────────
    // Without this, a bootstrap that silently did not take would leave STATE B's
    // assertions ranging over STATE A's controls and passing — the test quietly
    // becoming the weaker guard it replaced.
    //
    // It asserts IDENTITY, not a count. The first form compared control counts, and
    // STATE B carries exactly ONE more than STATE A (the credit chip; the switcher
    // merely REPLACES the create button). A margin of one is not a sentinel: on a
    // slow balance read the chip is absent, the counts tie, and the guard fails on a
    // run where the workspace chrome was actually there. MEASURED — that is exactly
    // how it flaked on 2026-08-20. The guide anchors are unambiguous and never race.
    const anchorsAt390 = (m: ReadonlyMap<number, Measured[]>) =>
      at(m, 390)
        .map((c) => c.guide)
        .filter((g): g is string => g !== null)

    expect(
      anchorsAt390(before),
      'STATE A must show the no-workspace trigger — otherwise the two states are not distinct',
    ).toContain(CREATE_ANCHOR)
    expect(
      anchorsAt390(after),
      'STATE B must show the workspace switcher — otherwise the bootstrap never took and the extra chrome went unmeasured',
    ).toContain(SWITCHER_ANCHOR)
    expect(
      anchorsAt390(after),
      'STATE B must NOT still be offering "Create workspace"',
    ).not.toContain(CREATE_ANCHOR)

    // Desktop is meant to stay dense. If a future 44px fix is applied without a
    // width guard it will show up here as the kit's 34px controls growing.
    const desktopSmall = underFloor(at(after, DESKTOP_WIDTH))
    console.log(
      `\ndesktop (${DESKTOP_WIDTH}px) controls below ${TOUCH_FLOOR}px: ${desktopSmall.length} — expected, and not asserted against the floor`,
    )
    expect(
      desktopSmall.length,
      `at ${DESKTOP_WIDTH}px the kit's dense controls must still be there — 0 under ${TOUCH_FLOOR} means the phone floor leaked onto desktop, which is regression 2f9fca1`,
    ).toBeGreaterThan(0)
  })

  /**
   * The detector, shown failing. A guard never demonstrated to fail is not a
   * guard — it is a line that always passes. This injects a control that is
   * knowingly too small into the real header and requires the same measurement
   * to report it.
   */
  test('the touch-floor detector actually detects a control under the floor', async ({
    page,
    signedIn,
  }) => {
    expect(signedIn).toBeTruthy()
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await dismissPlanOffer(page)
    await page.waitForLoadState('networkidle')

    const clean = underFloor(await measureShell(page))
    expect(clean, 'the shell must be clean BEFORE the injection, or this proves nothing').toEqual(
      [],
    )

    await page.evaluate(() => {
      const button = document.createElement('button')
      button.id = 'touch-floor-probe'
      button.textContent = 'too small'
      button.style.cssText = 'width:20px;height:20px;overflow:hidden'
      document.querySelector('header')?.appendChild(button)
    })

    const dirty = underFloor(await measureShell(page))
    expect(dirty.length, 'the detector must report the injected 20×20 control').toBe(1)
    expect(dirty[0]).toContain('20×20')

    await page.evaluate(() => document.getElementById('touch-floor-probe')?.remove())
    expect(underFloor(await measureShell(page)), 'and go quiet again once it is removed').toEqual(
      [],
    )
  })
})
