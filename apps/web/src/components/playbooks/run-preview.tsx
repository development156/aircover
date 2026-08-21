'use client'

import { useMemo, useState, useTransition } from 'react'
import { AlertTriangle } from 'lucide-react'

import { approveRunCost } from '@/app/actions/playbook-controls'
import { executeRun } from '@/app/actions/playbook-run'
import { previewRunCost, shortfallMessage } from '@/lib/playbooks/cost'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'

/**
 * THE COST PREVIEW — every credit the run will spend, before it spends any.
 *
 * ── THE PRICES ARE PER LINE, NOT ONLY A TOTAL ────────────────────────────────
 * A total a person cannot decompose is a total they cannot trim. Each proposed
 * draft carries its own figure, so the effect of unchecking one is visible before
 * it is taken — which is what makes the checkbox a decision rather than a gamble.
 *
 * ── THE BUTTON CARRIES THE NUMBER ────────────────────────────────────────────
 * UI_RULES_v3 puts the price in the label and never in a tooltip. The total is
 * recomputed in the browser as boxes are unchecked, and the OUTPUT half of it is
 * sent to the server as `expectedCredits`, which recomputes from the rows and
 * REFUSES if the two disagree. So the figure on the button is not a display of
 * the amount — it is the amount being agreed to, and a list that changed
 * underneath cannot be approved at the old price.
 *
 * ── AT ZERO BALANCE IT REFUSES, IN WORDS, WITH BOTH NUMBERS ─────────────────
 * `shortfallMessage` is a pure function of two numbers so that this branch — the
 * one a funded workspace never reaches — can be RENDERED in a test at one credit
 * and at many. That corner is where a peer lane shipped "needs 1 credits".
 *
 * ── NOT ONE FIGURE HERE IS INVENTED ──────────────────────────────────────────
 * Every number is a credit price out of pricing.config.json, a sum of them, or a
 * count of rows. There is no predicted reach, no expected engagement, no score.
 * `run-preview.test.tsx` scans the rendered output and fails on anything else,
 * and it is verified by injecting a fabricated figure.
 */

export interface PreviewItem {
  id: string
  position: number
  title: string
  estimatedCredits: number
  channels: readonly string[]
}

export interface RunPreviewProps {
  runId: string
  items: readonly PreviewItem[]
  availableCredits: number | null
  /** Already approved: the preview becomes a record and the button becomes Run. */
  approvedCredits: number | null
}

export function RunPreview({ runId, items, availableCredits, approvedCredits }: RunPreviewProps) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [approved, setApproved] = useState<number | null>(approvedCredits)
  const [pending, startTransition] = useTransition()

  const preview = useMemo(
    () =>
      previewRunCost(
        items.map((i) => ({
          id: i.id,
          position: i.position,
          estimated_credits: i.estimatedCredits,
          included: !excluded.has(i.id),
        })),
        availableCredits,
      ),
    [items, excluded, availableCredits],
  )

  function toggle(id: string) {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function approve() {
    setError(null)
    startTransition(async () => {
      const out = await approveRunCost(runId, [...excluded], preview.outputCredits)
      if (!out.ok) {
        setError(out.message ?? 'Could not approve that.')
        return
      }
      setApproved(out.approvedCredits ?? preview.outputCredits)
    })
  }

  function run() {
    setError(null)
    startTransition(async () => {
      const out = await executeRun(runId)
      if (!out.ok) {
        setError(out.message ?? 'Could not finish that run.')
        return
      }
      const parts: string[] = []
      if ((out.drafted ?? 0) > 0) {
        parts.push(`${out.drafted} ${out.drafted === 1 ? 'draft' : 'drafts'} written`)
      }
      if ((out.suggested ?? 0) > 0) {
        parts.push(
          `${out.suggested} left as ${out.suggested === 1 ? 'a suggestion' : 'suggestions'}`,
        )
      }
      setDone(`${parts.join(', ')}. Spent ${out.spent} ${out.spent === 1 ? 'credit' : 'credits'}.`)
    })
  }

  return (
    <section aria-labelledby="pb-preview" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="pb-preview" className="type-h3 text-ink">
        {approved === null ? 'Before anything is spent' : 'Approved, and ready to run'}
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        {approved === null
          ? 'This is what the run found and what writing each one would cost. Nothing has been charged. Uncheck anything you do not want.'
          : 'You approved this list. Running it writes the drafts and charges what is shown.'}
      </p>

      <ul className="mt-3 grid gap-2">
        {items.map((item) => {
          const on = !excluded.has(item.id)
          return (
            <li
              key={item.id}
              className="surface-ring flex items-start gap-3 rounded-card bg-s2 p-3"
            >
              <input
                type="checkbox"
                id={`pb-item-${item.id}`}
                checked={on}
                disabled={approved !== null || pending}
                onChange={() => toggle(item.id)}
                className="mt-1 shrink-0"
              />
              <label htmlFor={`pb-item-${item.id}`} className="min-w-0 flex-1 cursor-pointer">
                <span className="type-body block text-ink">{item.title}</span>
                <span className="type-sm block text-muted">{item.channels.join(', ')}</span>
              </label>
              <span className="type-sm shrink-0 tabular-nums text-muted">
                {item.estimatedCredits}
              </span>
            </li>
          )
        })}
      </ul>

      <dl className="mt-3 grid gap-1">
        <div className="flex justify-between">
          <dt className="type-sm text-muted">Writing the drafts</dt>
          <dd className="type-sm tabular-nums text-muted">{preview.outputCredits}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="type-sm text-muted">Running the playbook</dt>
          <dd className="type-sm tabular-nums text-muted">{preview.runCredits}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="type-body text-ink">Total</dt>
          <dd className="type-body tabular-nums text-ink">{preview.totalCredits}</dd>
        </div>
      </dl>

      {/* The refusal, with BOTH numbers and the promise that nothing moved. */}
      {preview.short && preview.availableCredits !== null ? (
        <p className="type-body mt-3 flex gap-2 text-muted">
          <AlertTriangle size={15} strokeWidth={1.8} aria-hidden className="mt-[3px] shrink-0" />
          <span>{shortfallMessage(preview.totalCredits, preview.availableCredits)}</span>
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {approved === null ? (
          <Button
            onClick={approve}
            disabled={pending || preview.includedCount === 0 || preview.short}
          >
            <CostLabel action="Approve this run" cost={preview.totalCredits} />
          </Button>
        ) : (
          <Button onClick={run} disabled={pending}>
            <CostLabel action="Write the drafts" cost={preview.totalCredits} />
          </Button>
        )}
        {preview.excludedCount > 0 && approved === null ? (
          <span className="type-sm text-muted">
            <span className="tabular-nums">{preview.excludedCount}</span> dropped
          </span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="type-sm mt-3 text-muted">
          {error}
        </p>
      ) : null}
      {done ? (
        <p role="status" className="type-sm mt-3 text-muted">
          {done}
        </p>
      ) : null}
    </section>
  )
}
