import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { AccountPanel } from './account-panel'
import { ReadinessLine } from './readiness-line'
import { analyticsReadiness } from '@/lib/analytics/readiness'
import type { AccountAnalytics } from '@/lib/analytics/account-insights'

/**
 * ONE REASON, STATED ONCE, ON /analytics.
 *
 * ── THE DEFECT, AND THE FACT THAT IT CAME BACK ───────────────────────────────
 * docs/40 §3.4 ruling 1 counted six statements of one cause on this screen and
 * was implemented as `analyticsReadiness` plus `ReadinessLine` plus a
 * `reasonStated` prop on each section. The 2026-08-29 rebuild replaced that
 * mechanism with a whole-page early return gated on `!hasPublished`, and wrote
 * five new sections that each diagnose the page's single shared cause on their
 * own.
 *
 * So the collapse applied only to a workspace that had NEVER published — the
 * exact "one state too early" error docs/40 §3.1 was written to correct. A
 * workspace one step further along (posts out, nothing connected, which is where
 * a beta account sits after its first hour) got the apology five times over.
 * `readiness.ts` and its tests were left in the tree with no importer, and
 * `reasonStated` was pinned to `false` at the only call site.
 *
 * ── WHAT THESE GUARD ─────────────────────────────────────────────────────────
 * The claim, not the wording: for one blocked state, the cause is stated once and
 * the remedy is offered once. Rewrite either sentence freely and the guarantee
 * survives. The last test is a shape gate on the regression itself, because the
 * mechanism did not break by being wrong — it broke by being disconnected, and
 * nothing renders a page you have stopped calling.
 */

const NOT_CONNECTED = { kind: 'not-connected' } as const

/** Connected and reporting nothing: the `waiting` case, same shape readiness.test.ts uses. */
const READY_EMPTY: AccountAnalytics = {
  kind: 'ready',
  followers: [],
  gained: [],
  lost: [],
  insights: [],
  followerLagHours: 24,
  insightsLagHours: 48,
  nothingReported: true,
}

describe('the page states its one cause once', () => {
  it('offers the remedy once when the line and the panel are both on screen', () => {
    const readiness = analyticsReadiness({
      account: NOT_CONNECTED,
      hasPublished: true,
      measuredRows: 0,
    })

    const { container } = render(
      <>
        <ReadinessLine readiness={readiness} />
        <AccountPanel analytics={NOT_CONNECTED} reasonStated={readiness.kind !== 'measuring'} />
      </>,
    )

    // ── COUNTED BY DESTINATION, NOT BY LABEL, AND THAT MATTERS ──────────────
    // The first version of this asserted two links named "Connect a channel".
    // It could not fail: the panel's own link reads "Open connections", so
    // breaking the collapse left the assertion matching exactly one link while
    // TWO were on screen. Counting the href is the property — one door to
    // /connections, whatever each copy happens to call it.
    expect(container.querySelectorAll('a[href="/connections"]')).toHaveLength(1)
  })

  it('the panel keeps its container and falls back to a slot-level sentence', () => {
    render(<AccountPanel analytics={NOT_CONNECTED} reasonStated />)

    // The container stands. A reader who cannot see that this product measures
    // followers at all is worse off than one looking at an empty slot.
    expect(screen.getByText(/instagram account/i)).toBeInTheDocument()
    expect(screen.getByText(/appear here once an account is linked/i)).toBeInTheDocument()
  })

  it('says nothing at all once anything has a number', () => {
    const readiness = analyticsReadiness({
      account: NOT_CONNECTED,
      hasPublished: true,
      measuredRows: 1,
    })

    const { container } = render(<ReadinessLine readiness={readiness} />)

    expect(readiness.kind).toBe('measuring')
    expect(container).toBeEmptyDOMElement()
  })

  /**
   * `waiting` deliberately carries no remedy: everything that could report is in
   * place and the readings are on the platform's clock. A button there would
   * invite somebody to fix a thing that is not broken.
   */
  it('offers no button while there is genuinely nothing to do', () => {
    const readiness = analyticsReadiness({
      account: READY_EMPTY,
      hasPublished: true,
      measuredRows: 0,
    })

    render(<ReadinessLine readiness={readiness} />)

    expect(readiness.kind).toBe('waiting')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })
})

/**
 * The mechanism was reconnected by hand once. This is what stops it being
 * disconnected again, and it is a source gate rather than a render gate because
 * the failure mode is a page that stopped CALLING it — which no rendering test
 * of the mechanism itself can see.
 */
describe('the page is actually wired to the mechanism', () => {
  // Anchored on the package root rather than on `import.meta.url`. The `ui`
  // vitest project resolves that to a root-relative path, unlike the `lib` one,
  // so the join produced `/src/app/...` and read nothing.
  const PAGE = join(process.cwd(), 'src', 'app', '(app)', 'analytics', 'page.tsx')

  it('computes a readiness and renders the line', () => {
    const source = readFileSync(PAGE, 'utf8')

    expect(source).toMatch(/analyticsReadiness\(/)
    expect(source).toMatch(/<ReadinessLine/)
  })

  it('never pins reasonStated to a literal, which is how the collapse was lost', () => {
    const source = readFileSync(PAGE, 'utf8')

    expect(source).not.toMatch(/reasonStated=\{false\}/)
    expect(source).toMatch(/reasonStated=\{readiness\./)
  })
})
