import { expect, test } from './fixtures/seeded-user'
import { bootstrapWorkspace } from './fixtures/compose'

/**
 * /CONNECTIONS, MEASURED AT THE WIDTHS NOBODY SAMPLES.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * The channel header put a fixed-width readiness chip and a variable-width
 * channel name in one row, and gave the name `truncate`. So the fixed thing was
 * paid for by the variable one, silently: at 1440 "Google Business Profile"
 * needed 147px of a 88px slot and rendered "Google Busi…", and at 1180 — where
 * the grid goes to four columns while the rail is STILL 232px wide — four names
 * were clipped at once.
 *
 * ── WHY SEVEN WIDTHS ─────────────────────────────────────────────────────────
 * Two widths is not responsive; it is two screenshots. The regression pass that
 * shipped this bug ran 1440 and 390, and both are clean for the WIDEST tile and
 * the SINGLE-column tile respectively. The two pinch bands live between them:
 *
 *   1180  the grid is 4 columns and the rail has not collapsed yet — 181px tiles
 *    700  the grid drops to 2 columns while the collapsed rail still costs 64px
 *
 * ── WHY THIS CANNOT BE A TEXT ASSERTION ──────────────────────────────────────
 * `text-overflow: ellipsis` changes no DOM. `innerText` still reads "Google
 * Business Profile" while the pixels read "Google Busi…", which is why the
 * text-reading guard next door has never fired on this. It cannot be a jsdom
 * test either — there is no layout there to overflow.
 *
 * ── WHY THE NAME IS CHECKED FOR OVERFLOW AND NEVER FOR LINE COUNT ────────────
 * At 1180 the repaired name has ~4px of slack against a font this runner may not
 * match byte for byte. If that slack ever goes, the name wraps to a second line
 * — nothing is lost and nobody is misled. Losing characters is the defect; using
 * two lines is not. The `kind` beneath it is the opposite case: it carries no
 * `truncate`, so it never clips — it wraps, or it paints outside its own box.
 */

/** Seven, and the two nobody samples are the point. */
const WIDTHS = [390, 700, 768, 1024, 1180, 1280, 1440] as const

/**
 * A TILE, NOT A MARK. `ChannelLogo` carries `data-channel` too, so a bare
 * `[data-channel]` matched 14 elements on this page: eight tiles plus the six
 * channel marks that render as an image rather than a drawn SVG. Only the two
 * tile shapes carry `data-connected`, and both of them do.
 */
const TILE = '[data-channel][data-connected]'

/** Every channel in the catalogue gets a tile, built or not. Zero tiles is the
 *  other way this page renders (no workspace, or a failed read), and a suite
 *  that loops over zero tiles is green for the wrong reason. */
const TILES = 8

/**
 * What counts as a defect, evaluated in the page. Kept as a string — an arrow
 * function taking the root to search — so the SAME source runs against the app
 * and against the self-test fixture below.
 */
const DETECTOR = `((root) => {
  if (!root) return ['no root element to search']
  // Real rendered line count, from the text node's client rects. NOT
  // height / line-height: padding and a taller inline child make a one-line
  // element report 2.2 "lines".
  const lines = (el) => {
    const tn = Array.from(el.childNodes).find((n) => n.nodeType === 3 && n.textContent.trim())
    if (!tn) return 0
    const rg = document.createRange()
    rg.selectNodeContents(tn)
    const rects = Array.from(rg.getClientRects()).filter((r) => r.width > 0 && r.height > 0)
    return new Set(rects.map((r) => Math.round(r.top))).size
  }
  const out = []
  for (const tile of root.querySelectorAll('[data-channel][data-connected]')) {
    const id = tile.getAttribute('data-channel')
    const name = tile.querySelector('p.type-h3')
    const kind = tile.querySelector('p.type-eyebrow')
    if (!name || !kind) {
      out.push(\`\${id}: the header is missing its name or its kind\`)
      continue
    }
    // THE NAME — overflow only. A clipped name has lost characters.
    if (name.scrollWidth > name.clientWidth + 1) {
      out.push(
        \`\${id}: name "\${name.textContent}" needs \${name.scrollWidth}px and has \${name.clientWidth}px\`,
      )
    }
    // THE KIND — overflow AND line count, because it can fail either way.
    if (kind.scrollWidth > kind.clientWidth + 1) {
      out.push(
        \`\${id}: kind "\${kind.textContent}" paints \${kind.scrollWidth - kind.clientWidth}px outside its slot\`,
      )
    }
    if (lines(kind) > 1) {
      out.push(\`\${id}: kind "\${kind.textContent}" wrapped to \${lines(kind)} lines\`)
    }
  }
  return out
})`

