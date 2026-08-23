'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarRange } from 'lucide-react'
import { creditCost, toChannelSet, type ChannelSet } from '@sahoda/shared'

import { planMyWeek } from '@/app/actions/plan-week'
import { ChannelPicker } from '@/components/posts/channel-picker'
import { InlineError } from '@/components/posts/inline-error'
import { PendingLines } from '@/components/posts/pending-lines'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { CostLabel } from '@/components/ui/cost-label'
import { creditWord } from '@/lib/credit-words'

const PENDING = [
  'Reading your Brand Brain…',
  'Planning five posts across your week…',
  'Placing each one at a sensible time…',
  'Still working. If this fails you will not be charged.',
] as const

/** The two Alpha real-publish channels — a sensible seed the user can change. */
const DEFAULT_CHANNELS: ChannelSet = toChannelSet(['x', 'gbp'])

type Outcome =
  | { kind: 'planned'; clamped: number }
  | { kind: 'insufficient'; required: number; available: number }
  | { kind: 'failed'; message: string }

/**
 * One click → five Brand-Brain-grounded drafts across the coming week. The
 * credit cost is rendered from `creditCost('loop_cycle')` BEFORE the click,
 * never after, and unusable model times are reported as moved, not hidden.
 */
export function PlanWeekPanel() {
  const [goals, setGoals] = useState('')
  const [channels, setChannels] = useState<ChannelSet>(DEFAULT_CHANNELS)
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()

  const cost = creditCost('loop_cycle')

  function run() {
    if (channels.length === 0) return
    setOutcome(null)

    startTransition(async () => {
      const result = await planMyWeek(goals, channels)

      if (result.ok) {
        toast.success(
          <span>
            Planned <span className="tabular-nums">{result.created}</span> drafts ·{' '}
            <span className="tabular-nums">{result.creditsCharged}</span>{' '}
            {creditWord(result.creditsCharged)} used ·{' '}
            <span className="tabular-nums">{result.balanceAfter}</span> left
          </span>,
        )
        setOutcome({ kind: 'planned', clamped: result.clamped })
        return
      }

      setOutcome(
        result.insufficient
          ? { kind: 'insufficient', required: result.required, available: result.available }
          : { kind: 'failed', message: result.message },
      )
    })
  }

  return (
    <section
      data-guide="planner.plan_week"
      className="space-y-3 rounded-card border border-line bg-bg p-4 shadow-card"
    >
      <div className="flex items-center gap-2">
        {/* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */}
        <span className="grid size-8 place-items-center rounded-pill bg-tint-50 text-accent dark:bg-s2">
          <CalendarRange size={16} strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <h2 className="text-[15px] leading-5 font-bold">Plan my week</h2>
          <p className="text-[13px] text-muted">
            Five drafts, grounded in your Brand Brain, placed across the coming week.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plan-week-goals">Goals for the week (optional)</Label>
        <Textarea
          id="plan-week-goals"
          value={goals}
          onChange={(event) => setGoals(event.target.value)}
          disabled={pending}
          rows={2}
          maxLength={500}
          placeholder="More weekend footfall, launch the monsoon menu…"
        />
      </div>

      <ChannelPicker selected={channels} onChange={setChannels} disabled={pending} />

      {pending ? (
        <PendingLines lines={PENDING} />
      ) : (
        <Button onClick={run} disabled={channels.length === 0} className="w-full">
          <CalendarRange size={14} aria-hidden />
          <CostLabel action="Plan my week" cost={cost} />
        </Button>
      )}

      {outcome?.kind === 'planned' && outcome.clamped > 0 ? (
        <p className="rounded-input bg-s2 px-3 py-2.5 text-[13px] text-muted">
          <span className="tabular-nums">{outcome.clamped}</span>
          {outcome.clamped === 1 ? ' suggested time was' : ' suggested times were'} unusable and
          moved to sensible future slots.
        </p>
      ) : null}

      {outcome?.kind === 'insufficient' ? (
        <InlineError>
          Planning needs <span className="tabular-nums">{outcome.required}</span>{' '}
          {creditWord(outcome.required)} and you have{' '}
          <span className="tabular-nums">{outcome.available}</span>. Nothing was planned and you
          were not charged.{' '}
          <Link href="/wallet" className="font-semibold underline underline-offset-2">
            Top up your wallet
          </Link>
        </InlineError>
      ) : null}

      {/* The charge statement has exactly ONE owner: the action that produced the
          message. It alone knows whether the hold was released — rendered
          verbatim for that reason. */}
      {outcome?.kind === 'failed' ? <InlineError>{outcome.message}</InlineError> : null}
    </section>
  )
}
