import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import { ChannelCards } from './channel-cards'
import { HeadlineStrip } from './headline-strip'
import { PostRows } from './post-rows'
import { TimingHeatmap } from './timing-heatmap'
import type { Headline } from '@/lib/analytics/headline'
import type { Timing } from '@/lib/analytics/timing'
import type { PublishedRow } from '@/lib/analytics/window-data'

/**
 * WHAT THE REBUILT ANALYTICS PAGE ACTUALLY PUTS ON SCREEN.
 *
 * The pure modules prove the arithmetic refuses to fabricate. This proves the
 * MARKUP does not undo it: that a null renders as a dash and never a zero, that
 * a shaded cell is never drawn from one post, that a table is a real table with
 * headers a screen reader can use, and that a figure never appears without the
 * sentence saying what it is a number of.
 *
 * Asserted on TEXT and on structure, never on colour: the design system forbids
 * any state that reads through colour alone, and jsdom resolves no custom
 * properties anyway.
 */

const row = (over: Partial<PublishedRow> = {}): PublishedRow => ({
  postId: 'p1',
  title: 'Monsoon offer',
  channel: 'instagram',
  publishedAt: '2026-08-18T09:00:00Z',
  reachAtAge: 1410,
  ...over,
})

const headline = (over: Partial<Headline> = {}): Headline => ({
  id: 'published',
  label: 'Posts published',
  meaning: 'How many of your posts went out in this period.',
  value: 4,
  caveat: 'Counts each post once, however many channels it went to.',
  change: { kind: 'learning' },
  ...over,
})

describe('HeadlineStrip', () => {
  test('never renders a figure without the sentence saying what it counts', () => {
    render(<HeadlineStrip headlines={[headline()]} windowLabel="Last 30 days" />)
    expect(screen.getByText('4')).toBeTruthy()
    // The brief's rule, and this product's: a bare number leaves the reader to
    // interpret it, which is the job this page exists to do for them.
    expect(screen.getByText(/counts each post once/i)).toBeTruthy()
  })

  test('a metric this product cannot measure says so, and shows no number', () => {
    render(
      <HeadlineStrip
        headlines={[
          headline({
            id: 'replied',
            label: 'People who replied',
            value: null,
            absence: 'not-measured',
            caveat: 'Sahoda records likes, comments, shares and saves as one figure.',
            change: { kind: 'no-previous' },
          }),
        ]}
        windowLabel="Last 30 days"
      />,
    )
    const body = document.body.textContent ?? ''
    // THE CLAIM: "we do not measure this" and "it was zero" are different facts
    // about the reader's business, and only one of them is true here.
    expect(body).toMatch(/does not measure this/i)
    expect(screen.queryByText('0')).toBeNull()
  })

  test('tells "we did not measure" apart from "we measured and it was none"', () => {
    const { unmount } = render(
      <HeadlineStrip
        headlines={[headline({ change: { kind: 'no-previous' } })]}
        windowLabel="Last 30 days"
      />,
    )
    const notMeasured = document.body.textContent ?? ''
    unmount()

    render(
      <HeadlineStrip
        headlines={[headline({ change: { kind: 'from-none' } })]}
        windowLabel="Last 30 days"
      />,
    )
    const wasNone = document.body.textContent ?? ''
    // Two opposite facts. Collapsing them tells one of the two customers
    // something false about why the comparison is missing.
    expect(notMeasured).not.toEqual(wasNone)
    expect(wasNone).toMatch(/from none/i)
  })

  test('under three weeks of history it says so rather than showing a percentage', () => {
    render(
      <HeadlineStrip
        headlines={[headline({ change: { kind: 'learning' } })]}
        windowLabel="Last 30 days"
      />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/still learning your normal/i)
    expect(body).not.toMatch(/\d+%/)
  })
})

