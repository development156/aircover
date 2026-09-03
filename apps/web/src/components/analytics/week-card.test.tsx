import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ReportExample } from './report-example'
import { WeekCard } from './week-card'
import type { WeekReport } from '@/lib/analytics/week-report'

/**
 * WHAT ACTUALLY REACHES THE SCREEN.
 *
 * `week-report.test.ts` proves the arithmetic refuses to fabricate and
 * `week-copy.test.ts` proves the sentences keep the six refusals apart. This
 * proves the MARKUP does not undo either of them: that a null total renders as a
 * dash rather than a "0", that a ranking never appears without the age that makes
 * it fair, that "what Sahoda changed" never lists something it merely planned,
 * and that the example report cannot be read as the customer's own figures.
 *
 * Asserted on TEXT, never on colour: the design system forbids any state that
 * reads through colour alone, and jsdom does not resolve custom properties.
 */

const BASE: WeekReport = {
  key: '2026-W34',
  isoYear: 2026,
  isoWeek: 34,
  startsOn: '2026-08-17',
  endsOn: '2026-08-23',
  posts: 4,
  channels: ['instagram'],
  verdict: { basis: 'weekday', comparison: { kind: 'none', reason: 'too_few_posts' } },
  normals: [],
  ranked: null,
  total: null,
  changes: null,
}

describe('WeekCard', () => {
  test('renders a dash for a total nothing reported, and never a zero', () => {
    render(<WeekCard week={BASE} />)
    expect(screen.getByText('—')).toBeTruthy()
    // The claim: an absent measurement is never drawn as a measurement of
    // nothing. A "0" here would tell somebody their posts reached nobody.
    expect(screen.queryByText('0')).toBeNull()
  })

  test('states the coverage when only some of the week reported', () => {
    render(<WeekCard week={{ ...BASE, total: { value: 1240, measured: 2, of: 4 } }} />)
    // The figure and its denominator arrive together. A total from half the week
    // that does not say so is a subtotal wearing a total's clothes.
    expect(screen.getByText(/1,240/)).toBeTruthy()
    expect(screen.getByText(/2 of 4 channels reported/)).toBeTruthy()
  })

  test('does not claim partial coverage when everything reported', () => {
    render(<WeekCard week={{ ...BASE, total: { value: 1240, measured: 4, of: 4 } }} />)
    expect(screen.queryByText(/of 4 channels reported/)).toBeNull()
  })

  test('never calls the summed figure a count of people', () => {
    render(<WeekCard week={{ ...BASE, total: { value: 1240, measured: 4, of: 4 } }} />)
    // THE CLAIM THIS PINS. Reach summed across posts counts one person once per
    // post they saw, so "people reached" would be false by however much the
    // audience overlaps. The label may be reworded freely; it may not start
    // claiming a unique count.
    const body = document.body.textContent ?? ''
    expect(body).not.toMatch(/people reached/i)
    expect(body).toMatch(/counted twice/i)
  })

  test('a ranking never appears without the age that makes it fair', () => {
    render(
      <WeekCard
        week={{
          ...BASE,
          ranked: {
            top: { postId: 'a', title: 'Monsoon offer', channel: 'instagram', value: 1410 },
            bottom: { postId: 'b', title: 'Our story', channel: 'instagram', value: 190 },
            ageDays: 7,
            of: 4,
          },
        }}
      />,
    )
    expect(screen.getByText('Monsoon offer')).toBeTruthy()
    expect(screen.getByText('Our story')).toBeTruthy()
    // Without this sentence the two cards are lifetime totals of different ages,
    // which ranks publish dates and calls the result performance.
    expect(document.body.textContent ?? '').toMatch(/7 days after they went out/i)
  })

  test('a ranking of one post is not rendered as best and worst', () => {
    render(<WeekCard week={{ ...BASE, ranked: null }} />)
    expect(screen.queryByText(/worked best/i)).toBeNull()
    expect(screen.queryByText(/worked least/i)).toBeNull()
  })

  test('tells "the Loop never ran" apart from "it ran and changed nothing"', () => {
    const { unmount } = render(<WeekCard week={BASE} />)
    const neverRan = document.body.textContent ?? ''
    expect(neverRan).toMatch(/not planning your weeks yet/i)
    unmount()

    render(
      <WeekCard
        week={{
          ...BASE,
          changes: { isoYear: 2026, isoWeek: 34, did: [], nothingReason: 'difference_too_small' },
        }}
      />,
    )
    const ranAndDeclined = document.body.textContent ?? ''
    // Two different facts about the account. Collapsing them tells one of the
    // two customers something false about why nothing happened.
    expect(ranAndDeclined).not.toMatch(/not planning your weeks yet/i)
    expect(ranAndDeclined).toMatch(/close enough/i)
  })

  test('says nothing about a reason it does not recognise, rather than inventing one', () => {
    render(
      <WeekCard
        week={{
          ...BASE,
          changes: {
            isoYear: 2026,
            isoWeek: 34,
            did: [],
            nothingReason: 'a_reason_from_the_future',
          },
        }}
      />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/did not record why/i)
    // The forbidden claim: a specific reason for a value nothing in this build
    // stored. Any of the six known sentences appearing here would be invented.
    expect(body).not.toMatch(/close enough|too few|one group|couple of days/i)
  })

  test('lists what Sahoda changed with the reason it gave at the time', () => {
    render(
      <WeekCard
        week={{
          ...BASE,
          changes: {
            isoYear: 2026,
            isoWeek: 34,
            did: [{ what: 'Monsoon offer', why: 'Your Tuesday posts reach more people.' }],
            nothingReason: null,
          },
        }}
      />,
    )
    expect(screen.getByText('Monsoon offer')).toBeTruthy()
    expect(screen.getByText(/Your Tuesday posts reach more people/)).toBeTruthy()
  })
})

describe('ReportExample', () => {
  test('cannot be read as the customer’s own figures', () => {
    render(
      <ReportExample
        headline="Your first report arrives the week after your first post goes out"
        detail="Sahoda writes one of these every week."
        action={{ label: 'Write a post', href: '/posts/new' }}
      />,
    )
    const body = document.body.textContent ?? ''
    // THE CLAIM THIS PINS, and the only thing that makes a screen full of
    // invented numbers legitimate in a product that may never show one: the
    // sample is labelled as a sample, twice, and names whose figures they are.
    expect(body).toMatch(/example/i)
    expect(body).toMatch(/not your figures/i)
    expect(body).toMatch(/made-up bakery/i)
  })

  test('the sample is inert, so none of its posts can be opened', () => {
    render(<ReportExample headline="Nothing yet" detail="Nothing yet." action={null} />)
    const sample = screen.getByTestId('report-example')
    // `pointer-events-none` and `select-none`: nothing in the sample is a real
    // post, so nothing in it may be clicked or lifted out of its context.
    expect(sample.className).toMatch(/pointer-events-none/)
    expect(sample.className).toMatch(/select-none/)
  })

  test('offers no action when there is none that would help', () => {
    render(<ReportExample headline="No workspace" detail="Nothing to measure." action={null} />)
    // A button that cannot fix the stated cause is worse than no button:
    // `e2e/no-impossible-remedy.spec.ts` exists for exactly this failure.
    expect(screen.queryByRole('link')).toBeNull()
  })
})
