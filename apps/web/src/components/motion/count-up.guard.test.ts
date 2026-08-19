import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * docs/26 §8.1 made a narrow exception to "a number must never animate": a
 * SETTLED HISTORICAL figure may count up on arrival. An AUTHORITATIVE LIVE
 * quantity may not — it is the number you act on, it moves under you as
 * actions spend, and mid-count it displays a figure that is not your balance.
 *
 * A ruling that lives only in prose gets re-litigated by the next session that
 * wants a nicer wallet. This is the ruling as a test.
 *
 * It asserts on the IMPORT, not on the rendered output, because that is the
 * step that cannot be reached accidentally: you have to type the import to
 * break the rule.
 */

const ROOT = join(__dirname, '..', '..')

/** Every surface that shows the balance a user is about to spend. */
const AUTHORITATIVE = [
  'components/wallet/balance-hero.tsx',
  'components/shell/credit-chip.tsx',
  'components/shell/rail-foot.tsx',
]

describe('the authoritative balance does not count', () => {
  it.each(AUTHORITATIVE)('%s does not import CountUp', (rel) => {
    const source = readFileSync(join(ROOT, rel), 'utf8')
    // Comments are stripped first. These files are SUPPOSED to explain why they
    // do not count up — rail-foot.tsx names the rule and this test in its header
    // — and a guard that fires on its own documentation trains the next session
    // to delete the explanation rather than keep the behaviour.
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(code).not.toMatch(/from\s+['"][^'"]*motion\/count-up['"]/)
    expect(code).not.toMatch(/\bCountUp\b/)
  })

  it('the files it guards all still exist, so a rename cannot silently retire it', () => {
    // Without this, deleting or moving one of the three turns a real guard into
    // a passing test that reads nothing.
    for (const rel of AUTHORITATIVE) {
      expect(() => readFileSync(join(ROOT, rel), 'utf8')).not.toThrow()
    }
  })
})
