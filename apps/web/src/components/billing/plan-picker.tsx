'use client'

import { useState, useTransition } from 'react'
import { PLAN_CATALOG, type PlanId, type SubscriptionView } from '@sahoda/shared'

import {
  cancelPlanDowngrade,
  previewPlanChange,
  schedulePlanDowngrade,
  startPlanUpgrade,
} from '@/app/actions/billing'
import { Button } from '@/components/ui/button'
import { Tile } from '@/components/ui/tile'
import type { PlanActionState, PlanPreviewState } from '@/lib/billing/plan-state'
import {
  count,
  onDate,
  planChangeAction,
  planIncludes,
  prorationSummary,
  rupees,
} from '@/lib/billing/plan-copy'

/**
 * Changing plan.
 *
 * ── THE SIGNATURE OF THIS SCREEN ─────────────────────────────────────────────
 * The Certainty System's rungs mean HOW REAL a thing is, and a billing screen is a stack of
 * claims at three different certainties. So they are used here for exactly what they mean,
 * not as decoration:
 *
 *   `.is-real`      the plan you are on          — it happened
 *   `.is-committed` a change already scheduled   — someone decided
 *   `.is-proposed`  what a change WOULD cost     — Sahoda suggests, nobody has agreed
 *
 * The preview below renders on the PROPOSED rung, dashed, and pressing the button is
 * literally the act that moves it up a rung. A reader can watch the certainty change. That
 * is the one memorable thing on this screen and everything around it stays quiet.
 *
 * ── COSTS SHOWN BEFORE SPEND ─────────────────────────────────────────────────
 * A non-negotiable, and a plan change is the one purchase here whose amount is not a
 * catalogue price. So the preview spells out the arithmetic — the charge, the set-off, the
 * total, the credits — rather than presenting a single unexplained number. Every figure is
 * computed on the SERVER by `previewPlanChange`; nothing here does money arithmetic, so
 * nothing here can disagree with what the card is charged.
 */
export function PlanPicker({ subscription }: { subscription: SubscriptionView }) {
  const [selected, setSelected] = useState<PlanId | null>(null)
  const [preview, setPreview] = useState<PlanPreviewState | null>(null)
  const [outcome, setOutcome] = useState<PlanActionState | null>(null)
  const [pending, startTransition] = useTransition()

  const plans = Object.values(PLAN_CATALOG)

  function choose(planId: PlanId) {
    setSelected(planId)
    setPreview(null)
    setOutcome(null)
    startTransition(async () => {
      setPreview(await previewPlanChange(planId))
    })
  }

  function commit() {
    if (!preview?.ok || !selected) return
    setOutcome(null)
    startTransition(async () => {
      if (preview.proration.kind === 'downgrade') {
        setOutcome(await schedulePlanDowngrade(selected))
        return
      }
      const checkout = await startPlanUpgrade(selected)
      setOutcome(
        checkout.ok
          ? checkout.simulated
            ? {
                ok: true,
                message:
                  `A real ${checkout.mode} order was opened for ` +
                  `${rupees(checkout.amountDuePaise)}. Nothing was charged and no credits ` +
                  `were added — the payment page is not reachable from the app yet.`,
              }
            : { ok: true, message: 'Checkout is ready. Credits land once the payment clears.' }
          : { ok: false, message: checkout.message },
      )
    })
  }

  return (
    <section data-guide="plan.picker" className="surface-ring rounded-card bg-surface px-4 py-4">
      <h2 className="type-h2">Change plan</h2>

      {subscription.pendingPlanId && subscription.pendingPlanEffectiveAt ? (
        <PendingChange
          planId={subscription.pendingPlanId}
          effectiveAt={subscription.pendingPlanEffectiveAt}
          onCancelled={setOutcome}
        />
      ) : null}

      {/*
        TILES, not cards. A card is a container and is not an answer to a question; a tile IS
        an option, so it is a real control, shows selection, and is reachable by keyboard
        (docs/26 §10.1). `/create/post`'s channel grid is the same pattern.

        `narrow` / `wide`, NOT `sm` / `lg`. `globals.css` sets `--breakpoint-*: initial`,
        which deletes Tailwind's default breakpoints entirely — only `narrow` (700px) and
        `wide` (1180px) exist. `sm:grid-cols-2 lg:grid-cols-4` compiles, ships, and does
        absolutely nothing; the first screenshot showed four full-width stacked tiles at
        1280px. There is no warning for this, only the rendered page.
      */}
      {/*
        TWO columns above 700px, never four. `Tile` truncates its meta line, and at four
        across the meta rendered as "₹1,499 a month · 5,000 c…" — the price survived and the
        credit allowance, which is half the reason to choose a plan, was cut off. Shortening
        the meta to fit would have dropped "a month", and whether ₹1,499 is monthly or
        one-time is not a detail to leave implied on a page about money.
      */}
      <div className="mt-3 grid gap-2 narrow:grid-cols-2">
        {plans.map((plan) => (
          <Tile
            key={plan.id}
            selected={selected === plan.id}
            onClick={() => choose(plan.id)}
            title={plan.name}
            meta={`${rupees(plan.priceInr * 100)}${plan.priceInr === 0 ? '' : ' a month'} · ${count(plan.monthlyCredits)} credits`}
          />
        ))}
      </div>

      {/* Pending is never a bare spinner — say what is happening. */}
      <p aria-live="polite" className="type-sm mt-3 min-h-[18px] text-muted">
        {pending ? 'Working out what that would cost…' : ''}
      </p>

      {preview ? <Preview preview={preview} pending={pending} onCommit={commit} /> : null}
      {outcome ? <Outcome outcome={outcome} /> : null}

      {selected === null && !pending ? (
        <p className="type-sm text-muted">
          Pick a plan to see exactly what it would cost today. Nothing is charged until you say so.
        </p>
      ) : null}
    </section>
  )
}