test.describe('connections names survive every width @smoke', () => {
  test.slow()

  /**
   * THE DETECTOR MUST BE ABLE TO FAIL. A guard that quietly stops detecting is
   * worse than no guard: it reports green forever. This builds one clipped
   * name, one wrapped kind, one kind painting outside its slot and one header
   * that fits, and asserts the detector finds exactly the first three.
   */
  test('the detector itself still detects', async ({ page }) => {
    await page.goto('/sign-in')
    const found = (await page.evaluate(`(() => {
      const host = document.createElement('div')
      host.id = 'detector-fixture'
      host.style.cssText = 'position:fixed;top:0;left:0;font:14px sans-serif'
      const tile = (id, name, kind) =>
        \`<div data-channel="\${id}" data-connected="false">\${name}\${kind}</div>\`
      host.innerHTML =
        // A name that has lost characters.
        tile(
          'clipped',
          '<p class="type-h3" style="width:40px;overflow:hidden;white-space:nowrap">Google Business Profile</p>',
          '<p class="type-eyebrow" style="white-space:nowrap">Feed</p>',
        ) +
        // A kind on two lines. Wide enough that no single word overflows, so
        // this fixture exercises the line count and nothing else.
        tile(
          'wrapped',
          '<p class="type-h3" style="white-space:nowrap">X</p>',
          '<p class="type-eyebrow" style="width:70px">Local listing</p>',
        ) +
        // A kind painting outside its slot, which neither of the above catches.
        tile(
          'outside',
          '<p class="type-h3" style="white-space:nowrap">Telegram</p>',
          '<p class="type-eyebrow" style="width:20px;white-space:nowrap">BROADCAST</p>',
        ) +
        // And one that is simply fine.
        tile(
          'fits',
          '<p class="type-h3" style="white-space:nowrap">X</p>',
          '<p class="type-eyebrow" style="white-space:nowrap">Feed</p>',
        )
      document.body.appendChild(host)
      const hits = ${DETECTOR}(host)
      host.remove()
      return hits
    })()`)) as string[]

    // Matched by tile id, never by wording, so the message can be rewritten.
    expect(found.filter((h) => h.startsWith('clipped:')).length).toBe(1)
    expect(found.filter((h) => h.startsWith('wrapped:')).length).toBe(1)
    expect(found.filter((h) => h.startsWith('outside:')).length).toBe(1)
    expect(found.filter((h) => h.startsWith('fits:'))).toEqual([])
  })

  test('every channel name and kind renders whole, at seven widths', async ({ page, signedIn }) => {
    void signedIn
    test.setTimeout(10 * 60_000)

    // MANDATORY. `signedIn` seeds an account with NO workspace, and without this
    // /connections renders the "Create a workspace" empty state: zero tiles, and
    // every assertion below is vacuously true.
    await bootstrapWorkspace(page)

    // EVERY WIDTH IS VISITED BEFORE ANYTHING IS ASSERTED. Failing at the first
    // bad width would report one pinch band and hide the other three, and this
    // bug is exactly the shape that gets "fixed" one width at a time.
    const findings: string[] = []

    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 })
      await page.goto('/connections')
      await expect(page.locator('#main')).toBeVisible({ timeout: 30_000 })

      // The guard that makes everything after it mean something. It also covers
      // the failed-read branch, which is the other zero-tile render.
      await expect(
        page.locator(`#main ${TILE}`),
        `width ${width}: every channel in the catalogue has a tile`,
      ).toHaveCount(TILES)

      const hits = (await page.evaluate(`${DETECTOR}(document.querySelector('#main'))`)) as string[]
      findings.push(...hits.map((hit) => `${width}px  ${hit}`))

      // THE OTHER HALF OF THE SAME BUG. The cure for a clipped label is
      // `nowrap` plus `shrink-0`, and applied inside a row that is already full
      // it stops the clipping by pushing the page sideways instead. Collecting
      // both means neither can be bought with the other.
      const doc = await page.evaluate(() => ({
        scrollW: document.documentElement.scrollWidth,
        innerW: window.innerWidth,
      }))
      if (doc.scrollW > doc.innerW + 1) {
        findings.push(
          `${width}px  the page scrolls sideways (${doc.scrollW}px of content in ${doc.innerW}px) ` +
            `— a nowrap fix has pushed a row wider than the screen; carry fewer things instead`,
        )
      }
    }

    expect(
      findings,
      `Channel labels that did not survive their tile:\n  ${findings.join('\n  ')}`,
    ).toEqual([])
  })
})
