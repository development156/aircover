import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  reflect,
  reflectSentence,
  MIN_POSTS_PER_GROUP,
  MIN_LEADER_MEAN,
  type MetricObservation,
} from './reflect'

const obs = (
  post_id: string,
  channel: MetricObservation['channel'],
  value: number,
  measured_on = '2026-08-18',
  metric = 'impressions',
): MetricObservation => ({ post_id, channel, metric, value, measured_on })

/**
 * n posts on one channel, all at the same value, spread across the window.
 *
 * ── WHY THE DAYS ROTATE, AND WHY THAT IS NOT INCIDENTAL ──────────────────────
 * Every post used to land on 2026-08-18, so each of these groups was a single
 * afternoon. That was invisible while the only gates counted posts. It stopped
 * being invisible when `MIN_MEASURED_DAYS` arrived, and six tests that meant to
 * exercise the LIFT and the LEADER MEAN failed on the day floor instead —
 * fixtures that were under-specified for what they claimed to test.
 *
 * Rotating over three days makes each group clear the floor, so a test about
 * gate 3 is about gate 3. `day` is still there for the tests that are ABOUT the
 * window, which pass a single date on purpose.
 */
function group(
  channel: MetricObservation['channel'],
  n: number,
  value: number,
  day?: string,
): MetricObservation[] {
  const WINDOW = ['2026-08-18', '2026-08-19', '2026-08-20']
  return Array.from({ length: n }, (_, i) =>
    obs(`${channel}-${i}`, channel, value, day ?? (WINDOW[i % WINDOW.length] as string)),
  )
}

