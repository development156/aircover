import type { ZernioInboxMeta } from '@sahoda/publishing'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import {
  INBOX_SURFACES,
  classifyInboxResult,
  notRead,
  type InboxSurfaceKey,
} from '@/lib/inbox/emptiness'

import { SurfaceBanner, SurfaceNotice } from './surface-notice'

/**
 * The claim under test is a factual one, not a styling one: an empty list must never
 * describe the CUSTOMER'S business. "No reviews" read by a shop with forty reviews and
 * no connected profile is Sahoda getting a fact wrong about someone else's livelihood.
 */

const meta = (over: Partial<ZernioInboxMeta> = {}): ZernioInboxMeta => ({
  accountsQueried: 2,
  accountsFailed: 0,
  failedAccounts: [],
  ...over,
})

/** `connectedAccounts` defaults to 2 so "we hold connections" is the ordinary case. */
const state = (
  surface: InboxSurfaceKey,
  rows: number,
  m: ZernioInboxMeta | undefined,
  connectedAccounts = 2,
) => classifyInboxResult({ rows, meta: m, surface: INBOX_SURFACES[surface], connectedAccounts })

describe('nothing connected', () => {
  test('reviews point at Google Business Profile without claiming the shop has none', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta({ accountsQueried: 0 }), 0)} />)
    const copy = document.body.textContent ?? ''
    expect(copy).toMatch(/Google Business Profile/)
    expect(copy).not.toMatch(/\bno reviews\b/i)
  })

  test('it offers the one action that would actually change the outcome', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta({ accountsQueried: 0 }), 0)} />)
    expect(screen.getByRole('link', { name: /connections/i })).toHaveAttribute(
      'href',
      '/connections',
    )
  })

  test.each(['conversations', 'comments'] as const)(
    '%s gets the same treatment — this is not a reviews special case',
    (surface) => {
      const { container } = render(
        <SurfaceNotice state={state(surface, 0, meta({ accountsQueried: 0 }), 0)} />,
      )
      expect(container.querySelector('[data-surface-state="never_connected"]')).toBeTruthy()
      expect(document.body.textContent ?? '').toMatch(/connect/i)
    },
  )
})

describe('connected but unresolvable — the state that is not a zero', () => {
  test('does not render as never_connected when we hold an account', () => {
    const { container } = render(
      <SurfaceNotice state={state('reviews', 0, meta({ accountsQueried: 0 }), 1)} />,
    )
    expect(container.querySelector('[data-surface-state="unresolved"]')).toBeTruthy()
    expect(container.querySelector('[data-surface-state="never_connected"]')).toBeNull()
  })

  test('does not claim the shop has no reviews', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta({ accountsQueried: 0 }), 1)} />)
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/could not resolve/i)
  })

  test('still offers connections, because reconnecting is the actual fix', () => {
    render(<SurfaceNotice state={state('conversations', 0, meta({ accountsQueried: 0 }), 2)} />)
    expect(screen.getByRole('link', { name: /connections/i })).toBeInTheDocument()
  })
})

describe('never asked — our missing key, not their missing account', () => {
  test('says nothing went out, and does not claim an empty shop', () => {
    render(<SurfaceNotice state={notRead(INBOX_SURFACES.reviews)} />)
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/not a reading of your reviews/i)
  })

  test('offers no connect CTA — connecting would not fix an unprovisioned key', () => {
    render(<SurfaceNotice state={notRead(INBOX_SURFACES.reviews)} />)
    expect(screen.queryByRole('link', { name: /connections/i })).toBeNull()
  })
})

describe('asked but unanswered', () => {
  test('a total failure does not render as an empty shop', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta({ accountsFailed: 2 }))} />)
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/could not reach/i)
  })

  test('it says nothing was charged — the user did not pay for a failure', () => {
    render(<SurfaceNotice state={state('conversations', 0, meta({ accountsFailed: 1 }))} />)
    expect(document.body.textContent ?? '').toMatch(/nothing was charged/i)
  })

  test('the failing accounts are named, so the failure is actionable', () => {
    render(
      <SurfaceNotice
        state={state(
          'conversations',
          0,
          meta({
            accountsFailed: 1,
            failedAccounts: [{ platform: 'instagram', accountUsername: 'chai_co', code: '429' }],
          }),
        )}
      />,
    )
    const list = screen.getByRole('list', { name: /did not answer/i })
    expect(list.textContent).toMatch(/chai_co/)
    expect(list.textContent).toMatch(/429/)
  })
})

describe('genuinely empty', () => {
  test('only a real zero-row answer from real accounts earns "none yet"', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta())} />)
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument()
  })

  test('and it offers no connect CTA, because connecting is not the fix', () => {
    render(<SurfaceNotice state={state('reviews', 0, meta())} />)
    expect(screen.queryByRole('link', { name: /connections/i })).toBeNull()
  })
})

describe('SurfaceBanner', () => {
  test('warns above a partial list instead of hiding the rows', () => {
    render(<SurfaceBanner state={state('conversations', 5, meta({ accountsFailed: 1 }))} />)
    const banner = screen.getByRole('status')
    expect(banner.textContent).toMatch(/part of your conversations/i)
    expect(banner.textContent).toMatch(/may be missing/i)
  })

  test('stays silent when the list is complete — no banner on a healthy read', () => {
    const { container } = render(<SurfaceBanner state={state('conversations', 5, meta())} />)
    expect(container).toBeEmptyDOMElement()
  })

  test('is a status, not an alert — a partial refresh must not interrupt', () => {
    render(<SurfaceBanner state={state('conversations', 5, meta({ accountsFailed: 1 }))} />)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
