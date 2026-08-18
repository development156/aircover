import { expect, test } from './fixtures/seeded-user'

/**
 * The shrinking-flex-item guard.
 *
 * ── THE BUG CLASS THIS EXISTS FOR ────────────────────────────────────────────
 * A flex item shrinks below its content by default. When every sibling in a row
 * is `flex-none` and one text-bearing child is not, that child absorbs all the
 * shrink and its label is clipped or wrapped. It has happened three times:
 *
 *   run 8   the topbar chips rendered "S Sah", and "No brain yet" wrapped to
 *           THREE lines at 768px, bursting a 56px header
 *   run 19  the planner's month label wrapped to "August" / "2026"
 *
 * Every numeric check passed on all three. Widths were measured, heights were
 * measured, overflow was measured — and the text was wrong. The only thing that
 * catches this is reading what actually rendered, which is what this does.
 *
 * ── WHY 390px ────────────────────────────────────────────────────────────────
 * It is the narrowest width the product supports and the primary surface for
 * these users, so it is where the squeeze is worst. A label that fits here fits
 * everywhere.
 *
 * ── WHY IT RUNS AGAINST A FRESH ACCOUNT ──────────────────────────────────────
 * `signedIn` seeds an account with NO workspace, which is exactly the state that
 * produced the run-8 regression: "No brain yet" and "No wallet yet" are
 * no-workspace strings, and they are the longest labels those two chips ever
 * render. The empty state is the worst case for this bug, not the easy one.
 */

/** What counts as a defect, evaluated in the page. Kept as a string so the same
 *  source runs both against the app and against the self-test fixture below. */
const DETECTOR = `(() => {
  const hits = []
  const isHidden = (e) => {
    const cs = getComputedStyle(e)
    const b = e.getBoundingClientRect()
    // sr-only text is 1px and overflowing BY DESIGN — that is how visually
    // hidden labels work, and counting it would make every page fail.
    return b.width <= 1 || b.height <= 1 || cs.visibility === 'hidden'
      || /inset\\(50%\\)/.test(cs.clipPath) || String(e.className).includes('sr-only')
  }
  // Real rendered line count, from the text node's client rects. NOT
  // height / line-height: an inline-flex control with an icon and padding
  // reports 2.2 "lines" while rendering one, which is how a naive version of
  // this check produced 142 false positives.
  const lineCount = (e) => {
    const tn = Array.from(e.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim())
    if (!tn) return 0
    const rg = document.createRange()
    rg.selectNodeContents(tn)
    const rects = Array.from(rg.getClientRects()).filter((r) => r.height > 0 && r.width > 0)
    return new Set(rects.map((r) => Math.round(r.top))).size
  }
  for (const e of document.querySelectorAll('body *')) {
    if (isHidden(e)) continue
    const cs = getComputedStyle(e)
    const cls = String(e.className)
    const own = Array.from(e.childNodes).filter((n) => n.nodeType === 3)
      .map((n) => n.textContent).join('').trim()
    if (!own) continue
    // An explicit truncate/line-clamp is a DECISION — a long brand-voice value
    // or a workspace name in a 7ch slot is meant to end in an ellipsis. Only
    // unintended clipping is a defect.
    if (!/truncate|line-clamp|text-ellipsis/.test(cls)
        && e.scrollWidth > e.clientWidth + 1
        && /hidden|clip/.test(cs.overflowX)) {
      hits.push({ kind: 'CLIPPED', tag: e.tagName, cls: cls.slice(0, 60), text: own.slice(0, 60) })
    }
    // A one- or two-word label has no business being on two lines.
    const words = own.split(/\\s+/).filter(Boolean)
    if (words.length <= 2 && own.length <= 22 && cs.whiteSpace !== 'nowrap' && lineCount(e) >= 2) {
      hits.push({ kind: 'WRAPPED', tag: e.tagName, cls: cls.slice(0, 60), text: own.slice(0, 60) })
    }
  }
  return hits
})()`

/**
 * Reachable with a seeded account that has no workspace yet.
 *
 * The four /settings tabs joined this list when the overflow half of it caught a
 * real one: a 48-character sign-in address ran /settings/profile 3px past the
 * viewport at 390px and the page scrolled sideways. The row's control slot was
 * `flex-none` and the slot holds customer data. Only /settings itself was
 * covered, and the address lives on /settings/profile — so the guard was one
 * route short of the bug for four passes.
 */
const ROUTES = [
  '/home',
  '/posts',
  '/planner',
  '/wallet',
  '/settings',
  '/settings/profile',
  '/settings/plan',
  '/settings/integrations',
  '/connections',
  '/inbox',
]

