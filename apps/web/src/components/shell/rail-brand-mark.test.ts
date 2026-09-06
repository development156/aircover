import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * THE RAIL'S MARK MUST NOT BE A FIXED-COLOUR ASSET.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * The rail carries `data-surface="inverse"`, and that scope serves the LIGHT
 * ladder under `[data-theme='dark']`. So the panel is #171717 on a light page
 * and #ffffff on a dark one. It rendered `logo-white.png`, chosen when the
 * file's own comment promised a panel that was "dark in both themes", and on
 * the day the scope changed the mark went white on white and disappeared
 * entirely. MEASURED from a founder screenshot, 2026-09-06: rail visible,
 * logo absent.
 *
 * A `dark:hidden` PAIR of PNGs is the wrong fix here and is worth naming,
 * because it is the pattern used correctly two doors away. `not-found.tsx` and
 * `(auth)/layout.tsx` both pair `logo-dark` with `logo-white` against the PAGE
 * theme, and that is right for them: those pages follow the page. This one does
 * not. Inside the inverse scope the `dark:` variant tracks the page while the
 * surface tracks its opposite, so the pair would be inverted at every width and
 * in every theme, which is the same bug wearing a fix.
 *
 * The mark is a mask with a TOKEN fill instead. Founder's ruling, 2026-09-06:
 * it wears the brand colour, matching the tab icon.
 *
 * ── WHAT IT CANNOT SEE, STATED SO NOBODY READS SILENCE AS COVERAGE ──────────
 *  · It reads ONE file as text. A brand asset introduced by a child component,
 *    a re-export, a dynamic `src` built from a variable, or a second rail
 *    written from scratch would all pass it.
 *  · It cannot see a rendered pixel, so it cannot tell you the mark is legible,
 *    only that its colour comes from a token rather than from the file.
 *  · It does not check the OTHER two mounts. Those are correct today for the
 *    reason above, and a guard that lumped all three together would force the
 *    wrong fix on the two that follow the page.
 */
const RAIL = readFileSync(join(process.cwd(), 'src/components/shell/rail.tsx'), 'utf8')

/** The `<Link>` that wraps the mark, through to the end of its element. */
function brandBlock(): string {
  const at = RAIL.indexOf('aria-label="Sahoda, go to Home"')
  expect(at, 'the rail must still carry a home link named for the brand').toBeGreaterThan(-1)
  const close = RAIL.indexOf('</Link>', at)
  expect(close, 'the brand link must be closed').toBeGreaterThan(at)
  return RAIL.slice(at, close)
}

describe("the rail's brand mark", () => {
  it('does not render a fixed-colour brand asset as an image', () => {
    const block = brandBlock()
    // The asset may still be NAMED here, because its alpha channel is the mask.
    // What must not happen is it being PAINTED, which is what an <Image> or an
    // <img> does: those show the file's own pixels, and the file is one colour.
    expect(block).not.toMatch(/<Image\b/)
    expect(block).not.toMatch(/<img\b/)
  })

  it('takes its colour from a token, so it is correct on either ladder', () => {
    const block = brandBlock()
    expect(block).toMatch(/maskImage/)
    expect(block).toMatch(/bg-accent/)
  })

  it('states the rail is the page opposite, never that it is dark in both themes', () => {
    // The stale claim is what chose the white asset. It is cheap to assert that
    // the sentence never comes back, and it is the sentence, not the CSS, that
    // the next person will act on.
    expect(RAIL).not.toMatch(/dark in both themes/i)
  })
})
