import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

/**
 * GLASS FAILS TO AN OPAQUE PANEL, NEVER TO A SEE-THROUGH ONE.
 *
 * ── THE DEFECT THIS EXISTS TO STOP, WHICH HAD ALREADY HAPPENED ───────────────
 * `@utility glass` carried a comment promising that "a browser without
 * backdrop-filter support gets a solid panel rather than a see-through one,
 * which fails safe instead of illegible". It was implemented as two
 * declarations of the same property:
 *
 *     background: var(--surface);
 *     background: var(--glass-bg);
 *
 * That gates on whether the browser understands the VALUE, not on whether
 * `backdrop-filter` is supported. Every browser understands `rgba()`, so the
 * translucent line always won and the opaque fallback applied to nothing, ever.
 *
 * MEASURED 2026-08-25 from the command palette open over /analytics: the page
 * rows behind the panel were legible word for word. The blur was not landing;
 * the transparency was. A menu you read had the page showing through it.
 *
 * ── WHY THIS TEST READS THE CSS AND NOT A TOKEN ──────────────────────────────
 * This repo has paid for this exact confusion before: `backdrop-filter` and
 * `background` are separate properties, and a guard that asserts a TOKEN VALUE
 * cannot see which property the browser actually applied. `--glass-bg` was
 * correct throughout the whole bug. So this reads the authored rule and asserts
 * the SHAPE of the cascade: opaque unconditionally, translucent only inside an
 * `@supports` that names the property it depends on.
 *
 * ── WHAT THIS GUARD CANNOT SEE ───────────────────────────────────────────────
 * It reads source, not a rendered pixel. It cannot tell you that a browser which
 * SUPPORTS `backdrop-filter` actually painted the blur — an extension or a
 * compositing fallback can still swallow it, and `@supports` will happily pass.
 * That is why the command palette does not use `glass` at all: legibility of a
 * menu must not depend on a GPU effect arriving. This guard covers the utility;
 * the palette's own opacity is its own decision.
 */

const HERE = dirname(fileURLToPath(import.meta.url))

function webRoot(): string {
  let dir = HERE
  for (let up = 0; up < 12; up += 1) {
    try {
      readFileSync(join(dir, 'src/app/globals.css'), 'utf8')
      return dir
    } catch {
      // keep walking
    }
    const parent = resolve(dir, '..')
    if (parent === dir) break
    dir = parent
  }
  throw new Error('could not locate apps/web from the test file')
}

const CSS = readFileSync(join(webRoot(), 'src/app/globals.css'), 'utf8')

/** The body of `@utility glass { … }`, brace-matched rather than regexed to the first `}`. */
function glassUtilityBody(): string {
  const start = CSS.indexOf('@utility glass {')
  expect(start, '`@utility glass` is gone from globals.css').toBeGreaterThan(-1)

  let depth = 0
  for (let i = CSS.indexOf('{', start); i < CSS.length; i += 1) {
    if (CSS[i] === '{') depth += 1
    if (CSS[i] === '}') {
      depth -= 1
      if (depth === 0) return CSS.slice(CSS.indexOf('{', start) + 1, i)
    }
  }
  throw new Error('unbalanced braces in @utility glass')
}

/** The part of the utility that applies with no feature query in front of it. */
function unconditionalPart(body: string): string {
  const at = body.indexOf('@supports')
  return at === -1 ? body : body.slice(0, at)
}

describe('the glass utility fails safe', () => {
  const body = glassUtilityBody()

  test('its unconditional background is the OPAQUE surface', () => {
    const plain = unconditionalPart(body)
    expect(
      plain,
      'glass must set an opaque background before any feature query, so a browser ' +
        'that never reaches the @supports block still gets a solid panel',
    ).toMatch(/background:\s*var\(--surface\)/)
  })

  test('the translucent background appears ONLY inside a feature query', () => {
    const plain = unconditionalPart(body)
    expect(
      plain,
      '--glass-bg is translucent and was found outside @supports. That is the ' +
        'original defect: it wins the cascade unconditionally, so the panel is ' +
        'see-through even where the blur never lands.',
    ).not.toMatch(/--glass-bg/)
    expect(body, 'the translucent treatment is missing entirely').toMatch(/--glass-bg/)
  })

  test('the feature query names backdrop-filter, both prefixes', () => {
    // Querying something else — or nothing — would let the translucent branch
    // apply on a browser that cannot blur, which is the whole failure.
    expect(body).toMatch(/@supports[^{]*backdrop-filter/)
    expect(body).toMatch(/@supports[^{]*-webkit-backdrop-filter/)
  })

  test('backdrop-filter itself is only ever set inside that query', () => {
    const plain = unconditionalPart(body)
    expect(
      plain,
      'a backdrop-filter outside the feature query is harmless but means the ' +
        'query is no longer the single place the enhancement is decided',
    ).not.toMatch(/backdrop-filter/)
  })
})

describe('the command palette does not rely on the blur to be readable', () => {
  const PALETTE = readFileSync(join(webRoot(), 'src/components/shell/command-palette.tsx'), 'utf8')

  /**
   * `@supports` answers "is the property supported", not "did the effect land".
   * A palette is a list of destinations read over an arbitrary screen, so it
   * carries its own opaque ground rather than borrowing one from a GPU effect.
   */
  test('its dialog panel is opaque', () => {
    // Read the QUOTED className that follows `role="dialog"`, rather than
    // slicing to the next `>`: a JSDoc block sits between the two, and any `>`
    // inside it would silently yield an empty string — a guard that passes by
    // matching nothing is the failure mode this whole file is about.
    const dialog = PALETTE.slice(PALETTE.indexOf('role="dialog"'))
    const match = dialog.match(/className="([^"]*)"/)
    expect(match, 'no quoted className found on the palette dialog').not.toBeNull()
    const className = match![1] as string
    expect(className, 'the palette panel lost its opaque background').toMatch(/bg-surface/)
    expect(
      className,
      'the palette went back to `glass`, so it is see-through again wherever the ' +
        'blur does not land — see this file’s header',
    ).not.toMatch(/\bglass\b/)
  })
})
