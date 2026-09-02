import { readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * A weight utility beside a type step must WIN, and it did not.
 *
 * MEASURED 2026-08-31, rendered in Chromium against the compiled stylesheet:
 * `type-sm font-semibold` computed to font-weight 400, in either order. The
 * `type-*` utilities are emitted after Tailwind's own `font-*` utilities in the
 * same layer, and `font:` is a shorthand, so the step's resting weight
 * overwrote the modifier every time. Eighty-two call sites in the app write
 * exactly that pair. Every one rendered at the resting weight.
 *
 * The fix in globals.css is a `font-weight: var(--tw-font-weight, W)` longhand
 * after each shorthand, where W is the step's resting weight. That W is a copy
 * of the number inside the `--t-*` token, and a copy drifts — so this test
 * reads BOTH files and refuses if any step's fallback disagrees with its token,
 * or if a step has no fallback at all.
 *
 * It is a source check, not a render: the render is what found the defect, and
 * this exists so the fix cannot be quietly dropped by a later edit to the
 * utilities block.
 *
 * WHAT IT CANNOT SEE: a type step defined anywhere other than an `@utility`
 * block in globals.css (a plain `.type-x` rule, a `@layer` component, or a
 * class composed at runtime), and a weight utility Tailwind has stopped
 * routing through `--tw-font-weight`. Either would need a rendered check.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

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

const ROOT = repoRoot()
const globals = readFileSync(join(ROOT, 'apps/web/src/app/globals.css'), 'utf8')
const tokens = readFileSync(join(ROOT, 'packages/shared/tokens.css'), 'utf8')

/** `type-<step>` utility name → the `--t-<token>` it reads. `meta` reads `xs`. */
const STEPS: Record<string, string> = {
  display: 'display',
  h1: 'h1',
  h2: 'h2',
  h3: 'h3',
  'hero-num': 'hero-num',
  body: 'body',
  sm: 'sm',
  meta: 'xs',
  chip: 'chip',
  'input-embed': 'input-embed',
  eyebrow: 'eyebrow',
}

function utilityBlock(step: string): string {
  const match = globals.match(new RegExp(`@utility type-${step} \\{([^}]*)\\}`))
  const body = match?.[1]
  if (body === undefined) throw new Error(`no @utility type-${step} in globals.css`)
  return body
}

function tokenWeight(token: string): number {
  const match = tokens.match(new RegExp(`--t-${token}: (\\d+) `))
  const weight = match?.[1]
  if (weight === undefined) throw new Error(`no --t-${token} in tokens.css`)
  return Number(weight)
}

describe('type steps honour a weight utility beside them', () => {
  test('the scale has exactly the eleven steps this test knows', () => {
    // A twelfth step added without a fallback would sail past the loop below.
    const declared = [...globals.matchAll(/@utility type-([a-z0-9-]+) \{/g)].map((m) => m[1])
    expect(declared.sort()).toEqual(Object.keys(STEPS).sort())
  })

  for (const [step, token] of Object.entries(STEPS)) {
    test(`type-${step} falls back to the weight inside --t-${token}`, () => {
      const block = utilityBlock(step)
      // The shorthand stays: it is what carries size, line-height and family.
      expect(block).toMatch(new RegExp(`font: var\\(--t-${token}\\);`))
      // And the longhand reads Tailwind's modifier variable, or the token's weight.
      const fallback = block.match(/font-weight: var\(--tw-font-weight, (\d+)\);/)
      expect(fallback, `type-${step} has no font-weight fallback`).not.toBeNull()
      expect(Number(fallback?.[1])).toBe(tokenWeight(token))
    })
  }
})
