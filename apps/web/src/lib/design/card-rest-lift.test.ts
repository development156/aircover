import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * THE RESTING CARD'S LIFT, AND THE HAIRLINE IT MUST NOT COST.
 *
 * Founder's ruling, 2026-09-03: container cards sit slightly above the white
 * page. `--sh-rest` is `0 4px 18px rgba(0, 0, 0, 0.05)` in light and OFF in
 * dark and in the inverse scope.
 *
 * ── THE DEFECT THIS EXISTS TO STOP, WHICH HAD ALREADY HAPPENED ───────────────
 * `box-shadow` is ONE property. Two utility classes both setting it do not
 * combine: the rule emitted later in the stylesheet wins outright, and both are
 * single-class selectors so specificity never breaks the tie.
 *
 * `home/section.tsx` carried `surface-ring rounded-card bg-surface shadow-card`
 * for its whole life. MEASURED in the compiled output before this change:
 * `.shadow-card` at line 3009, `.surface-ring` at line 3045. The ring won and
 * **the shadow half painted nothing on the dashboard, silently, for months.**
 * Nobody noticed because the intended shadow was `0 1px 2px rgba(0,0,0,0.03)`,
 * which is invisible whether it renders or not — but the mechanism is general,
 * and at 18px of diffusion it stops being invisible.
 *
 * So the two layers are authored together in one declaration, and this asserts
 * that they stay that way. The regression is somebody "tidying" the utility
 * into `surface-ring` plus a shadow class again, which looks equivalent, reads
 * equivalent in a diff, and silently drops one of the two.
 *
 * ── AND WHAT MUST NOT GET IT ────────────────────────────────────────────────
 * The brief excludes buttons, icons, navigation and small elements by name.
 * `Tile` is a `<button>` and keeps the plain ring; so do the 8px rows inside
 * `needs-attention.tsx` and `rail-cards.tsx`. The line is `rounded-card` for a
 * container and `rounded-[8px]` for something living inside one.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · WHETHER IT LOOKS RIGHT. It reads authored text. A 40px black shadow would
 *    satisfy every assertion here as long as it were one declaration; only a
 *    person looking at a rendered card can say the weight is right.
 *  · The CASCADE it is reasoning about. It asserts the fix (one declaration),
 *    not the fact that two declarations would collide — that was measured once,
 *    in a compiled stylesheet, and is recorded above rather than re-proven.
 *  · Any OTHER element that grows a shadow. It checks four named files. A fifth
 *    component pairing `surface-ring-lift` with a chip or an icon is invisible
 *    here, as is a raw `shadow-[...]` written inline anywhere.
 *  · Runtime. `--sh-rest` could be overridden by a Brand Skin at run time and
 *    nothing in this file would know.
 */
const WEB = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const REPO = resolve(WEB, '../..')

const globals = readFileSync(join(WEB, 'src/app/globals.css'), 'utf8')
const tokens = readFileSync(join(REPO, 'packages/shared/tokens.css'), 'utf8')

/** The authored body of `@utility <name>`, braces stripped. */
function utility(name: string): string {
  const at = globals.indexOf(`@utility ${name} {`)
  expect(at, `@utility ${name} is not declared`).toBeGreaterThan(-1)
  const open = globals.indexOf('{', at)
  const close = globals.indexOf('}', open)
  return globals.slice(open + 1, close)
}

describe('the token', () => {
  test('carries the founder value in light, to the digit', () => {
    // Written out rather than pattern-matched: this is a value a person chose,
    // and a regex would accept a different one.
    expect(tokens).toContain('--sh-rest: 0 4px 18px rgba(0, 0, 0, 0.05);')
  })

  test('is switched OFF in dark and in the inverse scope, in both places', () => {
    // Two scopes define the dark ladder: `[data-theme='dark']` and
    // `[data-surface='inverse']`. Missing either leaves a soft black bloom on a
    // near-black ground in one of them, which is the harder half to notice.
    const off = tokens.match(/--sh-rest:\s*0 0 rgba\(0, 0, 0, 0\);/g) ?? []
    expect(off).toHaveLength(2)
  })
})

describe('the utility', () => {
  const body = utility('surface-ring-lift')

  test('emits the hairline and the lift as ONE box-shadow', () => {
    // THE REGRESSION THIS PINS. Splitting these into two declarations, or into
    // two classes at the call site, drops one of them with no error anywhere.
    expect(body.match(/box-shadow\s*:/g) ?? []).toHaveLength(1)
    expect(body).toMatch(/inset 0 0 0 1px var\(--line-soft\)/)
    expect(body).toMatch(/var\(--sh-rest\)/)
  })

  test('keeps the hairline identical to the plain ring it replaces', () => {
    // The lift is additive. If the inset half drifts, dark loses the only edge
    // it has, and this change was supposed to touch the light theme alone.
    const plain = utility('surface-ring')
    const inset = /inset 0 0 0 1px var\(--line-soft\)/
    expect(plain).toMatch(inset)
    expect(body).toMatch(inset)
  })
})

describe('where it is applied, and where it is refused', () => {
  const read = (rel: string) => readFileSync(join(WEB, 'src', rel), 'utf8')

  test.each([
    ['components/ui/card.tsx', 'the shared container primitive'],
    ['components/home/section.tsx', 'the dashboard panels'],
    ['components/home/get-started.tsx', 'the Get started panel'],
  ])('%s (%s) carries the lift', (rel) => {
    expect(read(rel)).toMatch(/className[\s\S]{0,80}surface-ring-lift|'surface-ring-lift/)
  })

  test('the dashboard panel no longer pairs a shadow class with the ring', () => {
    // The exact dead combination this change removed. Its return would be a
    // shadow that does not render, which is worse than no shadow: it reads as
    // done.
    const src = read('components/home/section.tsx')
    expect(src).not.toMatch(/className=\{cn\('surface-ring rounded-card[^']*shadow-card/)
  })

  test.each([
    ['components/ui/tile.tsx', 'a button, and the brief excludes buttons'],
    ['components/home/needs-attention.tsx', 'an 8px row inside a card'],
    ['components/home/rail-cards.tsx', 'an 8px row inside a card'],
  ])('%s stays flat — %s', (rel) => {
    expect(read(rel)).not.toContain('surface-ring-lift')
  })
})
