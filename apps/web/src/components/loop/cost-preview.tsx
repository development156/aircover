'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'

import { approveCycleCost } from '@/app/actions/loop-controls'
import { runCreateStage } from '@/app/actions/loop-create'
import { previewCost } from '@/lib/loop/cost'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import type { LoopBriefView } from '@/lib/loop/read'
import { creditWord, credits } from '@/lib/credit-words'

/**
 * THE COST PREVIEW — every credit the cycle will spend, before it spends any.
 *
 * ── THE PRICES ARE PER LINE, NOT ONLY A TOTAL ────────────────────────────────
 * A total a person cannot decompose is a total they cannot trim. Each brief
 * carries its own figure, so the effect of unchecking one is visible before it
 * is taken — which is what makes the checkbox a decision rather than a gamble.
 *
 * ── THE BUTTON CARRIES THE NUMBER ────────────────────────────────────────────
 * UI_RULES_v3 puts the price in the label and never in a tooltip. The total is
 * recomputed in the browser as boxes are unchecked, and the same total is sent
 * to the server as `expectedCredits`, which recomputes from the rows and REFUSES
 * if the two disagree. So the figure on the button is not a display of the
 * amount — it is the amount being agreed to, and a plan that changed underneath
 * cannot be approved at the old price.
 *
 * ── NOT ONE FIGURE HERE IS INVENTED ──────────────────────────────────────────
 * Every number is a credit price out of pricing.config.json or a sum of them.
 * There is no predicted reach, no expected engagement, no score. Those would be
 * claims about the reader's business, and no query behind this panel has earned
 * one.
 */

export interface CostPreviewProps {
  cycleId: string
  briefs: readonly LoopBriefView[]
  budgetCredits: number | null
  /** What the orchestration has already cost this cycle. */
  spentCredits: number
}

export function CostPreview({ cycleId, briefs, budgetCredits }: CostPreviewProps) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const preview = useMemo(
    () =>
      previewCost(
        briefs.map((b) => ({
          id: b.id,
          priority: b.priority,
          estimated_credits: b.estimatedCredits,
          included: !excluded.has(b.id),
        })),
        budgetCredits,
      ),
    [briefs, excluded, budgetCredits],
  )

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setError(null)
  }

  function approve() {
    setError(null)
    startTransition(async () => {
      const approved = await approveCycleCost(cycleId, [...excluded], preview.creationCredits)
      if (!approved.ok) {
        setError(approved.message ?? 'Could not approve that.')
        return
      }
      // Approving and creating are two calls because they are two decisions in
      // the database — the approval is a stored fact the create stage re-reads.
      // Chaining them here is a convenience for the person, not a shortcut past
      // the gate: `runCreateStage` still refuses a cycle with no approval row.
      const made = await runCreateStage(cycleId)
      if (!made.ok) {
        setError(made.message ?? 'Approved, but the drafts could not be written.')
        return
      }
      // The cost clause is omitted rather than zeroed when the action could not
      // say what it spent: "for 0 credits" is a figure nothing measured.
      const wrote =
        `Wrote ${made.created} ${made.created === 1 ? 'draft' : 'drafts'}` +
        (made.spent === undefined ? '' : ` for ${credits(made.spent)}`)

      setDone(
        made.cancelledMidRun
          ? // The week was stopped while this stage was running. What was
            // written is kept and was paid for; saying "reported" would tell the
            // person who pressed stop that it went ahead anyway.
            `${wrote}, then you stopped the week. They are in your Planner and nothing more will be written.`
          : made.created === 0
            ? 'Nothing was written. Every brief is on a channel set to suggest only.'
            : `${wrote}.`,
      )
    })
  }

  if (done) {
    return (
      <section className="surface-ring rounded-card bg-surface p-4">
        <h2 className="type-h2">This week is written</h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">{done}</p>
      </section>
    )
  }

  const included = briefs.filter((b) => !excluded.has(b.id))

  return (
    <section aria-labelledby="loop-preview" className="surface-ring rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="loop-preview" className="type-h2">
          What this week will cost
        </h2>
        <p className="type-sm text-muted">Nothing has been spent on these yet.</p>
      </div>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        Sahoda planned {briefs.length} {briefs.length === 1 ? 'post' : 'posts'}. Uncheck any you do
        not want and the total below follows. Nothing is written until you approve it.
      </p>

      <ul className="mt-4 grid gap-1.5">
        {briefs.map((brief) => {
          const on = !excluded.has(brief.id)
          return (
            <li key={brief.id}>
              <label
                className={[
                  'flex cursor-pointer items-start gap-3 rounded-input p-3 transition-colors',
                  'focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent',
                  on ? 'bg-s2' : 'bg-transparent opacity-60',
                ].join(' ')}
              >
                <input
                  type="checkbox"
                  checked={on}
                  onChange={() => toggle(brief.id)}
                  disabled={pending}
                  className="mt-icon-nudge size-4 shrink-0 accent-[var(--acc)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="type-h3 block text-ink">{brief.title}</span>
                  <span className="type-sm mt-0.5 block text-muted">{brief.body}</span>
                  {brief.channels.length > 0 ? (
                    <span className="type-sm mt-1 block text-muted">
                      {brief.channels.join(' · ')}
                    </span>
                  ) : null}
                </span>
                <span className="type-sm num shrink-0 text-muted">{brief.estimatedCredits} cr</span>
              </label>
            </li>
          )
        })}
      </ul>

      <dl className="mt-4 grid gap-1 border-t border-line pt-3">
        <div className="flex justify-between gap-4">
          <dt className="type-body text-muted">
            {included.length} {included.length === 1 ? 'post' : 'posts'} to write
          </dt>
          <dd className="type-body num text-ink">{preview.creationCredits} cr</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="type-body text-muted">Planning this week, already charged</dt>
          <dd className="type-body num text-muted">{preview.orchestrationCredits} cr</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-line pt-2">
          <dt className="type-h3 text-ink">The week, in total</dt>
          <dd className="type-h3 num text-ink">{preview.totalCredits} cr</dd>
        </div>
        {preview.budgetCredits !== null ? (
          <div className="flex justify-between gap-4">
            <dt className="type-sm text-muted">Your weekly budget</dt>
            <dd className="type-sm num text-muted">{preview.budgetCredits} cr</dd>
          </div>
        ) : null}
      </dl>

      {preview.overBudget ? (
        <p
          role="status"
          className="mt-3 flex items-start gap-2 rounded-input bg-warn-bg p-3 type-sm text-ink"
        >
          <AlertTriangle size={15} strokeWidth={1.8} aria-hidden className="mt-[2px] shrink-0" />
          <span>
            This is <span className="num">{preview.overBy}</span> {creditWord(preview.overBy)} over
            your weekly budget. Uncheck a post to fit, or approve it anyway. The budget is yours to
            set.
          </span>
        </p>
      ) : null}

      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={approve} loading={pending} disabled={included.length === 0}>
          <CostLabel action="Write this week" cost={preview.creationCredits} />
        </Button>
        {included.length === 0 ? (
          <span className="type-sm text-muted">
            Keep at least one post, or stop the Loop below.
          </span>
        ) : null}
      </div>
    </section>
  )
}
