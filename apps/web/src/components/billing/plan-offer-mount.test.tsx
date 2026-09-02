import { describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'

import { planOfferRows } from '@/lib/billing/plan-offer-rows'
import { PlanOfferMount } from './plan-offer-mount'

/**
 * THE LOADING BOUNDARY, WHICH IS THE PART THAT IS EASY TO GET WRONG SILENTLY.
 *
 * `plan-offer-modal.test.tsx` covers what the dialog does. This covers only how
 * it arrives, because the wrapper changed from `next/dynamic` to `React.lazy`
 * for a measured reason and the two fail differently when broken.
 *
 * ── THE `mounted` GATE HAS NO TEST HERE, AND THAT IS A MEASUREMENT ──────────
 * `dynamic(..., { ssr: false })` skipped server rendering by itself. `lazy()`
 * does not, so the wrapper renders nothing until an effect has run, and the
 * obvious test to write is "renders nothing on the first pass".
 *
 * That test was written, and it did not bite. Deleting the gate left it GREEN.
 * The reason is `fallback={null}`: with the gate, the first render is null
 * because the component returns null; without it, the first render is null
 * because Suspense shows a null fallback. The DOM is identical in both, and so
 * is `renderToString`'s output and a `hydrateRoot` pass over it. The only thing
 * the gate actually changes is WHEN the chunk is requested, which no assertion
 * in jsdom can observe.
 *
 * So it is stated rather than asserted: the gate exists so the request starts
 * after hydration instead of competing with the dashboard's own load, and a
 * test that cannot fail was removed rather than left standing as if it covered
 * that.
 *
 * ── WHAT IT CANNOT SEE ──────────────────────────────────────────────────────
 *  · THE `mounted` GATE, per the note above. Removing it breaks nothing any
 *    assertion here can reach, and the two tests below pass with or without it.
 *    `next build` is what proves the server render does not throw, and it
 *    proves it by not throwing rather than by an assertion.
 *  · The byte cost that motivated the change. That is a build-time measurement
 *    and it belongs to `scripts/perf/js-budget.mjs`, which fails the build over
 *    it; nothing in a unit test would notice `next/dynamic` coming back.
 *  · Whether the chunk is actually split. Vitest resolves the dynamic import
 *    eagerly through its own module graph, so a static import here would look
 *    identical.
 */

vi.mock('@/app/actions/wallet', () => ({
  startCheckout: vi.fn(),
}))

describe('the plan offer mount', () => {
  it('brings the dialog in after mounting', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.open = false
    })
    window.localStorage.clear()

    render(<PlanOfferMount sessionKey="sess_b" plans={planOfferRows()} />)

    // Deferring must not mean never: the offer still has to reach the person.
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Choose the right plan for you' })).toBeVisible(),
    )
  })

  it('passes the session key through, so the dismissal is scoped to this sign-in', async () => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.open = true
    })
    // A wrapper that swallowed the prop would silence the offer for a session
    // that had never seen it, or show it again to one that had. Storing the key
    // it was handed is the observable half of that.
    window.localStorage.setItem('sahoda.plan-offer-dismissed', 'sess_c')
    const { container } = render(<PlanOfferMount sessionKey="sess_c" plans={planOfferRows()} />)

    await waitFor(() => expect(container.querySelector('dialog')).toBeNull())
  })
})
