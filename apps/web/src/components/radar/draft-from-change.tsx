'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { PenLine } from 'lucide-react'
import { creditCost, type Channel } from '@sahoda/shared'

import { draftFromRadarChange } from '@/app/actions/radar'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { InlineError } from '@/components/posts/inline-error'
import { CHANNEL_LABELS } from '@/components/posts/channel-label'
import type { DraftFromChangeState } from '@/lib/radar/state'

/**
 * A COMPETITOR'S MOVE, TURNED INTO SOMETHING YOU CAN APPROVE.
 *
 * ── THE PRICE IS ON THE BUTTON BEFORE ANYTHING IS SPENT ─────────────────────
 * UI_RULES_v3 puts the cost in the label, never in a tooltip. The figure comes
 * from `creditCost('post_variants')` — pricing.config.json — and is the same key
 * the server charges under, so the number on the button is the number the ledger
 * takes rather than a display of it.
 *
 * ── AND EVERY OUTPUT IS A DRAFT ─────────────────────────────────────────────
 * There is no publish here, no schedule, and no "approve all". The Autonomy Dial
 * defaults to L1 and L3 does not ship; a signal about someone else's business is
 * the last input that should be able to reach a live send without a person
 * having read it. The panel says so in words, because a customer cannot see the
 * absence of a code path.
 */

/** What the spend costs. A function call, not a literal, so it reads the config live. */
const ACTION = 'post_variants' as const

export interface DraftFromChangeProps {
  changeId: string
  competitorName: string
  /** Channels this workspace has actually connected. */
  channels: readonly Channel[]
}

/**
 * THE ZERO-BALANCE REFUSAL, AS ITS OWN COMPONENT SO IT CAN BE RENDERED.
 *
 * Exported for the test that renders it at `required = 1`. This product has
 * already shipped "needs 1 credits" in `inline-rewrite.tsx` — the one branch a
 * funded workspace never reaches, so nobody ever read it. Radar's own price is
 * 3, which means a test that only exercises the real price proves NOTHING about
 * the singular and would leave the same defect sitting here.
 */
export function SpendRefusal({ required, available }: { required: number; available: number }) {
  return (
    <InlineError>
      Drafting a reply needs{' '}
      <span data-credit-price="post_variants" className="tabular-nums">
        {required}
      </span>{' '}
      {required === 1 ? 'credit' : 'credits'} and you have{' '}
      <span data-credit-price="balance" className="tabular-nums">
        {available}
      </span>
      . Nothing was written and you were not charged.{' '}
      <Link href="/wallet" className="font-semibold underline underline-offset-2">
        Top up your wallet
      </Link>
    </InlineError>
  )
}

export function DraftFromChange({ changeId, competitorName, channels }: DraftFromChangeProps) {
  const [outcome, setOutcome] = useState<DraftFromChangeState | null>(null)
  const [pending, startTransition] = useTransition()
  const cost = creditCost(ACTION)

  function run() {
    setOutcome(null)
    startTransition(async () => {
      setOutcome(await draftFromRadarChange(changeId, [...channels]))
    })
  }

  if (channels.length === 0) {
    return (
      <p className="type-sm text-muted">
        Connect a channel and Radar can draft a reply to this from your Brand Brain.{' '}
        <Link href="/connections" className="font-[550] text-accent underline underline-offset-2">
          Connect a channel
        </Link>
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3">
      <p className="type-sm text-muted">
        Writes a draft grounded in your Brand Brain and adapts it for{' '}
        {channels.map((c) => CHANNEL_LABELS[c]).join(' · ')}. It stays a draft until you approve it
        &mdash; nothing about this is published for you.
      </p>

      <div>
        <Button onClick={run} loading={pending}>
          <PenLine size={14} aria-hidden />
          {/* ONE span, so the label is ONE flex item. Written as loose children,
              `Button`'s gap lands at every seam and the price drifts away from
              the sentence — measured on the composer in wt-screens. */}
          <span data-credit-price={ACTION}>
            <CostLabel action={`Draft a reply to ${competitorName}`} cost={cost} />
          </span>
        </Button>
      </div>

      {outcome?.ok ? (
        <p role="status" className="type-sm text-muted">
          Wrote a draft for{' '}
          <span data-credit-price={ACTION} className="num">
            {outcome.creditsCharged}
          </span>{' '}
          {outcome.creditsCharged === 1 ? 'credit' : 'credits'}.{' '}
          <Link
            href={`/posts/${outcome.postId}`}
            className="font-[550] text-accent underline underline-offset-2"
          >
            Read it and approve it
          </Link>
        </p>
      ) : null}

      {outcome && !outcome.ok && outcome.insufficient ? (
        <SpendRefusal required={outcome.required} available={outcome.available} />
      ) : null}

      {outcome && !outcome.ok && !outcome.insufficient ? (
        <InlineError>
          {/* Verbatim: the action owns the charge statement, and it is the only
              side that KNOWS whether a charge landed. Appending our own would
              contradict it on the lost-acknowledgement branch. */}
          {outcome.message}
          {outcome.postId ? (
            <>
              {' '}
              <Link
                href={`/posts/${outcome.postId}`}
                className="font-semibold underline underline-offset-2"
              >
                The draft is still here
              </Link>
            </>
          ) : null}
        </InlineError>
      ) : null}
    </div>
  )
}
