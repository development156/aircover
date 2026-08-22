import { PLAN_CATALOG, type DunningPolicy, type SubscriptionView } from '@sahoda/shared'

import { Unreadable } from '@/components/design-system/absence-row'
import { count, DUNNING_LABEL, onDate, planIncludes, rupees } from '@/lib/billing/plan-copy'
import { creditWord } from '@/lib/credit-words'

/**
 * What the customer is on, right now.
 *
 * ── THE ONE HERO NUMBER ON THIS SCREEN ───────────────────────────────────────
 * docs/26 §5: `type-hero-num` is "the ONE big number per view". On a billing screen the
 * candidates are the plan price, the credit allowance and the amount due on a change — and
 * `/home` is already the cautionary tale of what happens when two of them compete across
 * the fold ("Good evening" at 30px against a 48px credit number, so the screen has no focal
 * point at all). The price wins here because it answers the question the page is for: what
 * am I paying. The allowance is a fact ABOUT the plan and sits with the other facts.
 *
 * ── WHY THIS CARD CARRIES NO CERTAINTY RUNG ──────────────────────────────────
 * The first version wore `.is-real`, which seemed obvious: the plan you are on is the most
 * real thing on the screen. Rendered, it was a ~1,000px solid ORANGE block — the loudest
 * object in the product, on the money screen. That is verbatim the defect docs/27 §3.2
 * names about `/wallet`'s checkout bar, reproduced by reaching for a rung.
 *
 * A rung is a chip's signature, not a surface's: §1.1 allows a brand fill on "a button,
 * chip, badge, active nav wash", and a whole card is none of those. The deeper reason is
 * that certainty marking only informs where certainty VARIES. Nobody is asking whether the
 * plan they are on is real. The rungs earn their place two sections down, where a scheduled
 * change (`.is-committed`) and a priced-but-unagreed preview (`.is-proposed`) genuinely
 * differ in how real they are.
 *
 * ── AND THE ABSENCES ─────────────────────────────────────────────────────────
 * A free workspace has no renewal date, so the renewal row is OMITTED — not rendered as a
 * dash. §4: if the quantity does not exist, delete the slot. `100 of —` is the defect that
 * rule was written for and it is exactly this shape.
 */
export function CurrentPlan({
  subscription,
  policy,
}: {
  subscription: SubscriptionView
  policy: DunningPolicy
}) {
  const plan = PLAN_CATALOG[subscription.planId]
  const effective = PLAN_CATALOG[policy.effectivePlanId]
  // Suspension does not change what the customer BOUGHT, it changes what applies today.
  // Saying both is the honest version; collapsing them would hide one or the other.
  const limitsDiffer = policy.effectivePlanId !== subscription.planId

  return (
    <section data-guide="plan.current" className="surface-ring rounded-card bg-surface px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {/*
            An eyebrow LABELS a group; it is never the group's only heading (docs/26 §5). So
            the eyebrow names the section and the plan name is a real <h2> — which also gives
            the page a heading outline a screen reader can navigate. The first draft styled
            this `type-h1` on a <p>, and the browser check caught it: the whole screen had no
            headings at all.
          */}
          <p className="type-eyebrow text-muted">Your plan</p>
          <h2 className="type-h2 mt-1">{plan.name}</h2>
          <p className="type-sm mt-1 text-muted">
            {DUNNING_LABEL[policy.stage]}
            {limitsDiffer ? ` · running on ${effective.name} limits` : ''}
          </p>
        </div>

        <div className="text-right">
          {/* The one hero number. Tabular, because a price whose digits shuffle reads as unstable. */}
          <p className="type-hero-num num">{rupees(plan.priceInr * 100)}</p>
          <p className="type-sm text-muted">{plan.priceInr === 0 ? 'free, forever' : 'a month'}</p>
        </div>
      </div>

      <dl className="mt-4 grid gap-x-6 gap-y-2 border-t border-line-soft pt-4 narrow:grid-cols-2">
        <Row label="Includes">
          <span className="num">{planIncludes(subscription.planId).join(' · ')}</span>
        </Row>

        {/*
          Renews: present only when there IS a renewal. A free plan does not renew, and a
          cancelled one ends rather than renewing — three different claims, and the third is
          not a variation of the first two.
        */}
        {subscription.currentPeriodEnd ? (
          <Row label={subscription.cancelAtPeriodEnd ? 'Ends' : 'Renews'}>
            <span className="num">{onDate(subscription.currentPeriodEnd)}</span>
          </Row>
        ) : null}

        {policy.stageEndsAt ? (
          <Row label={policy.stage === 'suspended' ? 'Closes' : 'Plan stops applying'}>
            <span className="num">{onDate(policy.stageEndsAt)}</span>
          </Row>
        ) : null}

        {policy.nextRetryAt ? (
          <Row label="Card tried again">
            <span className="num">{onDate(policy.nextRetryAt)}</span>
          </Row>
        ) : null}
      </dl>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="type-sm shrink-0 text-muted">{label}</dt>
      <dd className="type-body min-w-0">{children}</dd>
    </div>
  )
}

/**
 * The plan could not be read.
 *
 * NOT a free plan, and not a zero. Rendering Free here would tell a paying customer they are
 * on the free tier because a query failed — which is the same class of mistake as rendering
 * `0 credits` for an unreadable balance, and it is the one the wallet already learned.
 */
export function PlanUnreadable() {
  return (
    <section role="alert" className="surface-ring rounded-card bg-surface px-4 py-4">
      <p className="type-eyebrow text-muted">Your plan</p>
      <h2 className="type-h3 mt-1 flex items-center gap-2">
        <Unreadable what="Your plan" />
        Sahoda could not read your plan just now
      </h2>
      <p className="type-body mt-1.5 text-muted">
        Reload to try again. Nothing has changed and nothing has been charged — this is a failed
        read, not a plan that ended.
      </p>
    </section>
  )
}

/** A workspace-less account. A plan belongs to a workspace, and there is no workspace yet. */
export function PlanNoWorkspace() {
  return (
    <section className="surface-ring rounded-card bg-surface px-4 py-4">
      <p className="type-eyebrow text-muted">Your plan</p>
      <h2 className="type-h3 mt-1">Create a workspace to choose a plan</h2>
      <p className="type-body mt-1.5 text-muted">
        Plans, credits and invoices all belong to a workspace and you don’t have one yet. Nothing
        failed and nothing was charged.
      </p>
      <p className="type-sm mt-2 text-muted">
        Your free signup credits land the moment the workspace exists — that is{' '}
        <span className="num">{count(PLAN_CATALOG.free.monthlyCredits)}</span>{' '}
        {creditWord(PLAN_CATALOG.free.monthlyCredits)}, at no cost.
      </p>
    </section>
  )
}
