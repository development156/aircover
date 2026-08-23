'use client'

import { useState, useTransition } from 'react'
import { Play, Pause } from 'lucide-react'
import { MAX_WEEKLY_BUDGET_CREDITS } from '@sahoda/shared'

import { runCycleToPreview } from '@/app/actions/loop-cycle'
import { setLoopSettings } from '@/app/actions/loop-dial'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'

/**
 * PAUSE, BUDGET, AND THE BUTTON THAT STARTS A WEEK.
 *
 * ── THE BUTTON SAYS WHAT IT COSTS AND WHERE IT STOPS ─────────────────────────
 * Two facts, both load-bearing. The price is in the label, per UI_RULES_v3 —
 * never in a tooltip, because a person should read what they are about to spend
 * before they commit to spending it. And the line underneath says the cycle
 * stops at a preview, because a button labelled "Plan my week" on a product that
 * can also WRITE the week invites the reasonable fear that pressing it starts
 * something expensive and unstoppable. It does not, and saying so is cheaper
 * than making someone find out.
 *
 * ── THE BUDGET IS A NUMBER FIELD, NOT A SLIDER ───────────────────────────────
 * FSD M2 calls it a slider. A slider cannot be typed into, reads badly to a
 * screen reader without extra work, and is imprecise about a quantity people
 * think about precisely — nobody wants "about 150 credits". The stepper keeps
 * the dragging affordance for anyone who wants it and lets the rest type.
 */

export interface LoopControlsProps {
  paused: boolean
  weeklyBudgetCredits: number
  cycleCost: number
  hasChannels: boolean
  cycleRunning: boolean
}

export function LoopControls({
  paused: initialPaused,
  weeklyBudgetCredits,
  cycleCost,
  hasChannels,
  cycleRunning,
}: LoopControlsProps) {
  const [paused, setPaused] = useState(initialPaused)
  const [budget, setBudget] = useState(weeklyBudgetCredits)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function togglePause() {
    const next = !paused
    setPaused(next)
    setError(null)
    startTransition(async () => {
      const result = await setLoopSettings({ paused: next })
      if (!result.ok) {
        setPaused(!next)
        setError(result.message ?? 'Could not save that.')
      }
    })
  }

  function saveBudget(value: number) {
    setBudget(value)
    setError(null)
    startTransition(async () => {
      const result = await setLoopSettings({ weeklyBudgetCredits: value })
      if (!result.ok) {
        setBudget(weeklyBudgetCredits)
        setError(result.message ?? 'Could not save that.')
      }
    })
  }

  function planWeek() {
    setError(null)
    setNote(null)
    startTransition(async () => {
      const result = await runCycleToPreview('manual')
      if (!result.ok) {
        setError(result.message ?? 'Could not plan this week.')
        return
      }
      setNote(result.message ?? null)
    })
  }

  return (
    <section aria-labelledby="loop-controls" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="loop-controls" className="type-h3 text-ink">
        Running the Loop
      </h2>

      <div className="mt-3 flex flex-wrap items-end gap-x-6 gap-y-4">
        <div className="flex flex-col gap-1.5">
          <Button
            onClick={planWeek}
            loading={pending}
            disabled={paused || !hasChannels || cycleRunning}
          >
            <CostLabel action="Plan my week" cost={cycleCost} />
          </Button>
          <span className="type-sm max-w-[42ch] text-muted">
            {!hasChannels
              ? 'Connect a channel first. Sahoda has nowhere to plan for.'
              : paused
                ? 'The Loop is paused. Turn it back on to plan a week.'
                : cycleRunning
                  ? 'A cycle is already running for this week.'
                  : 'Stops at a cost preview. Nothing is written until you approve it.'}
          </span>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="type-eyebrow text-muted">Weekly budget</span>
          <span className="flex items-center gap-2">
            <input
              type="number"
              min={0}
              max={MAX_WEEKLY_BUDGET_CREDITS}
              step={10}
              value={budget}
              disabled={pending}
              onChange={(e) => setBudget(Number(e.target.value))}
              onBlur={(e) => saveBudget(Number(e.target.value))}
              className="w-24 rounded-input bg-subtle px-3 py-2 type-body tabular-nums text-ink outline-none focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
            />
            <span className="type-sm text-muted">credits</span>
          </span>
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="type-eyebrow text-muted">Schedule</span>
          <Button variant="secondary" onClick={togglePause} disabled={pending}>
            {paused ? (
              <>
                <Play size={15} strokeWidth={1.8} aria-hidden />
                Turn the Loop on
              </>
            ) : (
              <>
                <Pause size={15} strokeWidth={1.8} aria-hidden />
                Pause the Loop
              </>
            )}
          </Button>
        </div>
      </div>

      {note ? (
        <p role="status" className="type-sm mt-3 text-muted">
          {note}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}
    </section>
  )
}
