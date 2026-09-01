import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

import { brandSkinVars, INK_RGB, SURFACE_RGB, WHITE_RGB } from '@/lib/brand/brand-theme'
import { contrastRatio, oklchToRgb, parseOklch } from '@/lib/brand/oklch'

/**
 * Sahoda must take its own medicine.
 *
 * ── THE DEFECT THIS EXISTS FOR ───────────────────────────────────────────────
 * The Readability Guard (`brandSkinVars`) already refuses to ship an unreadable
 * brand pair: given a customer's logo colour it darkens the primary and picks
 * `--pfg` as whichever of white or ink clears 4.5:1. Every WORKSPACE theme goes
 * through it.
 *
 * Sahoda's own orange never did. `tokens.css` hardcoded `--pfg: #ffffff` on
 * `--p: #ff6600`, which measures 2.94:1 — a pair the Guard would reject outright
 * if a customer supplied it. The app held a tenant's brand to a standard it did
 * not apply to its own, and the annotation in the token file claimed 3.13:1,
 * a figure nothing produces.
 *
 * So this test grades the SHIPPED token file against the app's OWN guard.
 */

const require_ = createRequire(import.meta.url)
const TOKENS = readFileSync(require_.resolve('@sahoda/shared/tokens.css'), 'utf8')

/**
 * The BARE `:root` block — the light theme — sliced out before any lookup.
 *
 * ── WHY THIS EXISTS, AND WHAT IT WAS BEFORE ──────────────────────────────────
 * This helper's docstring has always said "out of the :root block". It did not
 * do that: it ran `/^\s*--name:\s*([^;]+);/m` over the WHOLE file, and `m`
 * anchors to a LINE, not to a block. So it returned the first declaration of
 * that name anywhere, including from `[data-theme='dark']` or
 * `[data-surface='inverse']`.
 *
 * That was survivable only while light and dark held DIFFERENT values — a
 * fallthrough landed on the dark value and the old `>= 4.5` assertion refused
 * it. The 2026-08-26 ruling made all three declarations of `--acc` byte
 * identical, which silently converted the bug into a blind spot: deleting the
 * light `--acc` outright would fall through to dark, read `#ff6600`, and PASS.
 *
 * MEASURED, before this fix: mutating the dark scope to `#00ff00` left the
 * suite green, and deleting the `:root` declaration entirely left it green.
 * Both go red now. A detector that inherits the blind spot of the thing it
 * audits is not a detector.
 */