test.describe('no truncated labels at 390px @smoke', () => {
  /**
   * The detector must be able to FAIL. A guard that silently stops detecting is
   * worse than no guard, because it reports green forever. This builds one
   * clipped label, one wrapped label and one that fits, and asserts the detector
   * finds exactly the first two.
   */
  test('the detector itself still detects', async ({ page }) => {
    await page.goto('/sign-in')
    const result = await page.evaluate(`(() => {
      const host = document.createElement('div')
      host.style.cssText = 'position:fixed;top:0;left:0;z-index:99999'
      host.innerHTML =
        '<div style="display:flex;width:120px">' +
        '<span id="t-clip" style="overflow:hidden;white-space:nowrap;width:40px">Reschedule</span></div>' +
        '<div style="display:flex;width:60px"><span id="t-wrap">Plan week</span></div>' +
        '<div style="display:flex;width:300px"><span id="t-ok" style="white-space:nowrap">Approve</span></div>'
      document.body.appendChild(host)
      const hits = ${DETECTOR}
      host.remove()
      return hits
    })()`)

    const found = result as Array<{ kind: string; text: string }>
    expect(found.some((h) => h.kind === 'CLIPPED' && h.text === 'Reschedule')).toBe(true)
    expect(found.some((h) => h.kind === 'WRAPPED' && h.text === 'Plan week')).toBe(true)
    expect(found.some((h) => h.text === 'Approve')).toBe(false)
  })

  for (const route of ROUTES) {
    test(`${route} renders every label in full`, async ({ page, signedIn }) => {
      expect(signedIn).toBeTruthy()
      await page.setViewportSize({ width: 390, height: 844 })
      await page.goto(route)
      // Settle: chips read the workspace, balance and brain before they size.
      await page.waitForLoadState('networkidle')

      const hits = (await page.evaluate(DETECTOR)) as Array<{
        kind: string
        tag: string
        cls: string
        text: string
      }>

      // The message is the whole point — it names the text that did not fit, so
      // the next person does not have to re-derive it from a screenshot.
      const report = hits.map((h) => `  ${h.kind} <${h.tag}> "${h.text}"  [${h.cls}]`).join('\n')
      expect(hits, `Truncated or wrapped labels at 390px on ${route}:\n${report}`).toEqual([])

      // The OTHER half of the same bug. The cure for a wrapping label is
      // `whitespace-nowrap` plus `shrink-0`, and applied to every item in a row
      // that is already full it stops the wrap by pushing the row off-screen
      // instead. Run 13's lesson: fix by carrying FEWER things, not smaller ones.
      // Asserting both here means neither fix can be made by causing the other.
      const overflow = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }))
      expect(
        overflow.scrollW,
        `${route} scrolls horizontally at 390px (${overflow.scrollW}px of content). ` +
          `A nowrap/shrink-0 fix has pushed the row wider than the screen — carry fewer items instead.`,
      ).toBeLessThanOrEqual(overflow.innerW + 1)
    })
  }
})

/**
 * THE OTHER HALF OF THE SAME BUG, WHICH NEITHER CHECK ABOVE COULD SEE.
 *
 * The CLIPPED check needs `overflow: hidden`; the WRAPPED check needs two lines;
 * the page-overflow check needs the document to grow. A control that paints
 * OUTSIDE its own slot, under the sibling drawn after it, trips none of them —
 * the boxes are all the size they claim to be and the document never widens.
 *
 * MEASURED on a seeded account with no workspace: the switcher's slot was 105px
 * and "Create workspace" inside it 164px, because the slot carried `min-w-0` and
 * the button `shrink-0`. The credit pill covered 51px of that button at 390px,
 * 11px at 430px, and the command palette 52px of it at 700px. The screenshot read
 * "Create work" with a pill sitting on the rest of the word.
 *
 * Both assertions together, because each fix is the other's failure mode: end the
 * overlap by refusing to shrink and the avatar goes 45px off-screen instead
 * (measured, at 390px, when only the slot was fixed). Neither may be bought with
 * the other.
 *
 * 700px is in the list on purpose — it is the `narrow` breakpoint, where the
 * command palette appears and the row gains an item.
 */
test.describe('the topbar controls neither overlap nor leave the screen @smoke', () => {
  for (const width of [390, 430, 700, 1440]) {
    test(`topbar at ${width}px`, async ({ page, signedIn }) => {
      expect(signedIn).toBeTruthy()
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/home')
      await page.waitForLoadState('networkidle')

      const geometry = await page.evaluate(() => {
        const controls = [
          ...document.querySelectorAll('header button, header a, header [role="status"]'),
        ]
          .filter((e) => {
            const cs = getComputedStyle(e)
            // Run 22's retraction: a display:none child reports x:0 right:0 w:0
            // and "overlaps" everything. Only painted boxes are compared.
            return (
              cs.display !== 'none' &&
              cs.visibility !== 'hidden' &&
              e.getBoundingClientRect().width > 0
            )
          })
          .map((e) => {
            const r = e.getBoundingClientRect()
            return {
              label:
                (e as HTMLElement).innerText.replace(/\s+/g, ' ').trim().slice(0, 24) || e.tagName,
              x: Math.round(r.x),
              right: Math.round(r.right),
            }
          })
          .sort((a, b) => a.x - b.x)

        const overlaps: string[] = []
        for (let i = 0; i < controls.length - 1; i++) {
          const a = controls[i]!
          const b = controls[i + 1]!
          if (a.right > b.x + 0.5) {
            overlaps.push(`"${a.label}" ends at ${a.right}, "${b.label}" starts at ${b.x}`)
          }
        }
        return {
          overlaps,
          pastEdge: controls
            .filter((c) => c.right > window.innerWidth + 1)
            .map((c) => `"${c.label}" ends at ${c.right} in a ${window.innerWidth}px viewport`),
        }
      })

      expect(
        geometry.overlaps,
        `Topbar controls overlap at ${width}px — one is painting outside its own slot:\n  ${geometry.overlaps.join('\n  ')}`,
      ).toEqual([])
      expect(
        geometry.pastEdge,
        `Topbar controls sit off-screen at ${width}px. Carry FEWER things, not smaller ones:\n  ${geometry.pastEdge.join('\n  ')}`,
      ).toEqual([])
    })
  }
})
