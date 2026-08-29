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
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * Every string this page renders that was not written here. A learning summary
 * comes from a model and is stored in `memory_events`; a post title is typed by
 * the customer; a channel arrives as a database enum. All three reach the page
 * verbatim and no file scan can reach any of them. It is also blind to copy
 * that lives in a component outside `components/report`, to a word assembled
 * from pieces at runtime, and to a banned word inside a template literal's
 * interpolation, since it reads the source text and not the value.
 */
const HERE = new URL('.', import.meta.url).pathname
const COMPONENTS = join(HERE, '..', '..', 'components', 'report')

/**
 * ── THE COPY IS SCANNED AS SOURCE, NOT AS A SERIALISED OBJECT ───────────────
 * This test used to read `JSON.stringify(REPORT)`, and JSON.stringify SILENTLY
 * DROPS FUNCTION VALUES. Half of this module's copy is a function, because half
 * of it interpolates a figure — so every sentence with a number in it was
 * unscanned, which is the half most likely to talk in metrics. An adversarial
 * pass put four banned words into `oneThing.lapsed` and all twenty tests stayed
 * green. Reading the file is the only form of this test that cannot be fooled.
 *
 * `verdict.ts` is scanned for the same reason: it holds the largest sentence on
 * the page, and it is not in the copy module.
 */
const SCANNED = [join(HERE, 'strings.ts'), join(HERE, 'verdict.ts')]

/**
 * Comments explain the ban and may name the words, and `BANNED_WORDS` is the
 * list itself. Neither renders. Only what a reader could see counts.
 */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/export const BANNED_WORDS[\s\S]*?\] as const/, '')
}

function offendersIn(text: string): string[] {
  const lower = text.toLowerCase()
  return BANNED_WORDS.filter((word) => lower.includes(word))
}

describe('the report speaks plainly', () => {
  it('uses none of the banned words in its copy, functions included', () => {
    for (const file of SCANNED) {
      const rendered = stripComments(readFileSync(file, 'utf8'))
      expect({ file, offenders: offendersIn(rendered) }).toEqual({ file, offenders: [] })
    }
  })

  it('uses none of them in the sections either', () => {
    for (const file of readdirSync(COMPONENTS)) {
      if (!file.endsWith('.tsx')) continue
      const source = readFileSync(join(COMPONENTS, file), 'utf8')
      // Comments explain the ban and may name the words; only what renders counts.
      const rendered = stripComments(source)
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
