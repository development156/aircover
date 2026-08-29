'use client'

import dynamic from 'next/dynamic'

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
 * So it is not in the first load. `next/dynamic` puts the modal, its cards and
 * the checkout result renderer in a chunk the browser fetches after the
 * dashboard is up. The alternative was to raise the budget by 14 kB, which is
 * loosening a guard to fit the change rather than fitting the change to the
 * guard.
 *
 * ── WHAT IT COSTS, SAID PLAINLY ──────────────────────────────────────────────
 * The dialog appears a moment later than it otherwise would. That is the right
 * trade for an offer: everybody pays the dashboard's load time, and only the
 * workspaces this is mounted for pay for the dialog. `ssr: false` is deliberate
 * on top of that — the dialog decides whether to open by reading `localStorage`,
 * which does not exist on the server, so a server-rendered copy would be markup
 * that is always closed and always thrown away.
 *
 * The wrapper is separate from the page because `next/dynamic` with
 * `ssr: false` is a client-side API and `home/page.tsx` is a server component.
 */
const PlanOfferModal = dynamic(
  () => import('./plan-offer-modal').then((mod) => mod.PlanOfferModal),
  { ssr: false },
)

export interface PlanOfferMountProps {
  sessionKey: string
  plans: readonly PlanOfferRow[]
}

export function PlanOfferMount({ sessionKey, plans }: PlanOfferMountProps) {
  return <PlanOfferModal sessionKey={sessionKey} plans={plans} />
}
