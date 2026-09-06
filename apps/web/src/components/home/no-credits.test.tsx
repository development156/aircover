import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { AtAGlance } from './at-a-glance'
import { ContinueWorking } from './continue-working'
import type { DisplayPost } from '@/lib/posts/display-post'
import type { WeekBuckets } from '@/lib/planner/week'

/**
 * THE FOUNDER'S RULING: NO CREDITS ON THE HOME SCREEN.
 *
 * No credits card, no credits metric, no credits usage chart, no balance, no
 * progress bar. Credits live in the wallet. Historical credit ACTIVITY may stay
 * in the activity feed, because a record of what an action cost is not a
 * running total of what is left.
 *
 * That distinction is the whole reason this file exists. "Remove credits" reads
 * like one rule and is actually two, and the second one is easy to over-apply:
 * a later reader tidying the feed's cost column out would be deleting the
 * history the ruling explicitly kept.
 *
 * ── WHAT THIS CANNOT SEE ─────────────────────────────────────────────────────
 *  · the SHELL. The topbar carries a credits chip on all 59 routes and this
 *    change did not touch it — see the report. These cover the page only.
 *  · layout and spacing. jsdom computes none of it.
 */

const NO_POSTS: DisplayPost[] = []
const NO_WEEK = { days: [] } as unknown as WeekBuckets

function board(analytics: unknown) {
  return render(
    <AtAGlance
      posts={NO_POSTS}
      buckets={NO_WEEK}
      publish={{ status: 'ok', live: 0 } as never}
      analytics={analytics as never}
    />,
  )
}

describe('the status board carries no balance', () => {
  it('names no credit anywhere in the four figures', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: the `Credits left` card restored to the
     * fourth slot, which is where it sat until the founder's ruling and which
     * is the single most likely thing for a later reader to put back.
     */
    const { container } = board({ kind: 'not-connected' })
    expect(container.textContent).not.toMatch(/credit/i)
    expect(screen.queryByRole('link', { name: /wallet/i })).toBeNull()
  })

  it('shows the reach a platform actually reported', () => {
    board({ kind: 'ready', insights: [{ label: 'Reach', value: 12400 }], insightsLagHours: 48 })
    expect(screen.getByText('12,400')).toBeTruthy()
  })

  it('marks reach absent rather than printing a zero when nothing is connected', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: `value={reach ?? 0}`. Reach is the one slot
     * on this board that comes from a platform rather than from rows this
     * product owns, so a zero here would be a measured nothing that nothing
     * measured. The other three may legitimately read 0.
     */
    board({ kind: 'not-connected' })
    expect(screen.getByText(/Reach has not been measured yet/i)).toBeTruthy()
    expect(screen.getByText(/connect a channel/i)).toBeTruthy()
  })

  it('tells a failed read apart from an account that reported nothing', () => {
    // Two different facts, two different sentences, and only one is the
    // reader's to fix. A shared "no data" would send them to the wrong screen.
    board({ kind: 'ready', insights: [], insightsLagHours: 48 })
    expect(screen.getByText(/has not reported it yet/i)).toBeTruthy()
    board({ kind: 'unreadable' })
    expect(screen.getByText(/could not read it just now/i)).toBeTruthy()
  })
})

describe('the page itself no longer renders the spend chart', () => {
  const page = readFileSync(join(process.cwd(), 'src/app/(app)/home/page.tsx'), 'utf8')

  it('does not import or render the credit usage chart', () => {
    /**
     * A SOURCE-TEXT ASSERTION, deliberately, and it is the weaker kind: it
     * proves the component is not referenced, not that nothing draws credits.
     * It is here because rendering this page in jsdom needs a Clerk session and
     * eight live reads, and a guard that cannot run is worth less than a blunt
     * one that can. The rendering claims above are the real cover.
     */
    expect(page).not.toMatch(/SpendCard/)
  })

  it('reads the wallet only to ask whether a workspace EXISTS, never for a figure', () => {
    /**
     * WRITTEN THE WRONG WAY FIRST, AND THE CODE WAS RIGHT. The first version
     * asserted the page does not call `readBalance` at all — and it must, because
     * `balance.status === 'no-workspace'` is how this route knows to show the
     * first-run screen instead of a dashboard. Removing that read would have sent
     * every brand-new account to an empty dashboard.
     *
     * So the line is drawn where it actually belongs: `.status` is an existence
     * check and may stay; `.balance` is the money and may not appear. That is the
     * mutation this now catches — any figure pulled off the wallet read.
     */
    expect(page).toMatch(/balance\.status/)
    expect(page).not.toMatch(/balance\.balance/)
  })

  it('keeps the spend READ, which decides whether this workspace has started', () => {
    // `readSpend` is not decoration here: an empty spend history is one of the
    // five signals behind the "nothing has happened yet" screen. Removing the
    // chart and the read together would silently change which screen a brand
    // new workspace sees.
    expect(page).toMatch(/readSpend/)
  })
})

describe('the paid door says what it costs', () => {
  it('prints the price it was given, never one of its own', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: a literal `20` typed into the component.
     * The price comes from the pricing config through the page; a number
     * written here is one that can disagree with what the server charges.
     *
     * A PRICE IS NOT A BALANCE. The founder's ruling removes the balance and
     * this product's own rule requires a cost before a spend, so this label is
     * what makes the removal safe rather than careless.
     */
    const { container, unmount } = render(<ContinueWorking planCost={37} />)
    // The figure and its word are two elements, so the text is read off the
    // node that holds both rather than matched as one string.
    expect(container.textContent?.replace(/\s+/g, ' ')).toContain('37 credits')
    unmount()

    /**
     * AND A PRICE OF ONE IS "credit", NOT "credits". `credit-words.test.ts`
     * scans the whole tree for a figure that can be 1 beside a hard-coded
     * plural, and it caught this exact line on its first run. Pinned here so the
     * fix cannot be undone without a red test in the same file as the code.
     */
    render(<ContinueWorking planCost={1} />)
    expect(screen.getByText('1').parentElement?.textContent).toMatch(/1 credit$/)
  })

  it('spends no brand fill at all, so the screen keeps one primary', () => {
    /**
     * THE MUTATION THIS EXISTS FOR: an orange door. docs/37 §16 allows ONE solid
     * brand fill per view and the Create button in the header already spends it;
     * a second here would leave the screen with two primaries and therefore
     * none. This row earns its weight from edges, not from colour.
     */
    const { container } = render(<ContinueWorking planCost={20} />)
    expect(container.querySelector('.bg-brand')).toBeNull()
    expect(container.querySelector('.bg-brand-wash')).toBeNull()
  })
})
