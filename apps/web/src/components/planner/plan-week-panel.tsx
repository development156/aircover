'use client'

import Link from 'next/link'
import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { CalendarRange, Share2, Target } from 'lucide-react'
import { creditCost, toChannelSet, type ChannelSet } from '@sahoda/shared'

import { planMyWeek } from '@/app/actions/plan-week'
import { ChannelPicker } from '@/components/posts/channel-picker'
import { InlineError } from '@/components/posts/inline-error'
import { PendingLines } from '@/components/posts/pending-lines'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { CostLabel } from '@/components/ui/cost-label'
import { creditWord } from '@/lib/credit-words'

const PENDING = [
  'Reading your Brand Brain…',
  'Planning five posts across your week…',
  'Placing each one at a sensible time…',
  'Still working. If this fails you will not be charged.',
] as const

/** The two Alpha real-publish channels: a sensible seed the user can change. */
const DEFAULT_CHANNELS: ChannelSet = toChannelSet(['x', 'gbp'])

/**
 * ONE constant, read by the `maxLength` attribute AND by the counter beside the
 * field. Written twice they drift, and the counter then reports a ceiling the
 * input does not enforce, which is a figure no query produced.
 */
const GOALS_MAX = 500

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
      className="rounded-card border border-line bg-bg p-5 shadow-card narrow:p-6"
    >
      {/* ── THE ANCHOR ────────────────────────────────────────────────────────
          The mark and the title are one object: a 40px tinted square, then the
          title at `type-h2`, then the promise at `type-sm` in --ink-mute. That
          20/13 pair is a real step; the 15/13 it replaced was half a rung and
          read as two lines of the same thing, which is how the heading got lost
          inside its own card.

          `type-h2` is 20px and the page title above it is `type-h1` at 24px, so
          this leads its CARD without outranking its PAGE. Going to `type-display`
          would have made the panel shout over /planner's own title. */}
      <div className="flex items-start gap-3">
        {/* dark: tint-50 stays warm-light while --acc flips to Orange300 → s2 surface */}
        <span className="grid size-10 shrink-0 place-items-center rounded-sm bg-tint-50 text-accent dark:bg-s2">
          <CalendarRange size={20} strokeWidth={1.8} aria-hidden />
        </span>
        <div className="space-y-1">
          <h2 className="type-h2 text-ink">Plan my week</h2>
          <p className="type-sm text-muted">
            Five drafts, grounded in your Brand Brain, placed across the coming week.
          </p>
        </div>
      </div>

      {/* ── 1 · THE GOAL ──────────────────────────────────────────────────────
          Three groups, each opened by a hairline rule and a `type-h3` heading:
          goal, then channels, then the action. The card was one undifferentiated
          `space-y-3` stack before, which is why it read as a settings form. */}
      <div className="mt-5 border-t border-line pt-5">
        {/* A plain <label>, not the `Label` primitive. `Label` hard-codes a 12px
            form-label step, and layering `type-h3` over it would leave two font
            declarations racing on CSS order rather than on intent.

            "(optional)" stays INSIDE the label. Moved out to a sibling it still
            LOOKS the same and the accessible name silently drops it, so a screen
            reader would hear a required-sounding field. */}
        <label
          htmlFor="plan-week-goals"
          className="flex flex-wrap items-center gap-x-2 type-h3 text-ink"
        >
          <Target size={15} strokeWidth={2} className="text-accent" aria-hidden />
          Goals for the week <span className="type-sm text-muted">(optional)</span>
        </label>

        <Textarea
          id="plan-week-goals"
          value={goals}
          onChange={(event) => setGoals(event.target.value)}
          disabled={pending}
          rows={5}
          maxLength={GOALS_MAX}
          placeholder="More weekend footfall, launch the monsoon menu…"
          // Padding and height only, plus a focus ring one tint step firmer than
          // the primitive's. The RESTING ring, the radius and the placeholder
          // colour are deliberately NOT overridden: every other field in the
          // product wears them, and a planning canvas that disagrees with the
          // composer is drift rather than polish. The placeholder in particular
          // stays --ink-mute; the reference art has it lighter, and lighter is a
          // legibility regression on the phone this product is built for.
          className="mt-2 px-4 py-3 focus:shadow-[inset_0_0_0_1.5px_var(--brand),0_0_0_3px_var(--t100)]"
        />

        {/* The ceiling was already enforced and invisible. This reports the two
            numbers the field itself produced; neither is estimated. */}
        <p className="mt-1.5 text-right type-meta text-muted">
          <span className="tabular-nums">{goals.length}</span> /{' '}
          <span className="tabular-nums">{GOALS_MAX}</span> characters
        </p>
      </div>

      {/* ── 2 · THE CHANNELS ──────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-5">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="flex items-center gap-2 type-h3 text-ink">
            <Share2 size={15} strokeWidth={2} className="text-accent" aria-hidden />
            Channels
          </h3>
          <p className="type-sm text-muted">Choose the channels you want to plan for.</p>
        </div>
        {/* `hideLabel` because the heading above already says it. The picker's
            own 12px `Label` under a `type-h3` heading would be the same word
            twice at two sizes. */}
        <div className="mt-3">
          <ChannelPicker selected={channels} onChange={setChannels} disabled={pending} hideLabel />
        </div>
      </div>

      {/* ── 3 · THE ACTION ────────────────────────────────────────────────── */}
      <div className="mt-5 border-t border-line pt-5">
        {pending ? (
          <PendingLines lines={PENDING} />
        ) : (
          <div className="flex flex-col gap-3 narrow:flex-row narrow:items-center narrow:gap-4">
            {/* ── NOT A 1100px ORANGE BAR ──────────────────────────────────
                `w-full` unconditionally made the loudest object in this lane: on
                the baseline capture /planner measured 3.5-4.3% saturated pixels,
                the worst of any route here and above the 2.883% docs/37 §2.3
                recorded for it, and this single bar is most of that.

                Full width is RIGHT on a phone, a primary under the thumb, and
                wrong at 1440 where it is a band. `narrow:w-auto` is the pair
                `plan-picker.tsx` already uses. Deliberately NOT `sm:w-auto`:
                docs/37 §13 records `top-up-panel.tsx` shipping exactly that,
                where the class is spelled correctly, type-checks, reads right in
                review and is never emitted, so the money screen's primary
                rendered as a ~1000px bar.

                `size="lg"` is the kit's own 40px step, not a new size. It costs
                roughly 1,900px² more accent than the 38px default at 1440,
                which is 0.015% of the frame, and it buys the one thing on this
                card that is supposed to be pressed. The hover is unchanged and
                stays canon: the primary goes BLACK, never to a darker orange. */}
            <Button
              size="lg"
              onClick={run}
              disabled={channels.length === 0}
              className="w-full px-5 shadow-[0_2px_10px_-4px_var(--t300)] transition-micro hover:shadow-none narrow:w-auto"
            >
              <CalendarRange size={15} aria-hidden />
              <CostLabel action="Plan my week" cost={cost} />
            </Button>
            {/* Says where the output LANDS, which nothing else on this card
                does. Deliberately not "nothing publishes until you approve":
                auto-publish exists on this route and that sentence would be
                false wherever it is switched on. Editing and rescheduling are
                true in every configuration.

                Capped at 46ch. Uncapped it set one 940px line at 1440 and the
                action row read as a paragraph with a button stuck to it, which
                is the opposite of what the row is for. MEASURED off the frame. */}
            <p className="type-meta max-w-[46ch] text-muted">
              Sahoda saves the drafts to your planner, where you can edit or reschedule each one.
            </p>
          </div>
        )}
      </div>

      {outcome?.kind === 'planned' && outcome.clamped > 0 ? (
        <p className="mt-4 rounded-input bg-s2 px-3 py-2.5 type-sm text-muted">
          <span className="tabular-nums">{outcome.clamped}</span>
          {outcome.clamped === 1 ? ' suggested time was' : ' suggested times were'} unusable and
          moved to sensible future slots.
        </p>
      ) : null}

      {outcome?.kind === 'insufficient' ? (
        <InlineError className="mt-4">
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
      {outcome?.kind === 'failed' ? (
        <InlineError className="mt-4">{outcome.message}</InlineError>
      ) : null}
    </section>
  )
}