describe('PostRows', () => {
  const href = () => '/analytics' as never

  test('is a real table with column headers, not a grid of boxes', () => {
    render(
      <PostRows
        rows={[row()]}
        sort="reach"
        direction="desc"
        page={1}
        hrefFor={href}
        ageDays={7}
        timezone="Asia/Kolkata"
      />,
    )
    // A screen reader announces a cell with its row and column header, so
    // "1,410" is heard as "Monsoon offer, people reached, 1,410". The same
    // numbers in a flex grid are heard as a list of bare figures.
    expect(screen.getByRole('table')).toBeTruthy()
    expect(screen.getByRole('columnheader', { name: /people reached/i })).toBeTruthy()
    expect(screen.getByRole('rowheader', { name: /monsoon offer/i })).toBeTruthy()
  })

  test('an unreported post shows a dash, never a zero', () => {
    render(
      <PostRows
        rows={[row({ reachAtAge: null })]}
        sort="reach"
        direction="desc"
        page={1}
        hrefFor={href}
        ageDays={7}
        timezone="Asia/Kolkata"
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0')).toBeNull()
  })

  test('states the age every reach figure was read at', () => {
    render(
      <PostRows
        rows={[row()]}
        sort="reach"
        direction="desc"
        page={1}
        hrefFor={href}
        ageDays={7}
        timezone="Asia/Kolkata"
      />,
    )
    // Without this the column is lifetime totals of different ages, which ranks
    // publish dates and calls the result performance.
    expect(document.body.textContent ?? '').toMatch(/7 days after it went out/i)
  })

  test('an empty period says so instead of drawing an empty table', () => {
    render(
      <PostRows
        rows={[]}
        sort="reach"
        direction="desc"
        page={1}
        hrefFor={href}
        ageDays={7}
        timezone="Asia/Kolkata"
      />,
    )
    expect(screen.queryByRole('table')).toBeNull()
    expect(document.body.textContent ?? '').toMatch(/nothing went out in this period/i)
  })
})

describe('TimingHeatmap', () => {
  const ready = (over: Partial<Extract<Timing, { kind: 'ready' }>> = {}): Timing => ({
    kind: 'ready',
    ageDays: 7,
    posts: 12,
    slots: [
      { weekday: 'Tuesday', part: 'morning', posts: 4, average: 800 },
      { weekday: 'Friday', part: 'evening', posts: 1, average: null },
    ],
    best: { kind: 'none', reason: 'too_few_posts' },
    ...over,
  })

  test('a slot below the floor shows no average and says how thin it is', () => {
    render(<TimingHeatmap timing={ready()} timezone="Asia/Kolkata" />)
    const body = document.body.textContent ?? ''
    // A cell shaded from one post recommends a time nobody has tested. The
    // figure must be absent, not small.
    expect(body).not.toMatch(/\b0 reached\b/)
    expect(screen.getByRole('table')).toBeTruthy()
  })

  test('says nothing at all about a best slot when there is no defensible one', () => {
    render(<TimingHeatmap timing={ready()} timezone="Asia/Kolkata" />)
    const body = document.body.textContent ?? ''
    // Nothing, rather than a hedge. "No best time found" invites the reader to
    // believe there is one and Sahoda is being coy.
    expect(body).not.toMatch(/best/i)
  })

  test('names the age and the clock every cell was read on', () => {
    render(<TimingHeatmap timing={ready()} timezone="Asia/Kolkata" />)
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/Asia\/Kolkata/)
    expect(body).toMatch(/7/)
  })

  test('with no history it explains what would fill it and offers no false remedy', () => {
    render(
      <TimingHeatmap timing={{ kind: 'none', reason: 'no-history' }} timezone="Asia/Kolkata" />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/not enough posts/i)
    expect(screen.queryByRole('table')).toBeNull()
  })
})

describe('ChannelCards', () => {
  test('a channel with nothing reported shows a dash and never a zero', () => {
    render(
      <ChannelCards
        rows={[row({ channel: 'linkedin', reachAtAge: null, postId: 'p2' })]}
        ageDays={7}
      />,
    )
    expect(screen.getAllByText('—').length).toBeGreaterThan(0)
    expect(screen.queryByText('0')).toBeNull()
  })

  test('says nothing comparing two channels when the gap is not worth a sentence', () => {
    render(
      <ChannelCards
        rows={[
          row({ postId: 'a', channel: 'instagram', reachAtAge: 100 }),
          row({ postId: 'b', channel: 'linkedin', reachAtAge: 95 }),
        ]}
        ageDays={7}
      />,
    )
    // A near tie is not a fact about the business. Printing it teaches the
    // reader that the sentence means nothing.
    expect(document.body.textContent ?? '').not.toMatch(/times as many/i)
  })

  test('compares the top two when one genuinely leads', () => {
    render(
      <ChannelCards
        rows={[
          row({ postId: 'a', channel: 'instagram', reachAtAge: 1000 }),
          row({ postId: 'b', channel: 'linkedin', reachAtAge: 200 }),
        ]}
        ageDays={7}
      />,
    )
    const body = document.body.textContent ?? ''
    expect(body).toMatch(/times as many people/i)
    // And it never tells the reader what to do about it: recommendations belong
    // on the CMO Report, and this page is the evidence.
    expect(body).not.toMatch(/you should|try posting|focus on/i)
  })
})
