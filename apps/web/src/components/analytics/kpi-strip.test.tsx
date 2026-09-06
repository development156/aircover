import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'

import { KpiStrip } from './kpi-strip'
import type { Kpi } from '@/lib/analytics/kpi'

const kpi = (over: Partial<Kpi> = {}): Kpi => ({
  id: 'reach-total',
  label: 'Reach across your posts',
  value: 1200,
  format: 'count',
  caveat: 'Added up post by post.',
  footer: { kind: 'change', change: { kind: 'no-previous' } },
  ...over,
})

describe('KpiStrip', () => {
  it('renders a percentage as a percentage and a count as a count', () => {
    render(
      <KpiStrip
        kpis={[
          kpi({ id: 'engagement-rate', value: 0.0437, format: 'percent' }),
          kpi({ value: 1200, format: 'count' }),
        ]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText('4.4%')).toBeTruthy()
    expect(screen.getByText('1,200')).toBeTruthy()
  })

  it('says WHICH kind of nothing, never a zero', () => {
    render(
      <KpiStrip
        kpis={[kpi({ value: null, absence: 'not-connected' })]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText(/No account connected/i)).toBeTruthy()
    expect(screen.queryByText('0')).toBeNull()
  })

  it('keeps "no account connected" and "could not read" as different sentences', () => {
    const { unmount } = render(
      <KpiStrip
        kpis={[kpi({ value: null, absence: 'not-connected' })]}
        windowLabel="Last 30 days"
      />,
    )
    const connected = document.body.textContent ?? ''
    unmount()
    render(
      <KpiStrip kpis={[kpi({ value: null, absence: 'unreadable' })]} windowLabel="Last 30 days" />,
    )
    expect(document.body.textContent).not.toBe(connected)
  })

  it('states the denominator when the sum covered fewer posts than the window holds', () => {
    render(
      <KpiStrip kpis={[kpi({ coverage: { measured: 4, posts: 9 } })]} windowLabel="Last 30 days" />,
    )
    expect(screen.getByText(/From 4 of 9 posts measured/i)).toBeTruthy()
  })

  it('spells the direction in words, so the colour is never the only signal', () => {
    render(
      <KpiStrip
        kpis={[
          kpi({
            footer: {
              kind: 'change',
              change: { kind: 'compared', direction: 'down', percent: 20, previous: 50 },
            },
          }),
        ]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText(/Down 20%/i)).toBeTruthy()
  })

  it('links the best post to the post it names', () => {
    render(
      <KpiStrip
        kpis={[
          kpi({
            id: 'best-post',
            text: 'Diwali offer',
            link: { label: 'Open the post', href: '/posts/abc' },
          }),
        ]}
        windowLabel="Last 30 days"
      />,
    )
    expect(screen.getByText('Diwali offer')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Open the post' }).getAttribute('href')).toBe(
      '/posts/abc',
    )
  })
})
