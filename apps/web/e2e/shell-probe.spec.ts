import { expect, test } from './fixtures/seeded-user'

/**
 * THE SHELL, AT 390px, ASSERTED.
 *
 * ── WHAT THIS FILE USED TO BE ────────────────────────────────────────────────
 * A probe. Its own docstring said "Asserts nothing; PRINTS what the shell
 * actually is at mobile width". It was `test.skip` unless DESIGN_AUDIT=1 and it
 * carried no `@smoke` tag, so `--grep @smoke` never selected it — MEASURED
 * 2026-08-20: `playwright test --list` reports 76 tests, `--grep @smoke` reports
 * 67, and this file's one test is among the nine the gate cannot reach.
 *
 * Three conditions had to hold for it to be worth anything, and none did: it had
 * to run, it had to be selected, and it had to assert. A file in that state is
 * not a weak test. It is a script that happens to live in the test directory.
 *
 * ── WHY A DECLARED SET AND NOT A BARE `toEqual([])` ──────────────────────────
 * Making it assert turns real, existing shortfalls red, and this lane does not
 * own the controls that would have to change. So the failing controls are NAMED,
 * with their measured sizes, and the assertion is that the set is EXACTLY that.
 *
 * That is strictly stronger than a count and strictly stronger than silence:
 *   · a fourth control falling under the floor fails, because the set grew;
 *   · a listed control being FIXED also fails, because the set shrank and the
 *     entry is now a lie — which is how a baseline rots into permission;
 *   · nothing is excused without a name and a number.
 *
 * ── THE FLOOR ────────────────────────────────────────────────────────────────
 * 44×44 CSS px is the WCAG 2.5.5 / iOS HIG target size. Applied here only to
 * interactive controls in the SHELL — header, nav, bottom bar — because those
 * are what a thumb reaches for on every screen.
 */

/** Under 44px today, with the size measured on 2026-08-20 at 390×844. */
const KNOWN_UNDERSIZED: string[] = []

/** Horizontal overflow is never acceptable: it hides content with no affordance. */
const VIEWPORT = { width: 390, height: 844 }

type Control = { label: string; width: number; height: number }

test.describe('the shell at 390px @smoke', () => {
  test('every interactive shell control clears the 44px floor, except the declared ones', async ({
    page,
    signedIn,
  }) => {
    void signedIn
    await page.setViewportSize(VIEWPORT)
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    // The shell is server-rendered; the nav is present as soon as #main is.
    await page.locator('#main').waitFor({ state: 'attached', timeout: 30_000 })

    const controls = await page.evaluate(() => {
      const nodes = Array.from(
        document.querySelectorAll<HTMLElement>(
          'header a, header button, nav a, nav button, [class*=bottom] a, [class*=bottom] button',
        ),
      )
      return nodes
        .map((el) => {
          const r = el.getBoundingClientRect()
          // The accessible name, not the box: a peer found a button whose label
          // was six flex items, every box the right size and the text
          // unreadable. textContent collapses that back to what a person reads.
          const label = (el.getAttribute('aria-label') || el.textContent || '?')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 40)
          return { label, width: Math.round(r.width), height: Math.round(r.height) }
        })
        .filter((c) => c.width > 0 && c.height > 0)
    })

    // NON-VACUITY. Without this, a selector that matched nothing would report a
    // perfectly compliant shell — the exact failure this whole file is about.
    expect(
      controls.length,
      'no interactive shell controls were found at all — the selector is stale, and ' +
        'an empty list satisfies every assertion below without measuring anything',
    ).toBeGreaterThan(3)

    const undersized = (controls as Control[])
      .filter((c) => c.height < 44 || c.width < 44)
      .map((c) => `${c.label} → ${c.width}×${c.height}`)
      .sort()

    expect(
      undersized,
      'The set of shell controls under the 44px touch floor changed. If one is NEW, it ' +
        'is a thumb target smaller than a fingertip on every screen of the app. If one ' +
        'was FIXED, delete its entry from KNOWN_UNDERSIZED — a baseline nobody prunes ' +
        'stops being a record and becomes permission.',
    ).toEqual([...KNOWN_UNDERSIZED].sort())
  })

  test('nothing overflows the viewport horizontally', async ({ page, signedIn }) => {
    void signedIn
    await page.setViewportSize(VIEWPORT)
    await page.goto('/home', { waitUntil: 'domcontentloaded' })
    await page.locator('#main').waitFor({ state: 'attached', timeout: 30_000 })

    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }))

    // A one-pixel tolerance: sub-pixel layout rounding produces a 391 against a
    // 390 viewport on a page nobody would call broken.
    expect(
      scrollWidth,
      `The document scrolls horizontally at ${VIEWPORT.width}px — ${scrollWidth} > ${clientWidth}. ` +
        'Content past the right edge has no affordance on a phone; it is simply gone.',
    ).toBeLessThanOrEqual(clientWidth + 1)
  })
})