describe('Reflect', () => {
  // ── THE STRUCTURAL GUARANTEE ─────────────────────────────────────────────
  it('CANNOT call a model — neither this module nor the arithmetic it delegates to', () => {
    // Read as source rather than asserted through a stub. A stub proves the
    // path not taken on ONE input; this proves there is no path at all, on
    // every input, including ones nobody thought to write a case for.
    //
    // ── THE GUARD FOLLOWED THE CODE ────────────────────────────────────────
    // The five gates moved to `lib/analytics/grouped-lift.ts` so the analytics
    // report could run the same comparison over the DAY OF THE WEEK a post went
    // out. This guard is the reason that move is safe: a guarantee that stopped
    // at this file's own imports would have been satisfied the moment the
    // arithmetic left it, while proving nothing about where the arithmetic went.
    // So the allow-list names the one sibling, and the forbidden scan runs over
    // BOTH files. Adding a third import fails here on purpose.
    const here = resolve(import.meta.dirname, 'reflect.ts')
    const delegate = resolve(import.meta.dirname, '../analytics/grouped-lift.ts')

    const src = readFileSync(here, 'utf8')
    const imports = [...src.matchAll(/^import .*?from '([^']+)'/gm)].map((m) => m[1])
    expect(imports).toEqual(['@sahoda/shared', '@/lib/analytics/grouped-lift'])

    // The delegate is a LEAF. It imports nothing at all, which is what makes the
    // two-file scan below a complete account of the reachable graph rather than
    // the first two steps of one.
    const delegateSrc = readFileSync(delegate, 'utf8')
    expect([...delegateSrc.matchAll(/^import .*?from '([^']+)'/gm)].map((m) => m[1])).toEqual([])

    // COMMENTS STRIPPED FIRST. The prose in both files explains at length that
    // they reach no model, so they contain every word a naive scan would flag —
    // and the first version of this test failed on its own explanation. A guard
    // that reads documentation instead of code is checking the one part of a
    // file that cannot execute.
    for (const text of [src, delegateSrc]) {
      const code = text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '')
        .toLowerCase()
      // BOTH SIDES LOWERCASED. The first version folded the haystack only and
      // compared it against 'runTask', so 'runtask'.includes('runTask') was false
      // for every input and the check could never fire — a guard carrying the
      // same class of flaw as the thing it guards. A mutation that injected a
      // real runTask call walked straight through it.
      for (const forbidden of ['mesh', 'runtask', 'fetch(', 'openai', 'anthropic']) {
        expect(code.includes(forbidden)).toBe(false)
      }
    }
  })

  // ── THE HONEST-EMPTY PATHS, EACH A DIFFERENT SENTENCE ────────────────────
  it('says NO HISTORY when nothing has ever been measured', () => {
    const r = reflect([])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('no_history')
    // This is the flag the cycle row stores, so the report can tell "there were
    // no learnings" apart from "there was nothing to learn from".
    expect(r.skippedNoHistory).toBe(true)
  })

  it('does NOT claim no-history when history exists but is too thin', () => {
    const r = reflect(group('instagram', 2, 500))
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('too_few_posts')
    // The distinction that matters: something WAS measured.
    expect(r.skippedNoHistory).toBe(false)
  })

  it('says SINGLE GROUP when every post is on one channel', () => {
    const r = reflect(group('instagram', 6, 500))
    expect(r.reason).toBe('single_group')
    expect(r.skippedNoHistory).toBe(false)
  })

  // ── THE CASE THAT WOULD HAVE SHIPPED A FABRICATION ───────────────────────
  it('REFUSES a comparison whose runner-up is a single post — the live data shape', () => {
    // This is production as measured on 2026-08-20: five Instagram posts at 1–3
    // impressions, and exactly ONE LinkedIn post at 63. Mean-over-mean says
    // LinkedIn wins by thirty-one fold, every figure traceable to a real row,
    // and the claim is worthless.
    const live: MetricObservation[] = [
      ...group('instagram', 5, 2, '2026-08-18'),
      obs('li-0', 'linkedin', 63, '2026-08-17'),
    ]
    const r = reflect(live)
    expect(r.learnings).toEqual([])
    // Rejected for the RIGHT reason: LinkedIn never became an arm at all, so
    // there was one eligible group, not a close call between two.
    expect(r.reason).toBe('single_group')
  })

  it('REFUSES a lift between numbers too small to mean anything', () => {
    // Both arms clear the post floor. 3-against-1 is a "three-fold lift" and is
    // two very small numbers, either of which moves when someone opens their
    // own post.
    const r = reflect([...group('instagram', 4, 3), ...group('linkedin', 4, 1)])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('numbers_too_small')
  })

  it('REFUSES a difference inside the noise', () => {
    const r = reflect([...group('instagram', 4, 100), ...group('linkedin', 4, 90)])
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('difference_too_small')
  })

  // ── THE ONE CASE THAT DOES PRODUCE A LEARNING ────────────────────────────
  it('emits a learning when all four gates clear, carrying its own evidence', () => {
    // Both groups take the rotating window. Pinning one to 2026-08-18 and the
    // other to 2026-08-19 gave a two-day window, which `MIN_MEASURED_DAYS` now
    // refuses — and refusing it is the point of the floor, not a regression.
    const r = reflect([...group('instagram', 4, 400), ...group('linkedin', 4, 100)])
    expect(r.learnings).toHaveLength(1)
    const l = r.learnings[0]!
    expect(l.leader).toBe('instagram')
    expect(l.runnerUp).toBe('linkedin')
    expect(l.leaderMean).toBe(400)
    expect(l.lift).toBe(4)
    // Every number the report will print is here, and every one is a division of
    // two numbers that came out of rows.
    expect(l.sampleSize).toBe(8)
    expect(l.postIds).toHaveLength(8)
    expect(l.windowDays).toBe(3)
    expect(r.reason).toBeNull()
    expect(r.skippedNoHistory).toBe(false)
  })

  it('emits at most one learning — it does not fill a quota', () => {
    const r = reflect([
      ...group('instagram', 4, 400),
      ...group('linkedin', 4, 100),
      ...group('x', 4, 50),
      ...group('gbp', 4, 20),
    ])
    // Four eligible channels, three possible pairings, ONE claim.
    expect(r.learnings).toHaveLength(1)
    expect(r.learnings[0]!.runnerUp).toBe('linkedin')
  })

  // ── THE COUNTING RULES ───────────────────────────────────────────────────
  it('counts a post measured on many days as ONE post', () => {
    // Three posts, each measured four times. Twelve rows, three posts — below
    // the floor of four for this arm, so nothing is emitted. If dailies were
    // counted as posts this would read as twelve and pass.
    const many = ['a', 'b', 'c'].flatMap((p) =>
      ['2026-08-16', '2026-08-17', '2026-08-18', '2026-08-19'].map((d) =>
        obs(p, 'instagram', 400, d),
      ),
    )
    const r = reflect([...many, ...group('linkedin', 3, 100)])
    // Both arms are exactly at the floor of 3, so this DOES clear — the point is
    // the counts, checked directly.
    expect(r.learnings[0]!.sampleSize).toBe(MIN_POSTS_PER_GROUP * 2)
  })

  it("averages a post's own daily readings before comparing", () => {
    const swingy = [
      obs('a', 'instagram', 1000, '2026-08-18'),
      obs('a', 'instagram', 0, '2026-08-19'),
      ...group('instagram', 2, 500),
      ...group('linkedin', 3, 100),
    ]
    const r = reflect(swingy)
    // post a averages 500, matching the other two — the leader mean is 500, not
    // dragged to 625 by counting the 1000 twice.
    expect(r.learnings[0]!.leaderMean).toBe(500)
  })

  it('ignores metrics it was not asked about', () => {
    const r = reflect(
      [
        ...group('instagram', 4, 400).map((o) => ({ ...o, metric: 'reach' })),
        ...group('linkedin', 4, 100).map((o) => ({ ...o, metric: 'reach' })),
      ],
      'impressions',
    )
    expect(r.reason).toBe('too_few_posts')
    // It was measured — just not this metric. Not a no-history claim.
    expect(r.skippedNoHistory).toBe(false)
  })

  it('does not divide by zero when the runner-up measured nothing', () => {
    const r = reflect([...group('instagram', 4, MIN_LEADER_MEAN * 10), ...group('linkedin', 4, 0)])
    // A zero arm produces no claim rather than an infinite one.
    expect(r.learnings).toEqual([])
    expect(r.reason).toBe('difference_too_small')
  })
})

