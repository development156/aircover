import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * Q-08 — THE PHONE TOUCH FLOOR, IN THE ONE STYLESHEET NOTHING ELSE READS.
 *
 * `styles/onboarding.css` is a plain stylesheet, not Tailwind, so jsdom never
 * loads it and no component-render test can see what it resolves to — proven
 * by `what-step.test.tsx`'s own comment on `.ai.hide`. The only place left to
 * assert a rule in this file is the file itself, the same move
 * `tonal-ladder.test.ts` makes for `tokens.css`.
 *
 * MEASURED at 390px (docs/51_Full_App_Audit_2026-09-05.md, Q-08): "Save & exit"
 * 98×28, "Build my Brand Brain" / Continue / Back 265×38 and 75×38, and the
 * `.chip` picks (business type on step 02; Website / Instagram / Google
 * Business Profile on the rivals step) at 39px — all under the product's 44px
 * phone touch floor (docs/workflow/01_CONTEXT.md).
 *
 * WHAT THIS CANNOT SEE: a real rendered pixel. It reads the declared
 * `min-height` inside the ONE mobile media query these four selectors are
 * styled under and nothing about specificity, load order, or a later rule
 * overriding it. That gap is why the phone floor is also exercised live, for
 * the controls that share it with the rest of the app, in
 * `e2e/ux-j5-phone.spec.ts` and `e2e/connections-honesty.spec.ts`.
 */

const CSS_PATH = fileURLToPath(new URL('./onboarding.css', import.meta.url))
const FLOOR = 44

/** The stylesheet's own mobile boundary — see the block's own header comment:
 *  "Rebuilt, not shrunk (§24)." There is no 700px rule in this file; the
 *  product's `narrow` breakpoint belongs to `globals.css`/Tailwind, and this
 *  sheet draws its phone layout entirely under 960px. */
const MEDIA_960 = '@media (max-width: 960px)'

/** Extracts one `@media` block's BODY by counting braces, so a selector that
 *  merely appears inside a later, unrelated block cannot be mistaken for
 *  membership in this one — the trap a naive `indexOf('}')` walks into on the
 *  first nested rule. */
function mediaBlockBody(css: string, openerText: string): string {
  const start = css.indexOf(openerText)
  if (start === -1) throw new Error(`media query not found: ${openerText}`)
  const braceOpen = css.indexOf('{', start)
  let depth = 1
  let i = braceOpen + 1
  while (depth > 0 && i < css.length) {
    if (css[i] === '{') depth += 1
    else if (css[i] === '}') depth -= 1
    i += 1
  }
  return css.slice(braceOpen + 1, i - 1)
}

/** The declared `min-height` (or `height`, which `min-height` overrides
 *  upward — used height is clamped to whichever of the two is larger) for one
 *  selector inside a block body, in px. `null` when the selector carries
 *  neither. */
function declaredFloorPx(blockBody: string, selector: string): number | null {
  // Matches "<selector> {" possibly grouped with sibling selectors by a comma
  // on the line above or below it, which is how this stylesheet writes every
  // rule these four controls share.
  const escaped = selector.replace(/[.[\]]/g, '\\$&')
  const ruleRe = new RegExp(`(?:^|[,{}]|\\s)${escaped}\\s*[,{]`)
  const match = ruleRe.exec(blockBody)
  if (!match) return null
  const braceStart = blockBody.indexOf('{', match.index)
  const braceEnd = blockBody.indexOf('}', braceStart)
  const body = blockBody.slice(braceStart + 1, braceEnd)
  const minHeight = /min-height:\s*(\d+(?:\.\d+)?)px/.exec(body)
  if (minHeight) return Number(minHeight[1])
  const height = /(?<!min-)height:\s*(\d+(?:\.\d+)?)px/.exec(body)
  return height ? Number(height[1]) : null
}

describe('onboarding.css: the phone touch floor (Q-08)', () => {
  const css = readFileSync(CSS_PATH, 'utf8')
  const mobile = mediaBlockBody(css, MEDIA_960)

  it.each([
    ['.cta-row .btn', 'Continue / Build my Brand Brain'],
    ['.cta-row .btn--ghost', 'Back / Skip for now'],
    ['.nav__exit', 'Save & exit'],
    ['.chip', 'the business-type and competitor-kind picks'],
  ])('%s (%s) reaches 44px under the mobile breakpoint', (selector) => {
    const px = declaredFloorPx(mobile, selector)
    expect(px, `${selector} declares no height at all inside ${MEDIA_960}`).not.toBeNull()
    expect(px!).toBeGreaterThanOrEqual(FLOOR)
  })
})
