'use client'

import { Suspense, lazy, useEffect, useState } from 'react'

import type { PlanOfferRow } from '@/lib/billing/plan-offer-rows'

/**
 * THE OFFER, LOADED ON DEMAND RATHER THAN WITH THE DASHBOARD.
 *
 * ── WHY THIS WRAPPER EXISTS, AND IT IS ARITHMETIC ────────────────────────────
 * /home is the most visited screen in the product and it carries a JS budget
 * that `scripts/perf/js-budget.mjs` fails the BUILD over. This feature arrived
 * at **900.8 kB against a 670.8 kB budget**. Two measured cuts took it to 684.9:
 * reading the Clerk session on the server instead of in the browser (-140.8 kB)
 * and building the plan rows on the server (-75.1 kB). The remaining 14.1 kB is
 * the dialog itself, and there is no honest way to make a dialog weigh nothing.
 *
 * So it is not in the first load. The modal, its cards and the checkout result
 * renderer sit in a chunk the browser fetches after the dashboard is up. The
 * alternative was to raise the budget by 14 kB, which is loosening a guard to
 * fit the change rather than fitting the change to the guard.
 *
 * ── AND IT IS `React.lazy`, NOT `next/dynamic`, WHICH IS ALSO ARITHMETIC ─────
 * This used `dynamic(..., { ssr: false })`, and that call has a price nobody
 * looks for: it pulls Next's own loadable runtime — `BailoutToCSR`,
 * `LoadableComponent`, `PreloadChunks`, `createAsyncLocalStorage` — into the
 * chunk of whatever route uses it. MEASURED by diffing /home's page chunk
 * against the same build without this lane: **11,324 bytes against 7,871, so
 * +3,453**, and every identifier in the difference belongs to that runtime
 * rather than to this feature. /home was 8,382 over its budget against an 8,192
 * slack — failing by 190 bytes — and 3,453 of those were the cost of the
 * mechanism used to save 14,100.
 *
 * `React.lazy` and `Suspense` are already in the React bundle every route
 * loads, so they add nothing. What they do not do is skip SSR, which is why
 * this defers the lazy element behind `mounted` below rather than rendering it
 * straight away.
 *
 * ── WHY IT WAITS FOR THE MOUNT, STATED NO STRONGER THAN IT WAS PROVEN ───────
 * `ssr: false` was deliberate: the dialog decides whether to open by reading
 * `localStorage`, which does not exist on the server, so a server-rendered copy
 * would be markup that is always closed and always thrown away. `lazy()` does
 * not skip SSR by itself, so `mounted` does that job instead.
 *
 * The first draft of this comment claimed the gate prevents a hydration
 * mismatch. It does not, and the test written to prove it did not bite:
 * `fallback={null}` means the ungated tree ALSO renders nothing on the first
 * pass, so the DOM, `renderToString` and a `hydrateRoot` pass are identical
 * either way. `plan-offer-mount.test.tsx` records the deleted test and why.
 *
 * What the gate genuinely buys is the TIMING: the chunk is requested on the
 * frame after hydration rather than during the render that competes with the
 * dashboard's own load. That is the reason it is here, and it is the whole
 * reason.
 *
 * `fallback={null}` because there is nothing sensible to show. A skeleton of a
 * dialog nobody asked for would be worse than the dashboard the person came to
 * look at, and this is an offer rather than something they are waiting on.
 *
 * ── WHAT IT COSTS, SAID PLAINLY ──────────────────────────────────────────────
 * The dialog appears a moment later than it otherwise would. That is the right
 * trade for an offer: everybody pays the dashboard's load time, and only the
 * workspaces this is mounted for pay for the dialog.
 *
 * The wrapper is separate from the page because all of this is client-side and
 * `home/page.tsx` is a server component.
 */
const PlanOfferModal = lazy(() =>
  import('./plan-offer-modal').then((mod) => ({ default: mod.PlanOfferModal })),
)

export interface PlanOfferMountProps {
  sessionKey: string
  plans: readonly PlanOfferRow[]
}

export function PlanOfferMount({ sessionKey, plans }: PlanOfferMountProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  if (!mounted) return null

  return (
    <Suspense fallback={null}>
      <PlanOfferModal sessionKey={sessionKey} plans={plans} />
    </Suspense>
  )
}