const ROOT_BLOCK = (() => {
  const open = TOKENS.match(/^:root\s*\{$/m)
  if (!open || open.index === undefined) throw new Error('tokens.css has no bare :root block')
  const from = open.index + open[0].length
  const close = TOKENS.indexOf('\n}', from)
  if (close === -1) throw new Error('tokens.css :root block is unterminated')
  return TOKENS.slice(from, close)
})()

/**
 * The `[data-surface='inverse']` block — the dark panel scope — sliced out the
 * same way, and for the same reason `ROOT_BLOCK` exists: a line-anchored lookup
 * over the whole file returns whichever declaration comes first, which is
 * `:root`'s. That is precisely the fallthrough this scope's bugs hide behind.
 */
const INVERSE_BLOCK = (() => {
  const open = TOKENS.match(/^\[data-surface='inverse'\]\s*\{$/m)
  if (!open || open.index === undefined)
    throw new Error("tokens.css has no [data-surface='inverse'] block")
  const from = open.index + open[0].length
  const close = TOKENS.indexOf('\n}', from)
  if (close === -1) throw new Error("tokens.css [data-surface='inverse'] block is unterminated")
  return TOKENS.slice(from, close)
})()

/** Pull a `--name: value;` out of a block, or null when the block never sets it. */
function tokenIn(block: string, name: string): string | null {
  const match = block.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  return match ? match[1]!.trim() : null
}

/** Pull a `--name: value;` out of the bare `:root` block of the real token file. */
function token(name: string): string {
  const match = ROOT_BLOCK.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`tokens.css :root has no ${name}`)
  return match[1]!.trim()
}

function hexToRgb(hex: string) {
  const h = hex.replace('#', '').trim()
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

const AA_BODY = 4.5
/** WCAG 1.4.11: a non-text UI boundary or fill wants 3:1 against what it sits on. */
const AA_NON_TEXT = 3
/** `[data-surface='inverse']`'s own ladder — the two grounds a primary fill lands on. */
const INVERSE_SURFACE = { r: 0x17, g: 0x17, b: 0x17 }
const INVERSE_CANVAS = { r: 0x0d, g: 0x0d, b: 0x0d }

describe('the default theme passes the guard it applies to customers', () => {
  it('the Guard, asked about Sahoda orange, does not choose white', () => {
    // No colours extracted → DEFAULT_PRIMARY, which IS #ff6600.
    const guarded = brandSkinVars([])
    const { l, c, h } = parseOklch(guarded['--p'])
    const primaryRgb = oklchToRgb(l, c, h)
    const onWhite = contrastRatio(primaryRgb, WHITE_RGB)
    const onInk = contrastRatio(primaryRgb, INK_RGB)

    // Printed so the reasoning behind the token values is reproducible.
    console.log(
      `[guard] --p=${guarded['--p']} --pfg=${guarded['--pfg']} ` +
        `| white ${onWhite.toFixed(2)}:1 · ink ${onInk.toFixed(2)}:1`,
    )

    expect(
      guarded['--pfg'],
      'the Guard prefers ink on orange — so the shipped tokens must too',
    ).toBe('var(--ink)')
  })

  it('the SHIPPED --pfg clears AA against the SHIPPED --p', () => {
    const p = token('--p')
    const pfg = token('--pfg')
    expect(p.startsWith('#'), '--p is expected to be a hex literal').toBe(true)

    const fgRgb = pfg.startsWith('#') ? hexToRgb(pfg) : WHITE_RGB
    const ratio = contrastRatio(hexToRgb(p), fgRgb)
    expect(
      ratio,
      `tokens.css ships --pfg ${pfg} on --p ${p} at ${ratio.toFixed(2)}:1, below AA ${AA_BODY}:1`,
    ).toBeGreaterThanOrEqual(AA_BODY)
  })

  /**
   * ── RETARGETED 2026-08-26, AND WHAT IT NO LONGER CLAIMS ────────────────────
   * This assertion used to read `--acc must clear AA` and it PASSED, because
   * --acc was #bd4b00 at 5.04:1. The founder ruled the brand orange in at
   * 2.94:1 with that number in front of them, so the old assertion would now
   * fail for a reason nobody intends to fix.
   *
   * It is retargeted rather than deleted or skipped, because the thing worth
   * guarding did not go away — it CHANGED. What must not happen silently is
   * --acc drifting to some third value that nobody ruled on. So this pins the
   * ruled value exactly and states the shortfall it accepts out loud.
   *
   * Read the failure message before "fixing" a red here: if --acc is back at
   * #bd4b00 the product is MORE accessible, not less, and the right response
   * is to ask whether the ruling was reversed, not to re-pin the constant.
   */
  it('--acc is the ruled brand orange, and its AA shortfall is stated not hidden', () => {
    const acc = token('--acc')
    expect(acc.startsWith('#'), '--acc is expected to be a hex literal').toBe(true)
    expect(
      acc,
      `--acc is ${acc}. The 2026-08-26 ruling pins it to #ff6600. A different ` +
        `value means someone changed the accent without a ruling — do not ` +
        `re-pin this constant to match, find out who moved it and why.`,
    ).toBe('#ff6600')

    // The cost, asserted rather than described, so it cannot rot into a claim
    // that this pair is fine. If a future change makes accent text clear AA,
    // THIS line goes red and that is a good day — reverse the ruling above.
    const ratio = contrastRatio(hexToRgb(acc), SURFACE_RGB)
    expect(
      ratio,
      `--acc ${acc} measures ${ratio.toFixed(2)}:1 on --surface. This is BELOW ` +
        `AA ${AA_BODY}:1 by ruling. If this figure has risen above the floor, ` +
        `the ruling has been superseded and this test should assert AA again.`,
    ).toBeLessThan(AA_BODY)
    expect(Number(ratio.toFixed(2))).toBe(2.94)
  })

  /**
   * ── THE PRIMARY'S HOVER ON THE INVERSE SURFACE ─────────────────────────────
   * `:root` sets `--pstrong: #000000`, which is right on a white page and
   * points AT THE GROUND on `[data-surface='inverse']`. `brand-theme.ts`
   * already states the rule beside the line implementing it — the hover step
   * moves away from the page, in whichever direction that is — and
   * `skin-css.ts` has given every CUSTOMER theme a lightened `--pstrong` in
   * this exact scope since the 2026-08-30 rail ruling. Sahoda's own default,
   * having no Brand Skin, fell through to `:root` and got the black.
   *
   * So this is the same own-medicine defect the tests above exist for, in the
   * one scope none of them read.
   */
  it('the inverse scope lifts the primary on hover instead of sinking it', () => {
    const pstrong = tokenIn(INVERSE_BLOCK, '--pstrong')
    expect(
      pstrong,
      "[data-surface='inverse'] does not declare --pstrong, so it inherits " +
        ":root's #000000 — a primary button that vanishes into the panel on hover.",
    ).not.toBeNull()
    expect(pstrong!.startsWith('#'), '--pstrong is expected to be a hex literal').toBe(true)

    const fill = hexToRgb(pstrong!)

    // It must SEPARATE from both grounds it can land on, as a non-text fill.
    for (const [name, ground] of [
      ['--surface #171717', INVERSE_SURFACE],
      ['--canvas #0d0d0d', INVERSE_CANVAS],
    ] as const) {
      const ratio = contrastRatio(fill, ground)
      expect(
        ratio,
        `inverse --pstrong ${pstrong} measures ${ratio.toFixed(2)}:1 on ${name}, ` +
          `below the ${AA_NON_TEXT}:1 WCAG 1.4.11 floor for a non-text fill.`,
      ).toBeGreaterThanOrEqual(AA_NON_TEXT)
    }

    // And it must move AWAY from the ground, not merely differ from it. A
    // DARKER hover can still clear 3:1 while breaking the rule this encodes.
    const rest = hexToRgb(token('--p'))
    const lift = contrastRatio(fill, INVERSE_SURFACE)
    const resting = contrastRatio(rest, INVERSE_SURFACE)
    expect(
      lift,
      `inverse --pstrong ${pstrong} reads ${lift.toFixed(2)}:1 on #171717 while the ` +
        `resting --p reads ${resting.toFixed(2)}:1. The control must get LOUDER when ` +
        `somebody reaches for it, never quieter.`,
    ).toBeGreaterThan(resting)

    // ── ONE ASSERTION IS DELIBERATELY ABSENT ────────────────────────────────
    // A fourth line checking that --pfg ink still clears AA on the hovered fill
    // was written here and REMOVED, because no value can fail it while the
    // lift assertion above passes, and a line that cannot go red is decoration.
    // The arithmetic: #171717 has relative luminance 0.0086, so lift > 6.11
    // forces L_fill > 6.11 x 0.0586 - 0.05 = 0.308, and ink on such a fill
    // measures (0.308 + 0.05) / 0.05 = 7.2:1 at worst. Recorded rather than
    // asserted so the guarantee survives without pretending to be a guard.
  })

  /**
   * ── AND THE ALIAS, WHICH IS WHERE THE LAST ONE OF THESE HID ────────────────
   * `--brand-deep: var(--pstrong)` is declared on `:root`. A custom property
   * whose value contains `var()` is substituted on the element that DECLARES
   * it, so re-declaring `--pstrong` on a descendant cannot reach it. That is
   * the documented reason the inverse scope re-declares its aliases at all, and
   * it cost the rail its label contrast for months before anyone measured it.
   */
  it('the inverse scope re-declares --brand-deep, not just its source', () => {
    expect(
      tokenIn(INVERSE_BLOCK, '--brand-deep'),
      '--brand-deep resolves through --pstrong and is declared on :root, so it ' +
        "freezes at #000000 there. [data-surface='inverse'] must re-declare it or " +
        'bg-brand-deep stays black inside every dark panel.',
    ).toBe('var(--pstrong)')
  })

  /**
   * The detector, shown failing. If this checker could not fail, the three
   * assertions above would prove nothing.
   */
  it('rejects the pair that shipped before this was fixed', () => {
    const ratio = contrastRatio(hexToRgb('#ff6600'), WHITE_RGB)
    expect(ratio).toBeLessThan(AA_BODY)
    expect(Number(ratio.toFixed(2))).toBe(2.94)
  })
})
