import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, test } from 'vitest'

import { PENDING_ANCHORS } from './anchors'

/**
 * Anchor integrity.
 *
 * The tour contract says a missing anchor auto-skips and logs — a tour may
 * degrade, never break the screen. That is right, and it is also why nobody
 * noticed that FIVE of the six seeded tours pointed at anchors this app never
 * rendered: the failure mode of the whole system is silence.
 *
 * This test is the mechanical check the skill assumes exists. It reads the
 * seeded tours from the migration and the `data-guide` attributes from the
 * markup, and requires every seeded anchor to be one of:
 *   - present in the markup, or
 *   - listed in PENDING_ANCHORS with a stated reason.
 *
 * It deliberately reads the REAL seed rather than a fixture. A fixture would
 * drift from wt-db exactly the way the anchors drifted from the seed.
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

const ROOT = repoRoot()
const SEED = join(ROOT, 'packages/db/supabase/migrations/20260718000010_seed.sql')
const WEB_SRC = join(ROOT, 'apps/web/src')

function seededAnchors(): string[] {
  const sql = readFileSync(SEED, 'utf8')
  const found = [...sql.matchAll(/"anchor"\s*:\s*"([^"]+)"/g)].map((m) => m[1])
  return [...new Set(found.filter((a): a is string => typeof a === 'string'))].sort()
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Strip comments before scanning. Without this the checker reports an anchor as
 * RENDERED when the only occurrence is prose explaining why it is deliberately
 * absent — which is exactly what `sites/page.tsx` says. Comments are where the
 * honest reasoning lives, so they must not be mistaken for markup.
 *
 * Block comments go wholesale; line comments only when the line IS a comment
 * (trimmed start of `//` or a JSDoc `*` continuation). Stripping every `//` to
 * end-of-line would eat the tail of any line holding a URL, which could hide a
 * real anchor sharing that line.
 */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter((line) => {
      const t = line.trimStart()
      return !t.startsWith('//') && !t.startsWith('*')
    })
    .join('\n')
}

function renderedAnchors(): Set<string> {
  const anchors = new Set<string>()
  for (const file of walk(WEB_SRC)) {
    // Skip the registry and this test, which name anchors as data.
    if (file.includes('lib/guide/')) continue
    const src = stripComments(readFileSync(file, 'utf8'))
    for (const m of src.matchAll(/data-guide="([^"]+)"/g)) {
      if (m[1] !== undefined) anchors.add(m[1])
    }
  }
  return anchors
}

describe('Guide anchor integrity', () => {
  test('the seed is readable and actually contains tours', () => {
    // If wt-db moves or renames the seed this fails loudly, rather than the
    // suite silently checking an empty list and passing.
    expect(seededAnchors().length).toBeGreaterThan(0)
  })

  test('every seeded tour anchor is either rendered or explicitly pending', () => {
    const rendered = renderedAnchors()
    const unaccounted = seededAnchors().filter(
      (anchor) => !rendered.has(anchor) && PENDING_ANCHORS[anchor] === undefined,
    )

    expect(
      unaccounted,
      `Seeded tour anchors with no target and no entry in PENDING_ANCHORS. Either add the ` +
        `data-guide attribute to the real control, or record why it cannot exist yet:\n  ` +
        unaccounted.join('\n  '),
    ).toEqual([])
  })

  test('nothing is listed as pending while it is actually rendered', () => {
    // The other direction: a stale entry would keep claiming a screen is
    // unbuilt after someone built it, and quietly excuse a future regression.
    const rendered = renderedAnchors()
    const staleClaims = Object.keys(PENDING_ANCHORS).filter((anchor) => rendered.has(anchor))

    expect(
      staleClaims,
      `These anchors ARE rendered but are still listed as pending — delete their ` +
        `PENDING_ANCHORS entries:\n  ${staleClaims.join('\n  ')}`,
    ).toEqual([])
  })

  test('every pending anchor is one the seed actually asks for', () => {
    // Guards against a typo'd or obsolete key sitting in the registry forever,
    // silently excusing an anchor no tour references.
    const seeded = new Set(seededAnchors())
    const orphans = Object.keys(PENDING_ANCHORS).filter((anchor) => !seeded.has(anchor))

    expect(
      orphans,
      `PENDING_ANCHORS entries no seeded tour references:\n  ${orphans.join('\n  ')}`,
    ).toEqual([])
  })

  test('every pending anchor states a real reason', () => {
    for (const [anchor, reason] of Object.entries(PENDING_ANCHORS)) {
      expect(reason.length, `${anchor} needs a substantive reason`).toBeGreaterThan(30)
    }
  })

  test('the two anchors whose controls exist are wired to them', () => {
    // Regression pin for this fix specifically: these drifted from the seed
    // (posts.create vs posts.new_button; onboarding.steps vs onboarding.start).
    const rendered = renderedAnchors()
    expect(rendered.has('posts.new_button')).toBe(true)
    expect(rendered.has('onboarding.start')).toBe(true)
    expect(rendered.has('wallet.balance')).toBe(true)
  })
})
