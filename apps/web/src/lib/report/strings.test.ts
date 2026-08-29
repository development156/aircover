import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BANNED_WORDS, REPORT } from './strings'

/**
 * THE JARGON BAN, ENFORCED ON THE FILES THAT REACH A READER.
 *
 * MUTATION-PROVEN: adding "our conversion funnel" to `REPORT.principle` turns
 * the first test below red, and adding it to a component turns the second red.
 * Both were watched failing and then put back.
 *
 * `impressions` is on the list and IS a real column value in the metric store.
 * That is the point: the word may live in the database and must never reach the
 * page, which is why this scans the report's own files rather than the codebase.
 */
const HERE = new URL('.', import.meta.url).pathname
const COMPONENTS = join(HERE, '..', '..', 'components', 'report')

function offendersIn(text: string): string[] {
  const lower = text.toLowerCase()
  return BANNED_WORDS.filter((word) => lower.includes(word))
}

describe('the report speaks plainly', () => {
  it('uses none of the banned words in its copy', () => {
    const copy = JSON.stringify(REPORT)
    expect(offendersIn(copy)).toEqual([])
  })

  it('uses none of them in the sections either', () => {
    for (const file of readdirSync(COMPONENTS)) {
      if (!file.endsWith('.tsx')) continue
      const source = readFileSync(join(COMPONENTS, file), 'utf8')
      // Comments explain the ban and may name the words; only what renders counts.
      const rendered = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      expect({ file, offenders: offendersIn(rendered) }).toEqual({ file, offenders: [] })
    }
  })

  it('never says "the user"', () => {
    expect(JSON.stringify(REPORT).toLowerCase()).not.toContain('the user')
  })

  it('carries no exclamation marks and no emoji', () => {
    const copy = JSON.stringify(REPORT)
    expect(copy).not.toContain('!')
    expect(copy).not.toMatch(/\p{Extended_Pictographic}/u)
  })

  it('keeps the principle line, which is the trust feature', () => {
    expect(REPORT.principle).toContain('strong enough to stand behind')
  })
})
