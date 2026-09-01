import { expect, test } from './fixtures/seeded-user'
import { bootstrapWorkspace, leaveOnboarding, dismissPlanOffer } from './fixtures/compose'
import { decodePng, luminanceAt } from './helpers/png'

/**
 * THE COMMAND PALETTE IS READABLE, IN BOTH THEMES, AND STAYS INSIDE ITS PANEL.
 *
 * ── THE THREE DEFECTS THIS EXISTS FOR ────────────────────────────────────────
 * Reported from a screenshot of the deployed preview, 2026-08-25, all three on
 * the one overlay: a "black background bug", an "outline pill not aligned", and
 * "no difference contrast in background and foreground".
 *
 * ── WHY A RENDERED MEASUREMENT AND NOT A SOURCE SCAN ─────────────────────────
 * Every one of these is a COMPOSITED fact. The scrim's colour is a token
 * indirection resolved per theme; the ring is painted by an unlayered global
 * rule in tokens.css that no call site mentions; and "does the panel separate
 * from the page" is a question about two things that are only adjacent once a
 * browser has laid them out.
 *
 * `palette-scrim.test.ts` does the colour arithmetic in the unit gate, on every
 * commit, with no browser. This one measures what a reader actually receives —
 * the raster, and the ring's real geometry — which that one cannot see. Neither
 * is redundant: the unit guard would pass on a panel accidentally rendered
 * OUTSIDE the overlay, and this one would pass on a scrim that happened to look
 * right at one viewport.
 *
 * ── THE DARK THEME CANNOT BE HELD TO A CONTRAST RATIO HERE, AND IS NOT ───────
 * The first draft of this file asserted 3:1 between the panel and the page. That
 * is achievable in light (MEASURED 2.96:1 with the panel white over a scrimmed
 * rgb(150)) and IMPOSSIBLE in dark, where both sides are near-black by design:
 * the best available fill measures 1.40:1 over the scrimmed page, and darkening
 * the scrim further cannot help, because black minus more black is still black.
 *
 * A guard asserting 3:1 there would have failed correct code and been silenced
 * within a week. So what is asserted is what is actually true and actually
 * load-bearing: the scrim DARKENS rather than inverting, the panel is never
 * darker than the page beneath it, and the ring stays inside its panel. The
 * separation FLOOR lives in `palette-scrim.test.ts`, against the app's own card
 * step rather than against a WCAG number that does not apply to two fills.
 */

/**
 * How far the global focus ring extends beyond the box it is on.
 *
 * tokens.css paints `:focus-visible` unlayered — `outline: 2px` at
 * `outline-offset: 2px`, plus `box-shadow: 0 0 0 4px` — so 4px on every side,
 * and `outline-none` at a call site does not remove it. MEASURED in Chromium
 * against the real tokens, both themes.
 */
const RING = 4

/** `rgb(…)` / `rgba(…)` to channels and alpha. Alpha defaults to 1, as CSS does. */
function parse(css: string): { rgb: number[]; alpha: number } {
  const m = /rgba?\(([^)]+)\)/.exec(css)
  if (!m) throw new Error(`not a colour: ${css}`)
  const parts = m[1]!
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map((n) => parseFloat(n))
  if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
    // Never report a verdict computed from something we could not read.
    throw new Error(`could not parse a colour from: ${css}`)
  }
  return { rgb: parts.slice(0, 3), alpha: parts.length > 3 ? parts[3]! : 1 }
}

