import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * `100 of —` rendered on every screen in the product: a numerator, the word
 * "of", and an em dash standing in for a denominator that does not exist.
 *
 * docs/26 §4 rules that the third absence state — "there is no such quantity" —
 * renders NOTHING. There is deliberately no class for it, because the correct
 * treatment is to delete the slot. Filling it with a dash states a relationship
 * ("this is a fraction, and part of it is missing") that is not true: Sahoda's
 * wallet is a balance, not an allowance, so there is no fraction at all.
 *
 * THREE separate lanes reported this and none of them owned it, which is the
 * reason this is a test and not a fixed file. A fixed file gets re-broken by
 * whoever next copies the reference sidebar; a test does not.
 *
 * It matches the RENDERED pattern rather than the string `—` alone, because the
 * dash has legitimate uses — prose em dashes are house style (CLAUDE.md), and
 * `Unreadable` is a real and required state. What is banned is a dash used as a
 * denominator.
 */

const SRC = join(__dirname, '..', '..')

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (/\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry)) yield full
  }
}

/** "of" followed by an em dash, in either literal or entity form, as rendered text. */
const PHANTOM = /\bof\s*(?:&mdash;|—)/i

describe('no phantom denominator', () => {
  it('no source file renders "of —"', () => {
    const offenders: string[] = []
    for (const file of walk(SRC)) {
      const source = readFileSync(file, 'utf8')
      // Strip block comments: this file's own explanation, and rail-foot.tsx's
      // record of why the slot was deleted, both legitimately quote the string.
      const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
      if (PHANTOM.test(code)) offenders.push(file.slice(SRC.length + 1))
    }
    expect(offenders).toEqual([])
  })
})
