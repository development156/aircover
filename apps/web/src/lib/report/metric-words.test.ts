import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BANNED_WORDS, metricInWords } from './metric-words'

/**
 * THE JARGON BAN, ENFORCED ON THE FILES THAT REACH A READER.
 *
 * Carried over from the deleted `strings.test.ts` on 2026-09-05, minus the
 * scans of modules that no longer exist. What remains is scanned for the same
 * reason it always was: `impressions` IS a real column value in the metric
 * store, so the word may live in the database and must never reach the page.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 * Every string the page renders that was not written here. A learning summary
 * comes from a model; a post title is typed by the customer; a channel arrives
 * as a database enum. All three reach the page verbatim and no file scan can
 * reach any of them. It is also blind to a banned word inside a template
 * literal's interpolation, since it reads the source text and not the value.
 */
const HERE = new URL('.', import.meta.url).pathname
const COMPONENTS = join(HERE, '..', '..', 'components', 'report')
const PAGE = join(HERE, '..', '..', 'app', '(app)', 'report', 'page.tsx')

/**
 * Comments explain the ban and may name the words, and `BANNED_WORDS` is the
 * list itself. Neither renders. Only what a reader could see counts.
 */
function stripComments(source: string): string {
  return (
    source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '')
      .replace(/export const BANNED_WORDS[\s\S]*?\] as const/, '')
      // The METRIC_WORDS lookup KEYS are storage vocabulary by definition — that
      // is the whole reason the map exists. Its VALUES are copy and are scanned
      // by their own test below, which reads them rather than the source text.
      .replace(/const METRIC_WORDS[\s\S]*?\n\}/, '')
  )
}

function offendersIn(text: string): string[] {
  const lower = text.toLowerCase()
  return BANNED_WORDS.filter((word) => lower.includes(word))
}

describe('the report speaks plainly', () => {
  it('uses none of the banned words in the components that render it', () => {
    const files = readdirSync(COMPONENTS).filter((file) => file.endsWith('.tsx'))
    // A scan of an empty directory proves nothing. The two survivors are named.
    expect(files).toEqual(expect.arrayContaining(['insights.tsx', 'module.tsx']))
    for (const file of files) {
      const rendered = stripComments(readFileSync(join(COMPONENTS, file), 'utf8'))
      expect({ file, offenders: offendersIn(rendered) }).toEqual({ file, offenders: [] })
    }
  })
})

/**
 * THE PAGE ITSELF.
 *
 * It once rendered `{ranking.top.metric}` and `{ranking.top.channel}` straight
 * from the metric store, so the live sentence read "610 impressions on gbp." A
 * value scan cannot reach it: `metric` is a DEFAULT PARAMETER on `readRanking`,
 * so nothing in any copy module holds the string. This is a shape gate on the
 * LEAK rather than on the sentence: it refuses the raw interpolation and leaves
 * the wording free to change.
 */
describe('the report page never prints storage vocabulary at the reader', () => {
  it('interpolates no raw metric key and no raw channel enum', () => {
    const source = stripComments(readFileSync(PAGE, 'utf8'))

    expect(source).not.toMatch(/\{ranking\.(top|bottom)\.metric\}/)
    expect(source).not.toMatch(/\{ranking\.(top|bottom)\.channel\}/)
  })

  it('carries no banned word of its own', () => {
    expect(offendersIn(stripComments(readFileSync(PAGE, 'utf8')))).toEqual([])
  })
})

describe('metricInWords', () => {
  it('renders no banned word for any key it maps', () => {
    // The VALUES are copy. Every one is checked, so a future entry cannot
    // reintroduce the storage word this map exists to replace.
    for (const key of ['impressions', 'reach', 'engagement', 'clicks']) {
      expect(offendersIn(metricInWords(key)), key).toEqual([])
    }
  })

  it('turns the stored key into something a shop owner reads', () => {
    expect(metricInWords('impressions')).toBe('times it was seen')
  })

  /**
   * Impressions and reach are DIFFERENT measurements. Rendering the first as
   * "people reached" would be a bigger claim than the data supports, which is
   * the defect this whole file exists to stop, arriving as a fix.
   */
  it('keeps two different measurements different', () => {
    expect(metricInWords('impressions')).not.toBe(metricInWords('reach'))
    expect(metricInWords('reach')).toBe('people reached')
  })

  it('invents no label for a key it does not know', () => {
    expect(metricInWords('saves')).toBe('saves')
  })
})
