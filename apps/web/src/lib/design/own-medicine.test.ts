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

/** Pull a `--name: value;` out of the :root block of the real token file. */
function token(name: string): string {
  const match = TOKENS.match(new RegExp(`^\\s*${name}:\\s*([^;]+);`, 'm'))
  if (!match) throw new Error(`tokens.css has no ${name}`)
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

  it('the SHIPPED --acc is readable as text on --surface', () => {
    const acc = token('--acc')
    expect(acc.startsWith('#'), '--acc is expected to be a hex literal').toBe(true)
    const ratio = contrastRatio(hexToRgb(acc), SURFACE_RGB)
    expect(
      ratio,
      `--acc ${acc} measures ${ratio.toFixed(2)}:1 on --surface — accent TEXT must clear AA`,
    ).toBeGreaterThanOrEqual(AA_BODY)
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