/** The proposed rung: dashed, because nobody has agreed to it yet. */
function Preview({
  preview,
  pending,
  onCommit,
}: {
  preview: PlanPreviewState
  pending: boolean
  onCommit: () => void
}) {
  if (!preview.ok) {
    return (
      <div role="alert" className="type-body rounded-input bg-warn-bg px-3 py-2.5 text-warn">
        {preview.message} Nothing was charged.
      </div>
    )
  }

  const { proration, impact } = preview

  if (proration.kind === 'same') {
    return (
      <p className="type-body text-muted">
        You are already on {PLAN_CATALOG[proration.toPlanId].name}.
      </p>
    )
  }

  return (
    <div className="is-proposed rounded-card px-3 py-3">
      <p className="type-eyebrow text-muted">If you make this change</p>
      <ul className="mt-2 space-y-1">
        {prorationSummary(proration).map((line) => (
          <li key={line} className="type-body num">
            {line}
          </li>
        ))}
      </ul>

      {impact && impact.over.length > 0 ? (
        <p className="type-body mt-3 border-t border-line-soft pt-3">
          <span className="font-[650]">What you keep. </span>
          {impact.over.map((o) => `${o.have} of ${o.allowed} ${o.dimension}`).join(', ')}. Nothing
          is removed — every channel, site and post stays exactly where it is. You just cannot add
          more until you are back under the limit.
        </p>
      ) : null}

      {/*
        The counts could not be read. "Nothing is over your limit" and "we could not count
        what you have" are different claims, and only one of them should let somebody press
        this button without a warning.
      */}
      {impact === null ? (
        <p className="type-sm mt-3 border-t border-line-soft pt-3 text-muted">
          Sahoda could not count your channels and sites just now, so it cannot tell you whether
          this plan fits what you already have. Nothing is ever removed either way.
        </p>
      ) : null}

      {/* The ONE primary action on this screen. Named for the outcome, not "Continue". */}
      <Button
        type="button"
        onClick={onCommit}
        loading={pending}
        className="mt-3 w-full narrow:w-auto"
      >
        {planChangeAction(proration)}
      </Button>
    </div>
  )
}

/** The committed rung: a tint and a hairline, because someone decided and it has not happened. */
function PendingChange({
  planId,
  effectiveAt,
  onCancelled,
}: {
  planId: PlanId
  effectiveAt: string
  onCancelled: (state: PlanActionState) => void
}) {
  const [pending, startTransition] = useTransition()

  return (
    <div className="is-committed mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card px-3 py-2.5">
      <p className="type-body min-w-0">
        Moving to <span className="font-[650]">{PLAN_CATALOG[planId].name}</span> on{' '}
        <span className="num">{onDate(effectiveAt)}</span>. Until then you keep everything you have
        now.
      </p>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        loading={pending}
        onClick={() =>
          startTransition(async () => {
            onCancelled(await cancelPlanDowngrade())
          })
        }
      >
        Keep my current plan
      </Button>
    </div>
  )
}

function Outcome({ outcome }: { outcome: PlanActionState }) {
  return (
    <div
      role="status"
      className={`type-body mt-3 rounded-input px-3 py-2.5 ${
        outcome.ok ? 'bg-ok-bg text-ok' : 'bg-danger-bg text-danger'
      }`}
    >
      {outcome.message}
      {outcome.ok ? '' : ' Nothing was charged.'}
    </div>
  )
}
