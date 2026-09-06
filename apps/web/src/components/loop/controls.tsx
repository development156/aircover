'use client'

import Link from 'next/link'
import type { Route } from 'next'
import type { ReactNode } from 'react'
import { useState, useTransition } from 'react'
import { CalendarClock, Timer, Wallet } from 'lucide-react'
import { MAX_WEEKLY_BUDGET_CREDITS } from '@sahoda/shared'

import { runCycleToPreview } from '@/app/actions/loop-cycle'
import { setLoopSettings } from '@/app/actions/loop-dial'
import { Button } from '@/components/ui/button'
import { creditWord, credits } from '@/lib/credit-words'
import { CostLabel } from '@/components/ui/cost-label'

/**
 * RUNNING THE LOOP — the command centre: what it costs, when it fires, and where
 * the current week got to.
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
 *
 * ── WHAT THE REDRAW ADDED, AND WHAT IT REFUSED TO ────────────────────────────
 * The three facts a person actually wants beside the button — budget, schedule,
 * and how the running week is going — used to be a control row here and a
 * separate bordered card below. They are one panel now.
 *
 * The SCHEDULE line is new information, not new decoration: this page never
 * said when the weekly plan happens. It comes from `lib/loop/schedule`, which is
 * pinned to the deployment's own cron by a test.
 *
 * REFUSED: a "last run" for a workspace whose cycle row is absent, and a spend
 * bar when no budget is set. Both would put a figure about the reader's week on
 * screen that nothing measured.
 *
 * ── PAUSE LEFT THIS PANEL ────────────────────────────────────────────────────
 * It sits beside the page title now, where "is this running" is asked. `paused`
 * arrives as a prop and is no longer held here: local state in one component and
 * server state in another is how a screen shows an enabled button above a
 * sentence saying why it cannot be pressed.
 */

/**
 * WHY THE LOOP WILL NOT PLAN THIS WEEK, AND WHERE TO GO ABOUT IT.
 *
 * One sentence and one link, both from `lib/loop/eligibility` — the same
 * function the Sunday cron reaches its verdict with. `null` when the workspace
 * is eligible.
 */
export interface LoopRefusalNotice {
  /** The sentence, from `explain(verdict)`. Never a code, never a boolean. */
  sentence: string
  /** Somewhere that can actually fix it, from `remedy(verdict)`. */
  remedy: { href: string; label: string } | null
}

/** What the running week has spent and when it happened. Absent when no cycle. */
export interface LoopRunFacts {
  spentCredits: number
  budgetCredits: number | null
  /** Formatted by `lib/loop/schedule`, already carrying its zone. */
  startedAt: string | null
  /** Only present once a cycle has finished. */
  duration: string | null
}

export interface LoopControlsProps {
  paused: boolean
  weeklyBudgetCredits: number
  cycleCost: number
  hasChannels: boolean
  cycleRunning: boolean
  /** Absent when the Loop will plan this week. */
  refusal?: LoopRefusalNotice | null
  /** The sentence the schedule states, from `lib/loop/schedule`. */
  scheduleSentence?: string
  /** The next fire time, already formatted with its zone. */
  nextRunAt?: string
  run?: LoopRunFacts | null
  /** Where the current week got to, rendered on the server. */
  children?: ReactNode
}

