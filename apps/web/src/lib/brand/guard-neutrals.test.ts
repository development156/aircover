import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { INK_RGB, NEUTRAL_RGB, SURFACE_RGB, themeTokensFrom } from './brand-theme'

/**
 * The Readability Guard's neutrals, pinned to `packages/shared/tokens.css`.
 *
 * `brand-theme.ts` cannot read CSS at runtime, so it mirrors the neutral palette
 * as decimal RGB constants and computes real WCAG contrast against them. That
 * mirror is the whole mechanism: it is what guarantees a customer's brand colour
 * is legible against the surfaces this app actually paints.
 *
 * It drifted once already. The v3 token swap moved the neutrals from cool greys
 * to warm ones (--ink #131313 -> #171514, --muted #525252 -> --ink-mute #6b6560,
 * and so on) while these constants stayed on the v2 values, so the Guard was
 * grading every tenant brand against surfaces that no longer existed. Nothing
 * failed — a Guard computing slightly wrong ratios still returns a colour, and
 * the failure is silent by construction.
 *
 * So this test reads the REAL token file and requires the constants to match it
 * exactly. A future token change now breaks the build instead of quietly
 * degrading the contrast maths.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

/** Walk up until the directory containing `packages/` — worktree-path agnostic. */
function repoRoot(): string {
  let dir = HERE
  for (let up = 0; up < 12; up += 1) {
    try {
      if (statSync(join(dir, 'packages')).isDirectory()) return dir
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate the repo root from the test file')
}

const TOKENS_CSS = readFileSync(join(repoRoot(), 'packages/shared/tokens.css'), 'utf8')

/**
 * The `:root` block only. The dark block redefines the same names, and the Guard
 * grades against the light surfaces — reading the whole file would let a dark
 * value win the regex and pin the constants to the wrong palette.
 */
function lightRootBlock(): string {
  const start = TOKENS_CSS.indexOf(':root {')
  expect(start, ':root block not found in tokens.css').toBeGreaterThanOrEqual(0)
  const end = TOKENS_CSS.indexOf('\n}', start)
  expect(end, ':root block is unterminated in tokens.css').toBeGreaterThan(start)
  return TOKENS_CSS.slice(start, end)
}

const ROOT_BLOCK = lightRootBlock()

/** The declared value of `--name` in `:root`, with its trailing comment stripped. */
function token(name: string): string {
  const match = ROOT_BLOCK.match(new RegExp(`--${name}:\\s*([^;]+);`))
  const declared = match?.[1]
  if (declared === undefined) throw new Error(`tokens.css :root does not declare --${name}`)
  return (declared.split('/*')[0] ?? declared).trim()
}

function hexToRgb(name: string): { r: number; g: number; b: number } {
  const value = token(name)
  const digits = value.match(/^#([0-9a-f]{6})$/i)?.[1]
  if (digits === undefined) {
    throw new Error(`--${name} is "${value}", not a 6-digit hex the Guard can mirror`)
  }
  const int = parseInt(digits, 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

describe('Readability Guard neutrals match tokens.css', () => {
  // Guard constant -> the v3 token it mirrors. The Guard predates the v3 names,
  // so several keep a legacy key (`s1`) over a v3 token (`--canvas`); the
  // mapping is what matters, not the key.
  const MIRRORS: ReadonlyArray<[string, { r: number; g: number; b: number }, string]> = [
    ['--ink', INK_RGB, 'INK_RGB'],
    ['--surface', SURFACE_RGB, 'SURFACE_RGB'],
    ['--surface', NEUTRAL_RGB.bg, 'NEUTRAL_RGB.bg'],
    ['--canvas', NEUTRAL_RGB.s1, 'NEUTRAL_RGB.s1'],
    ['--surface-2', NEUTRAL_RGB.s2, 'NEUTRAL_RGB.s2'],
    ['--line', NEUTRAL_RGB.line, 'NEUTRAL_RGB.line'],
    ['--ink', NEUTRAL_RGB.ink, 'NEUTRAL_RGB.ink'],
    ['--ink-mute', NEUTRAL_RGB.muted, 'NEUTRAL_RGB.muted'],
    ['--ink-faint', NEUTRAL_RGB.faint, 'NEUTRAL_RGB.faint'],
    ['--ok', NEUTRAL_RGB.ok, 'NEUTRAL_RGB.ok'],
    ['--warn', NEUTRAL_RGB.warn, 'NEUTRAL_RGB.warn'],
    ['--danger', NEUTRAL_RGB.danger, 'NEUTRAL_RGB.danger'],
  ]

  for (const [cssName, constant, label] of MIRRORS) {
    test(`${label} mirrors ${cssName}`, () => {
      expect(constant).toEqual(hexToRgb(cssName.slice(2)))
    })
  }

  test('the surface the Guard darkens text against is the card surface, not the canvas', () => {
    // `darkenForTextOnWhite` grades --acc against SURFACE_RGB. --surface is the
    // lighter of the two light surfaces, so it is the stricter test: a colour
    // that clears 4.5:1 on --surface also clears it on --canvas.
    expect(SURFACE_RGB).toEqual(hexToRgb('surface'))
    const canvas = hexToRgb('canvas')
    const sum = (c: { r: number; g: number; b: number }) => c.r + c.g + c.b
    expect(sum(SURFACE_RGB)).toBeGreaterThanOrEqual(sum(canvas))
  })
})

describe('themeTokensFrom matches the shape tokens.css declares', () => {
  test('radius is the card radius from tokens.css, not a frozen literal', () => {
    expect(themeTokensFrom([]).radius).toBe(token('r-lg'))
  })

  test('the heading and body families are the v3 sans stack', () => {
    const tokens = themeTokensFrom([])
    expect(token('sans')).toContain(tokens.fontHeading)
    expect(token('sans')).toContain(tokens.fontBody)
  })
})
