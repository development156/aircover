import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { BANNED_WORDS, REPORT, metricInWords } from './strings'

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

/**
 * THE PAGE ITSELF, WHICH THIS SCAN HAD NEVER READ.
 *
 * ── THE BLIND SPOT, CLOSED ───────────────────────────────────────────────────
 * The header above admits two of them: "a word assembled from pieces at
 * runtime", and copy living outside `components/report`. `/report/page.tsx` sat
 * in both. It rendered `{ranking.top.metric}` and `{ranking.top.channel}`
 * straight from the metric store, so the live sentence read "610 impressions on
 * gbp." — with `impressions` on BANNED_WORDS the whole time, and the word never
 * appearing in any file this scan was pointed at.
 *
 * A value scan cannot reach it either: `metric` is a DEFAULT PARAMETER on
 * `readRanking`, so nothing in the copy modules holds the string. So this is a
 * shape gate on the LEAK rather than on the sentence: it refuses the raw
 * interpolation and leaves the wording free to change.
 */
describe('the report page never prints storage vocabulary at the reader', () => {
  const PAGE = join(HERE, '..', '..', 'app', '(app)', 'report', 'page.tsx')

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
    expect(offendersIn(metricInWords('impressions'))).toEqual([])
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
    // Falling through unchanged is the honest answer. The page guard above is
    // what stops an unmapped key reaching a reader, so a new metric shows up as
    // a missing entry rather than as a confident wrong sentence.
    expect(metricInWords('saves')).toBe('saves')
  })
})