/**
 * THE FLOOR THAT IS MEASURED IN TIME, NOT IN POSTS.
 *
 * Every gate that existed before counted posts, and none of them could tell six
 * posts across six days from six posts across one. One day is one afternoon,
 * and a "learning" drawn from an afternoon is written into the Brand Brain and
 * then shapes every future post — the cost of a wrong one is paid repeatedly.
 */
describe('the measured-days floor', () => {
  /** Six posts, three per channel, a big honest gap — all on ONE day. */
  function oneDay(): MetricObservation[] {
    const rows: MetricObservation[] = []
    for (let i = 0; i < 3; i += 1) {
      rows.push({
        post_id: `li-${i}`,
        channel: 'linkedin',
        metric: 'impressions',
        value: 400,
        measured_on: '2026-08-24',
      })
      rows.push({
        post_id: `ig-${i}`,
        channel: 'instagram',
        metric: 'impressions',
        value: 100,
        measured_on: '2026-08-24',
      })
    }
    return rows
  }

  it('refuses a comparison whose evidence is all from one day', () => {
    const result = reflect(oneDay())
    expect(result.learnings).toHaveLength(0)
    expect(result.reason).toBe('too_few_days')
  })

  /**
   * And it is NOT no_history. A workspace with six measured posts has history;
   * saying it has none would be a different and false claim, and the /loop page
   * branches on exactly that distinction.
   */
  it('does not call a one-day window no history', () => {
    const result = reflect(oneDay())
    expect(result.reason).not.toBe('no_history')
    expect(result.skippedNoHistory).toBe(false)
  })

  /** Two days is still an afternoon and a morning. The floor is three. */
  it('still refuses at two days', () => {
    const rows = oneDay().map((r, i) => (i % 2 === 0 ? { ...r, measured_on: '2026-08-25' } : r))
    expect(reflect(rows).reason).toBe('too_few_days')
  })

  it('allows the comparison the moment a third day is measured', () => {
    const rows = oneDay().map((r, i) => ({
      ...r,
      measured_on: ['2026-08-24', '2026-08-25', '2026-08-26'][i % 3] as string,
    }))
    const result = reflect(rows)
    expect(result.reason).toBeNull()
    expect(result.learnings).toHaveLength(1)
    expect(result.learnings[0]?.windowDays).toBe(3)
  })

  /**
   * Ordering, asserted because a workspace is usually short of several things
   * at once and only one reason is returned. Too few posts must win: waiting
   * for more days does not help somebody who has published two posts, and
   * telling them to wait would be the wrong instruction.
   */
  it('reports too_few_posts rather than too_few_days when both are true', () => {
    const thin: MetricObservation[] = [
      {
        post_id: 'a',
        channel: 'linkedin',
        metric: 'impressions',
        value: 400,
        measured_on: '2026-08-24',
      },
    ]
    expect(reflect(thin).reason).toBe('too_few_posts')
  })

  /**
   * A post measured hourly for one day is ONE day of evidence. `measured_on` is
   * the day, and counting rows instead would let a single afternoon clear a
   * floor written in days.
   */
  it('counts distinct days, not measurements', () => {
    const repeated = oneDay().flatMap((r) => [r, { ...r }, { ...r }])
    expect(reflect(repeated).reason).toBe('too_few_days')
  })
})

/**
 * THE SENTENCE THE CYCLE SUMMARY SHOWS, PER REASON.
 *
 * Every reason Reflect can return must reach a reader as its own sentence. The
 * screen used to have two sentences for six states, so five of them arrived as
 * "It read last week's numbers before planning" — true, and silent about why
 * nothing came of it.
 */
describe('reflectSentence', () => {
  const REASONS = [
    'no_history',
    'too_few_posts',
    'single_group',
    'too_few_days',
    'numbers_too_small',
    'difference_too_small',
  ] as const

  it('gives every reason a sentence, and no two the same', () => {
    const sentences = REASONS.map((r) => reflectSentence(r))
    for (const s of sentences) expect(typeof s).toBe('string')
    expect(new Set(sentences).size).toBe(REASONS.length)
  })

  /**
   * The one distinction the /loop page branches on. "We have never measured
   * anything of yours" is an admission about this product; "we measured and it
   * was too thin" is a fact about the customer's week. Collapsing them would
   * tell somebody with six measured posts that none of their posts has ever
   * been measured.
   */
  it('never claims no history for a reason that had history', () => {
    for (const reason of REASONS) {
      if (reason === 'no_history') continue
      expect(reflectSentence(reason)).not.toMatch(/no post of yours has been measured/i)
    }
  })

  /** None of these states is fixed by pressing anything, so none asks. */
  it('offers no remedy that cannot work', () => {
    for (const reason of REASONS) {
      expect(reflectSentence(reason)).not.toMatch(/\breload\b|\btry again\b|\brefresh\b/i)
    }
  })

  /**
   * A cycle that ran before `reflect_reason` existed carries null, and so does
   * a cycle that produced a learning. Inventing a sentence for either would be
   * a claim no query made.
   */
  it('says nothing for a null or unrecognised reason', () => {
    expect(reflectSentence(null)).toBeNull()
    expect(reflectSentence('a_reason_from_a_later_build')).toBeNull()
  })
})