export function LoopControls({
  paused,
  weeklyBudgetCredits,
  cycleCost,
  hasChannels,
  cycleRunning,
  refusal = null,
  scheduleSentence,
  nextRunAt,
  run = null,
  children,
}: LoopControlsProps) {
  const [budget, setBudget] = useState(weeklyBudgetCredits)
  const [savedBudget, setSavedBudget] = useState(weeklyBudgetCredits)
  const [budgetNote, setBudgetNote] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // ── BLUR SAVES, SO BLUR MUST KNOW WHAT IT IS SAVING ────────────────────────
  // `Number('')` is 0. A person who cleared the field to retype it and tabbed
  // away had a budget of zero written for them, silently, and a reload showed
  // "0" (MEASURED 2026-09-06). An empty or unparseable field goes back to the
  // last saved figure and writes nothing; an unchanged figure writes nothing
  // either, because every blur was a server write before, changed or not.
  function saveBudget(raw: string) {
    setError(null)
    if (raw.trim() === '' || !Number.isFinite(Number(raw))) {
      setBudget(savedBudget)
      return
    }
    const value = Number(raw)
    if (value === savedBudget) return
    setBudget(value)
    setBudgetNote(null)
    startTransition(async () => {
      const result = await setLoopSettings({ weeklyBudgetCredits: value })
      if (!result.ok) {
        setBudget(savedBudget)
        setError(result.message ?? 'Could not save that.')
        return
      }
      setSavedBudget(value)
      setBudgetNote('Saved.')
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
    <section
      aria-labelledby="loop-running"
      className="surface-ring rounded-card bg-surface shadow-card"
    >
      <div className="grid wide:grid-cols-[minmax(0,1fr)_320px]">
        {/* The action, and the sentence that qualifies it. */}
        <div className="flex flex-col gap-4 p-5 max-narrow:p-4">
          <h2 id="loop-running" className="type-h3 text-ink">
            Running the Loop
          </h2>

          <div className="flex flex-col gap-2">
            <Button
              onClick={planWeek}
              loading={pending}
              disabled={paused || !hasChannels || cycleRunning}
              className="self-start"
            >
              <CostLabel action="Plan my week" cost={cycleCost} />
            </Button>
            <span className="type-sm max-w-[52ch] text-muted">
              {refusal ? (
                <>
                  {refusal.sentence}
                  {refusal.remedy ? (
                    <>
                      {' '}
                      <Link
                        href={refusal.remedy.href as Route}
                        className="font-[550] text-accent underline underline-offset-2"
                      >
                        {refusal.remedy.label}
                      </Link>
                    </>
                  ) : null}
                </>
              ) : (
                'Stops at a cost preview. Nothing is written until you approve it.'
              )}
            </span>
          </div>

          {children}

          {note ? (
            <p role="status" className="type-sm text-muted">
              {note}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="type-sm text-danger">
              {error}
            </p>
          ) : null}
        </div>

        {/* Budget, schedule and the run's own figures. Divided by a rule rather
            than boxed: three cards here would repeat the panel they sit in. */}
        <dl className="flex flex-col gap-5 p-5 max-narrow:p-4 wide:border-l max-wide:border-t border-line-soft">
          <Facet icon={<Wallet size={14} strokeWidth={1.9} aria-hidden />} label="Weekly budget">
            <span className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                max={MAX_WEEKLY_BUDGET_CREDITS}
                step={10}
                value={budget}
                disabled={pending}
                aria-label="Weekly budget in credits"
                onChange={(e) => {
                  setBudgetNote(null)
                  setBudget(
                    e.target.value === '' ? ('' as unknown as number) : Number(e.target.value),
                  )
                }}
                onBlur={(e) => saveBudget(e.target.value)}
                className="w-24 rounded-input bg-s2 px-3 py-2 type-body tabular-nums text-ink outline-none focus:outline focus:outline-2 focus:outline-offset-2 focus:outline-accent"
              />
              <span className="type-sm text-muted">credits</span>
              {budgetNote ? (
                <span role="status" className="type-sm text-muted">
                  {budgetNote}
                </span>
              ) : null}
            </span>
            {/* `> 0`, not `!== null`. Zero is a real stored budget — it means
                the Loop may spend nothing — and it is not a bar. Rendered as
                one it gave `aria-valuemax=0` under `aria-valuenow=85` and read
                "Used 85 of 0 credits", with the fill drawn EMPTY because
                `share` divides by it. `CreditsCard` beside it already guards
                `budget > 0`; this is the same rule. A zero-budget cycle falls
                to the plain spent line below, which states what happened
                without drawing a proportion of nothing. */}
            {run && run.budgetCredits !== null && run.budgetCredits > 0 ? (
              <SpendBar spent={run.spentCredits} budget={run.budgetCredits} />
            ) : run ? (
              <span className="type-sm num mt-2 block text-muted">
                Spent this cycle: <span className="text-ink">{run.spentCredits}</span>{' '}
                {creditWord(run.spentCredits)}
              </span>
            ) : null}
          </Facet>

          {scheduleSentence ? (
            <Facet
              icon={<CalendarClock size={14} strokeWidth={1.9} aria-hidden />}
              label="Schedule"
            >
              <span className="type-body block text-ink">{scheduleSentence}</span>
              {nextRunAt ? (
                <span className="type-sm num mt-1 block text-muted">Next run {nextRunAt}</span>
              ) : null}
            </Facet>
          ) : null}

          {run?.startedAt ? (
            <Facet icon={<Timer size={14} strokeWidth={1.9} aria-hidden />} label="This cycle">
              <span className="type-body num block text-ink">{run.startedAt}</span>
              {run.duration ? (
                <span className="type-sm num mt-1 block text-muted">Took {run.duration}</span>
              ) : null}
            </Facet>
          ) : null}
        </dl>
      </div>
    </section>
  )
}

function Facet({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="type-eyebrow flex items-center gap-1.5 text-muted">
        <span className="text-muted">{icon}</span>
        {label}
      </dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  )
}

/**
 * How much of the budget this cycle has used.
 *
 * Both numbers are stored: `spent_credits` on the cycle row and the budget the
 * cycle was opened with. Nothing is projected — a bar past 100% is drawn at
 * 100% and the figures beside it still say what actually happened, because a bar
 * cannot overflow but a spend can.
 */
function SpendBar({ spent, budget }: { spent: number; budget: number }) {
  const share = budget > 0 ? Math.min(100, Math.round((spent / budget) * 100)) : 0
  return (
    <div className="mt-3">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={budget}
        aria-valuenow={spent}
        aria-label="Credits used this cycle"
        className="h-1.5 w-full overflow-hidden rounded-pill bg-s2"
      >
        <div
          className="h-full rounded-pill bg-accent transition-panel"
          style={{ width: `${share}%` }}
        />
      </div>
      <p className="type-sm num mt-1.5 text-muted">
        Used <span className="text-ink">{spent}</span> of {credits(budget)}
      </p>
    </div>
  )
}
