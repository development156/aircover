import { render } from '@testing-library/react'
import { describe, expect, test, vi } from 'vitest'

import { FIXTURE_SNAPSHOT } from '@/lib/radar/fixtures'
import { auditChange } from '@/lib/radar/evidence'
import type { RadarChange } from '@/lib/radar/types'

import { ChangeFeed } from './change-feed'

/**
 * NO FIGURE RENDERS ON RADAR WITHOUT A SNAPSHOT BEHIND IT.
 *
 * ── WHY THIS SCANS THE DOM AND NOT THE PROPS ────────────────────────────────
 * A test that inspected the data would prove the FIXTURE is well-formed. This
 * one renders the real components and reads the resulting document, so it proves
 * the PAGE is honest — which is the actual claim. The difference is not
 * academic: a component that receives a clean `ObservedFigure` and then prints
 * an extra number of its own passes the first test and fails this one, and that
 * is precisely the defect worth catching. Radar's whole risk is a figure
 * appearing next to real evidence and borrowing its authority.
 *
 * ── THE RULE IS STRUCTURAL, AND THE FIRST VERSION OF IT WAS NOT ─────────────
 * Every run of digits inside the feed must sit inside an element carrying one of
 * three provenances, and nothing else counts:
 *
 *   [data-observed]     a figure whose snapshot resolved against this change's
 *                       own evidence — a claim about the COMPETITOR, with a
 *                       reading behind it.
 *   [data-scan-date]    the day Sahoda looked. A fact about our own scanning.
 *   [data-credit-price] a published price out of pricing.config.json. A fact
 *                       about SAHODA, the same class of thing as a channel name.
 *
 * THE FIRST VERSION ALLOWED A PRICE BY VALUE — any number appearing anywhere in
 * pricing.config.json was admitted wherever it appeared. It was MEASURED against
 * the mutation below and PASSED: a fabricated "posting about this 3x more than
 * last month" walked through, because `post_variants` costs 3. The prices in
 * that file are 1, 2, 3, 5, 6, 12, 20, 25 and 50 — which is most of the small
 * integers a fabricated competitor figure would ever be.
 *
 * That is the guard sharing the blind spot of the code it guards, and the repair
 * is not a narrower list: it is refusing to decide provenance from a VALUE at
 * all. A price is legitimate because of WHERE it is rendered, so the price
 * carries a marker like every other vouched figure, and this scanner no longer
 * reads pricing.config.json.
 *
 * Note what is NOT on that list: a count of rows. `roadmap-honesty.spec.ts`
 * permits one, correctly, because a count of the reader's own posts is a fact
 * this product can vouch for. A count about a competitor is not the same thing —
 * "they posted 4 times" is a floor on what a weekly scraper caught, presented as
 * a measurement of what they did — so counting rows earns nothing here.
 */

// The action module is `'use server'` and reaches Clerk and Supabase on import.
// The panel under test only needs it to exist; nothing here clicks it.
vi.mock('@/app/actions/radar', () => ({
  draftFromRadarChange: () =>
    Promise.resolve({ ok: true, postId: 'p1', variants: 1, creditsCharged: 3 }),
}))

/** Same expression as `lib/radar/evidence.ts` and `roadmap-honesty.spec.ts`. */
const FIGURE = /(?<![\w—–-])\d[\d,]*(?![\w—–-])/g

/**
 * Every figure in `root` that is NOT vouched for, with the text around it.
 *
 * Walks TEXT NODES rather than reading `innerText` on the container, because a
 * whole-container read cannot say WHICH element a number came from — and
 * "somewhere on this page there is a 4" is a failure nobody can act on.
 */
const VOUCHED = '[data-observed], [data-scan-date], [data-credit-price]'

function unvouchedFigures(root: HTMLElement): string[] {
  const problems: string[] = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const found = node.textContent?.match(FIGURE)
    if (!found) continue

    const parent = node.parentElement
    if (parent?.closest(VOUCHED)) continue

    for (const raw of found) {
      problems.push(
        `"${raw}" in <${parent?.tagName.toLowerCase() ?? '?'}> — ` +
          `"${(node.textContent ?? '').trim().slice(0, 70)}"`,
      )
    }
  }
  return problems
}

const DAYS = FIXTURE_SNAPSHOT.days
const COMPETITORS = FIXTURE_SNAPSHOT.competitors

describe('every Radar figure has a snapshot behind it', () => {
  test('the change feed renders no unvouched figure', () => {
    const { container } = render(
      <ChangeFeed days={DAYS} competitors={COMPETITORS} channels={['instagram']} />,
    )
    expect(
      unvouchedFigures(container),
      "A number on Radar is a claim about someone else's business. Render it through " +
        '<Observed> so it carries the snapshot it came from, or do not render it.',
    ).toEqual([])
  })

  /**
   * THE GUARD HAS TEETH — proved by making the exact mistake it exists to catch.
   *
   * A raw `<span>{n}</span>` beside real evidence is the shape this fails on:
   * not malformed data, but a component printing a number of its own. Without
   * this case the test above passes forever on a scanner that matches nothing.
   */
  test('a bare figure printed beside real evidence is caught', () => {
    function LeakyCard() {
      return (
        <article>
          {/* Exactly what a well-meaning addition looks like: a plausible,
              useful-sounding number with nothing behind it. */}
          <p>
            Engagement rate <span>7</span>%
          </p>
        </article>
      )
    }
    const { container } = render(<LeakyCard />)
    const problems = unvouchedFigures(container)
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('"7"')
  })

  /**
   * AND THE FIGURE ITSELF IS REFUSED AT RENDER, not merely reported by a test.
   *
   * `resolveFigure` returns null for a snapshot that is not in the change's own
   * evidence, and `<Observed>` renders nothing for a null. So a malformed row in
   * production prints no number — the guarantee does not depend on this file
   * being run.
   */
  test('a figure citing a snapshot outside its evidence renders no digits at all', () => {
    const [first] = DAYS
    if (!first) throw new Error('the fixture has no days')
    const original = first.changes[0]
    if (!original) throw new Error('the fixture has no changes')

    const tampered: RadarChange = {
      ...original,
      observation: {
        ...original.observation,
        figures: original.observation.figures.map((f) => ({
          ...f,
          snapshotId: 'snap-that-does-not-exist',
        })),
      },
    }

    const { container } = render(
      <ChangeFeed
        days={[{ ...first, changes: [tampered], attempts: [] }]}
        competitors={COMPETITORS}
        channels={['instagram']}
      />,
    )

    expect(container.querySelectorAll('[data-observed]')).toHaveLength(0)
    expect(unvouchedFigures(container)).toEqual([])
  })

  /** And the same tampering is NAMED, so an engineer can find the bad row. */
  test('auditChange names the unresolvable citation rather than failing silently', () => {
    const [first] = DAYS
    const original = first?.changes[0]
    if (!original) throw new Error('the fixture has no changes')

    const tampered: RadarChange = {
      ...original,
      observation: {
        ...original.observation,
        figures: [{ label: 'Listed price', value: 120, unit: '₹', snapshotId: 'snap-9' }],
      },
    }
    expect(auditChange(tampered)).toEqual([
      `${original.id}: figure "Listed price" cites snapshot snap-9, which is not in this change's evidence`,
    ])
  })

  /** The fixture the whole screen is demonstrated on must itself be clean. */
  test('every fixture change passes its own audit', () => {
    const problems = DAYS.flatMap((day) => day.changes).flatMap(auditChange)
    expect(problems).toEqual([])
  })
})