for (const theme of ['light', 'dark'] as const) {
  // `signedIn` is destructured and deliberately unused: Playwright runs a
  // fixture only if the test ASKS for it, so without this the palette would be
  // measured on /sign-in, where it does not exist. `signed-in-fixture.test.ts`
  // caught exactly that here, which is the second time that rule has paid.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  test(`the command palette is legible over the page · ${theme} @smoke`, async ({
    page,
    signedIn,
  }) => {
    // Destructured to activate the fixture; `void` because the value itself is unused.
    void signedIn
    await page.addInitScript((t) => {
      try {
        window.localStorage.setItem('sahoda-theme', t as string)
      } catch {
        /* storage disabled: the emulated scheme is then the only signal */
      }
    }, theme)
    await page.emulateMedia({ colorScheme: theme })

    await bootstrapWorkspace(page)
    await leaveOnboarding(page)
    await page.goto('/home')
    await dismissPlanOffer(page)

    const viewport = page.viewportSize()!
    // A fixed point well away from where the panel will open, so the only thing
    // that changes there is the scrim.
    const probeX = Math.round(viewport.width * 0.5)
    const probeY = Math.round(viewport.height * 0.88)

    const sample = async (): Promise<{ page: number; img: ReturnType<typeof decodePng> }> => {
      const img = decodePng(await page.screenshot({ type: 'png' }))
      const dpr = img.width / viewport.width
      return { page: luminanceAt(img, probeX * dpr, probeY * dpr) / 1000, img }
    }

    const before = await sample()

    await page.getByRole('button', { name: 'Search Sahoda' }).click()
    const dialog = page.getByRole('dialog', { name: 'Search Sahoda' })
    await expect(dialog).toBeVisible()

    const after = await sample()

    // ── 1 · OPENING THE PALETTE DARKENS THE PAGE ─────────────────────────────
    // The assertion the `bg-ink/30` bug fails, and the reason it is written as a
    // DIRECTION rather than a colour: `--ink` is the theme's foreground, so the
    // old overlay dimmed on light and LIT the page on dark — rgb(13) to rgb(86),
    // a 23x luminance lift — while reading, in the diff, exactly like a scrim.
    expect(
      after.page,
      `opening the palette must darken the page in ${theme}, not light it: ` +
        `luminance ${before.page.toFixed(3)} -> ${after.page.toFixed(3)}`,
    ).toBeLessThan(before.page)

    // ── 2 · THE PANEL IS NEVER DARKER THAN THE PAGE BENEATH IT ───────────────
    // Not a contrast floor — see the header. This catches INVERTED elevation: a
    // sheet darker than the page reads as a hole, and no edge or shadow recovers
    // it. Under the old scrim the dark palette was exactly that.
    const panelBox = (await dialog.boundingBox())!
    const dpr = after.img.width / viewport.width
    const midY = panelBox.y + panelBox.height / 2
    const panelL =
      luminanceAt(after.img, (panelBox.x + panelBox.width / 2) * dpr, midY * dpr) / 1000
    // Well clear of the panel's own edge and its shadow, which falls off within
    // ~24px (--sh-lg carries 24px of blur).
    const besideL = luminanceAt(after.img, (panelBox.x - 60) * dpr, midY * dpr) / 1000

    expect(
      panelL,
      `the panel must sit ABOVE the page in ${theme}: panel ${panelL.toFixed(3)}, ` +
        `page beside it ${besideL.toFixed(3)}`,
    ).toBeGreaterThan(besideL)

    // ── 3 · THE PANEL OPENS UNDER THE FIELD THAT OPENED IT ───────────────────
    // The defect two earlier passes could not see, because both measured the
    // panel against ITSELF — its scrim, its fill, its ring against its own corner
    // — and never against the trigger. MEASURED at 1920 with the rail expanded:
    // the trigger centred at x=1061 and the panel at x=960, 101px apart, because
    // the overlay centres on the VIEWPORT and the trigger on the CONTENT COLUMN.
    //
    // Asserted only where the trigger is actually on screen: it carries
    // `max-narrow:hidden`, and below that width there is nothing to align to.
    const trigger = page.getByRole('button', { name: 'Search Sahoda' })
    if (await trigger.isVisible()) {
      const triggerBox = (await trigger.boundingBox())!
      const triggerCx = triggerBox.x + triggerBox.width / 2
      const panelCx = panelBox.x + panelBox.width / 2
      expect(
        Math.abs(panelCx - triggerCx),
        `the palette must open under its own trigger in ${theme}: trigger centre ` +
          `${triggerCx.toFixed(0)}, panel centre ${panelCx.toFixed(0)}`,
      ).toBeLessThanOrEqual(1)
    }

    // ── 4 · THE FOCUS RING STAYS INSIDE THE PANEL ────────────────────────────
    const field = page.getByRole('textbox', { name: 'Search destinations' })
    await field.focus()
    const fieldBox = (await field.boundingBox())!
    const radius = parseFloat(
      await dialog.evaluate((el) => getComputedStyle(el).borderTopLeftRadius),
    )

    // Clearing the panel's bounding box is NOT enough: `--r-xl` is 28px, so a
    // ring that stops level with the top edge still cuts across the corner arc.
    // At `rightInside` px in from the right edge, the panel's own top edge sits
    // `arc` px down, and the ring has to start below that.
    const topInside = fieldBox.y - RING - panelBox.y
    const rightInside = panelBox.x + panelBox.width - (fieldBox.x + fieldBox.width + RING)
    const dx = Math.min(rightInside, radius)
    const arc = radius - Math.sqrt(Math.max(0, radius * radius - (radius - dx) * (radius - dx)))

    expect(rightInside, 'the focus ring crosses the panel’s right edge').toBeGreaterThanOrEqual(0)
    expect(
      topInside,
      `the focus ring cuts the panel's ${radius}px corner in ${theme}: it starts ` +
        `${topInside.toFixed(1)}px inside the top and ${rightInside.toFixed(1)}px inside the ` +
        `right, where the corner needs ${arc.toFixed(1)}px`,
    ).toBeGreaterThanOrEqual(arc)

    // And the ring is genuinely painted — if the global rule were ever layered
    // or overridden, the geometry above would be measuring nothing.
    const ring = await field.evaluate((el) => {
      const cs = getComputedStyle(el)
      return { width: cs.outlineWidth, style: cs.outlineStyle, shadow: cs.boxShadow }
    })
    expect(
      parseFloat(ring.width) > 0 && ring.style !== 'none',
      `the palette's field should carry the global focus ring, got ${JSON.stringify(ring)}`,
    ).toBe(true)

    // ── 5 · THE SCRIM IS TRANSLUCENT ─────────────────────────────────────────
    // An opaque `fixed inset-0` fill is the black rectangle this was reported
    // as. Chromium supports `color-mix`, so this reads the SUPPORTED value and
    // cannot see the no-color-mix fallback rule; `palette-scrim.test.ts` covers
    // that half by reading the authored class.
    const scrim = parse(
      await page
        .locator('[data-palette-overlay]')
        .evaluate((el) => getComputedStyle(el).backgroundColor),
    )
    expect(scrim.alpha, 'the scrim must be translucent').toBeLessThan(0.95)
    expect(scrim.alpha, 'the scrim must actually dim').toBeGreaterThan(0.2)
  })
}
