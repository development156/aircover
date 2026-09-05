import type { ZernioInboxMeta } from '@sahoda/publishing'
import { render, screen } from '@testing-library/react'
import { describe, expect, test } from 'vitest'

import {
  INBOX_SURFACES,
  classifyInboxResult,
  notRead,
  type InboxSurfaceKey,
} from '@/lib/inbox/emptiness'

import { SurfaceBanner } from './surface-notice'
import { ThreadPlaceholder } from './thread-placeholder'

/**
 * The claim under test is a factual one, not a styling one: an empty list must never
 * describe the CUSTOMER'S business. "No reviews" read by a shop with forty reviews and
 * no connected profile is Sahoda getting a fact wrong about someone else's livelihood.
 *
 * ── THESE TESTS MOVED, THEY WERE NOT REWRITTEN ───────────────────────────────
 * Every assertion below was written against `SurfaceNotice`, the full-page
 * treatment that the three-pane rework stopped rendering and that was deleted on
 * 2026-09-04. `ThreadPlaceholder` is what shows the same `InboxEmptiness` now,
 * and it had NO tests of its own — so the claims are retargeted rather than
 * dropped, which is the rule (CLAUDE.md: tests pin copy; retarget them, never
 * delete them).
 *
 * They read the classifier's `headline` and `body` through whichever component
 * renders them, so they survive the move unchanged: the sentences live in
 * `lib/inbox/emptiness.ts` and always did.
 */

/** Nothing is open and there is nothing TO open — the state that explains itself. */
const placeholder = (emptiness: ReturnType<typeof state>) => (
  <ThreadPlaceholder emptiness={emptiness} hasConversations={false} />
)

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

/* The CTA is selected by /connect/i, not by its exact wording. `SurfaceNotice`
   said "Open connections" and `ThreadPlaceholder` says "Connect a channel"; the
   CLAIM both make is a link to /connections, and that is what is asserted on the
   next line of each test. A selector pinned to one component's phrasing is a
   test that fails on a copy edit and passes on a broken destination. */
describe('nothing connected', () => {
  test('reviews point at Google Business Profile without claiming the shop has none', () => {
    render(placeholder(state('reviews', 0, meta({ accountsQueried: 0 }), 0)))
    const copy = document.body.textContent ?? ''
    expect(copy).toMatch(/Google Business Profile/)
    expect(copy).not.toMatch(/\bno reviews\b/i)
  })

  test('it offers the one action that would actually change the outcome', () => {
    render(placeholder(state('reviews', 0, meta({ accountsQueried: 0 }), 0)))
    expect(screen.getByRole('link', { name: /connect/i })).toHaveAttribute('href', '/connections')
  })

  test.each(['conversations', 'comments'] as const)(
    '%s gets the same treatment — this is not a reviews special case',
    (surface) => {
      const { container } = render(placeholder(state(surface, 0, meta({ accountsQueried: 0 }), 0)))
      expect(container.querySelector('[data-surface-state="never_connected"]')).toBeTruthy()
      expect(document.body.textContent ?? '').toMatch(/connect/i)
    },
  )
})

describe('connected but unresolvable — the state that is not a zero', () => {
  test('does not render as never_connected when we hold an account', () => {
    const { container } = render(placeholder(state('reviews', 0, meta({ accountsQueried: 0 }), 1)))
    expect(container.querySelector('[data-surface-state="unresolved"]')).toBeTruthy()
    expect(container.querySelector('[data-surface-state="never_connected"]')).toBeNull()
  })

  test('does not claim the shop has no reviews', () => {
    render(placeholder(state('reviews', 0, meta({ accountsQueried: 0 }), 1)))
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/could not resolve/i)
  })

  test('still offers connections, because reconnecting is the actual fix', () => {
    render(placeholder(state('conversations', 0, meta({ accountsQueried: 0 }), 2)))
    expect(screen.getByRole('link', { name: /connect/i })).toBeInTheDocument()
  })
})

describe('never asked — our missing key, not their missing account', () => {
  test('says nothing went out, and does not claim an empty shop', () => {
    render(placeholder(notRead(INBOX_SURFACES.reviews)))
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/not a reading of your reviews/i)
  })

  test('offers no connect CTA — connecting would not fix an unprovisioned key', () => {
    render(placeholder(notRead(INBOX_SURFACES.reviews)))
    expect(screen.queryByRole('link', { name: /connect/i })).toBeNull()
  })
})

describe('asked but unanswered', () => {
  test('a total failure does not render as an empty shop', () => {
    render(placeholder(state('reviews', 0, meta({ accountsFailed: 2 }))))
    const copy = document.body.textContent ?? ''
    expect(copy).not.toMatch(/\bno reviews\b/i)
    expect(copy).toMatch(/could not reach/i)
  })

  test('it says nothing was charged — the user did not pay for a failure', () => {
    render(placeholder(state('conversations', 0, meta({ accountsFailed: 1 }))))
    expect(document.body.textContent ?? '').toMatch(/nothing was charged/i)
  })

  test('the failing accounts are named, so the failure is actionable', () => {
    render(
      placeholder(
        state(
          'conversations',
          0,
          meta({
            accountsFailed: 1,
            failedAccounts: [{ platform: 'instagram', accountUsername: 'chai_co', code: '429' }],
          }),
        ),
      ),
    )
    const list = screen.getByRole('list', { name: /did not answer/i })
    expect(list.textContent).toMatch(/chai_co/)
    expect(list.textContent).toMatch(/429/)
  })
})

describe('genuinely empty', () => {
  test('only a real zero-row answer from real accounts earns "none yet"', () => {
    render(placeholder(state('reviews', 0, meta())))
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument()
  })

  test('and it offers no connect CTA, because connecting is not the fix', () => {
    render(placeholder(state('reviews', 0, meta())))
    expect(screen.queryByRole('link', { name: /connect/i })).toBeNull()
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
