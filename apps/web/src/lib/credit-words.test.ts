import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { creditWord, credits } from './credit-words'

/**
 * The word, and the sweep that finds the next place someone forgets it.
 *
 * The behavioural half is three lines. The half that matters is the sweep: this
 * defect has now shipped four times in the same codebase — twice fixed by hand,
 * twice left — and each time it survived because the branch was one a funded
 * workspace never reaches. "needs 1 credits" was found by RENDERING the refusal,
 * not by reading it, and "1 credits used" was sitting twenty lines above the
 * comment that explained the first fix.
 */

describe('creditWord', () => {
  test('one credit is singular', () => {
    expect(creditWord(1)).toBe('credit')
    expect(credits(1)).toBe('1 credit')
  })

  test('zero credits is plural, because English', () => {
    expect(creditWord(0)).toBe('credits')
    expect(credits(0)).toBe('0 credits')
  })

  test('everything else is plural', () => {
    for (const n of [2, 3, 6, 20, 50, 100]) expect(creditWord(n)).toBe('credits')
  })
})

const REPO = join(import.meta.dirname, '../../../..')
const WEB_SRC = join(REPO, 'apps/web/src')

function tsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...tsxFiles(full))
    else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) out.push(full)
  }
  return out
}

describe('no user-facing sentence pluralises a credit figure by hand', () => {
  /**
   * An interpolated figure immediately followed by the bare word "credits".
   *
   * Two shapes, because JSX and template literals both occur:
   *   {expr} credits          — after a closing brace, optionally through a
   *                             {' '} separator or a closing </span>
   *   ${expr} credits         — inside a template literal
   *
   * A LITERAL number beside the word is fine and is not matched: "100 credits"
   * in a plan description is not a figure that can turn out to be 1.
   */
  const HAND_PLURAL = /(\}(?:\s*\{'\s'\})?(?:\s*<\/span>)?\s*|\$\{[^}]*\}\s*)credits\b/g

  test('the detector matches the sentences this rule is about', () => {
    // Known-bad, in both shapes. A sweep that cannot fail is not a sweep.
    expect('{result.creditsCharged} credits used').toMatch(HAND_PLURAL)
    expect('`Granted ${result.amount} credits`').toMatch(HAND_PLURAL)
    expect('<span className="num">{cost}</span>{\' \'}credits').toMatch(HAND_PLURAL)
  })

  test('the detector leaves the sentences it is not about alone', () => {
    // A fixed literal cannot become 1 unexpectedly.
    expect('free 100, starter 1500').not.toMatch(HAND_PLURAL)
    // The word on its own, with no figure in front of it.
    expect('Top up credits').not.toMatch(HAND_PLURAL)
    // And the correct form, which puts the WORD in the interpolation.
    expect('{creditWord(cost)}').not.toMatch(HAND_PLURAL)
  })

  test('no source file interpolates a figure straight into "credits"', () => {
    const offenders: string[] = []
    for (const file of tsxFiles(WEB_SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const hit of text.matchAll(HAND_PLURAL)) {
        const line = text.slice(0, hit.index ?? 0).split('\n').length
        offenders.push(`${file.slice(REPO.length + 1)}:${line}`)
      }
    }

    expect(
      offenders,
      'A figure that can be 1 is rendered next to the hard-coded word "credits".\n' +
        'Use creditWord(n) / credits(n) from @/lib/credit-words — the branch where\n' +
        'this reads wrong is, every time, the one a funded workspace never reaches.',
    ).toEqual([])
  })
})
