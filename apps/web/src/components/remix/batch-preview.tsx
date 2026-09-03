'use client'

import Link from 'next/link'
import { useMemo, useState, useTransition } from 'react'

import { approveRemixBatch, setDerivativeIncluded } from '@/app/actions/remix'
import { runRemixBatch } from '@/app/actions/remix-run'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { REMIX_KINDS, needsAPhoto } from '@/lib/remix/catalogue'
import { previewBatch } from '@/lib/remix/cost'
// A TYPE import from `read.ts` is erased; a VALUE import from it would pull
// `server-only` into a client bundle and fail the production build. `isSettled`
// therefore lives in its own pure module — see `lib/remix/status.ts`.
import { isSettled } from '@/lib/remix/status'
import type { BatchView } from '@/lib/remix/read'

/**
 * THE BATCH, PRICED, TRIMMABLE, AND NOT YET PAID FOR.
 *
 * ── THE TOTAL FOLLOWS THE TRIM, AND SAYS WHICH TRIM MOVES IT ────────────────
 * A kind is one model call, so unticking Instagram out of "a short version"
 * removes a draft and removes no credit; unticking the whole kind removes the
 * credit. Both are true and only one is guessable, so the panel states it
 * rather than leaving a person to infer it from a number that did not move.
 *
 * ── NOT ONE FIGURE HERE IS INVENTED ──────────────────────────────────────────
 * Every number is a credit price out of pricing.config.json, a sum of them, or a
 * count of rows. No predicted reach, no expected engagement, no score — each
 * would be a claim about the reader's business, and nothing behind this panel
 * has earned one. `batch-preview.test.tsx` walks the rendered text and fails on
 * any digit that is not one of those three things.
 *
 * ── THE BUTTON IS NEVER PRE-DISABLED ON A BALANCE ────────────────────────────
 * Deliberate, and the same rule `spend-at-zero.test.tsx` holds every other spend
 * control to: the balance is a server fact, and a client that greyed the button
 * out on a cached number would refuse somebody who topped up in another tab.
 * Attempt-then-explain is the honest order; the run's own gate is the
 * enforcement.
 */

export interface BatchPreviewProps {
  batch: BatchView
}

type Outcome =
  | { kind: 'none' }
  | { kind: 'short'; required: number; available: number }
  | { kind: 'failed'; message: string }
  | { kind: 'made'; drafts: number; spent: number; failedKinds: number }

export function BatchPreview({ batch }: BatchPreviewProps) {
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(
    new Set(batch.derivatives.filter((d) => !d.included).map((d) => d.id)),
  )
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'none' })
  const [pending, startTransition] = useTransition()

  const cost = useMemo(
    () =>
      previewBatch(
        batch.derivatives.map((d) => ({
          id: d.id,
          kind: d.kind,
          included: !excluded.has(d.id),
        })),
      ),
    [batch.derivatives, excluded],
  )

  const settled = isSettled(batch.status)

  function toggle(id: string) {
    const next = new Set(excluded)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    setExcluded(next)
    setOutcome({ kind: 'none' })
    // Fire-and-forget is wrong for money and right for a trim: the run
    // re-reads the rows and re-prices from them, so a trim that failed to save
    // shows up as a refusal at approval time rather than as a silent overcharge.
    startTransition(async () => {
      await setDerivativeIncluded(id, batch.id, !next.has(id))
    })
  }

  function makeThem() {
    setOutcome({ kind: 'none' })
    startTransition(async () => {
      // The figure on the button is what is sent. The server re-prices from the
      // rows and refuses if the two disagree, so this is the amount being agreed
      // to rather than a display of it — see `approveRemixBatch`.
      const approved = await approveRemixBatch(batch.id, cost.totalCredits)
      if (!approved.ok) {
        setOutcome({ kind: 'failed', message: approved.message ?? 'Could not approve this.' })
        return
      }
      // Two calls because they are two decisions in the database. The approval
      // is a stored fact the runner re-reads — chaining them here is a
      // convenience for the person, never a way past the gate.
      const made = await runRemixBatch(batch.id)
      if (made.ok) {
        setOutcome({
          kind: 'made',
          drafts: made.drafts,
          spent: made.spent,
          failedKinds: made.failedKinds,
        })
        return
      }
      if (made.insufficient) {
        setOutcome({ kind: 'short', required: made.required, available: made.available })
        return
      }
      setOutcome({ kind: 'failed', message: made.message })
    })
  }

  if (outcome.kind === 'made' || settled) {
    return <BatchDone batch={batch} outcome={outcome} />
  }

  return (
    <section aria-labelledby="remix-preview" className="surface-ring rounded-card bg-surface p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h2 id="remix-preview" className="type-h2">
          What this batch will cost
        </h2>
        <p className="type-sm text-muted">Nothing has been spent on these yet.</p>
      </div>
      {batch.sourceCredit ? (
        <p className="type-body mt-1 max-w-[68ch] text-muted">{batch.sourceCredit}</p>
      ) : null}

      <ul className="mt-4 grid gap-1.5">
        {REMIX_KINDS.map((spec) => {
          const mine = batch.derivatives.filter((d) => d.kind === spec.kind)
          if (mine.length === 0) return null
          const line = cost.lines.find((l) => l.kind === spec.kind)
          return (
            <li key={spec.kind} className="rounded-input bg-surface-2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4">
                <span className="type-h3 text-ink">{spec.label}</span>
                <span className="type-sm num text-muted">
                  {line ? `${line.credits} cr` : 'trimmed out'}
                </span>
              </div>
              <p className="type-sm mt-0.5 text-muted">{spec.what}</p>
              <div className="mt-2 flex flex-wrap gap-2">
                {mine.map((derivative) => (
                  <label
                    key={derivative.id}
                    className="flex cursor-pointer items-center gap-2 rounded-input bg-bg px-2.5 py-1.5"
                  >
                    <input
                      type="checkbox"
                      checked={!excluded.has(derivative.id)}
                      onChange={() => toggle(derivative.id)}
                      disabled={pending}
                      className="size-4 accent-[var(--accent)]"
                    />
                    <span className="type-sm text-ink">{derivative.channel}</span>
                    <span className="type-sm text-muted">{derivative.format}</span>
                    {needsAPhoto(derivative.kind, derivative.channel) ? (
                      // Said before the spend, not after: Remix writes words, and
                      // a channel that cannot publish words alone needs a photo
                      // attached in the composer before this draft can go out.
                      <span className="type-sm text-muted">· needs a photo</span>
                    ) : null}
                  </label>
                ))}
              </div>
            </li>
          )
        })}
      </ul>

      <dl className="mt-4 grid gap-1 border-t border-[var(--hairline)] pt-3">
        <div className="flex justify-between gap-4">
          <dt className="type-body text-muted">
            {cost.includedCount} {cost.includedCount === 1 ? 'draft' : 'drafts'} to write
          </dt>
          <dd className="type-body num text-ink">{cost.derivativeCredits} cr</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="type-body text-muted">The remix pack, charged when it runs</dt>
          <dd className="type-body num text-muted">{cost.batchCredits} cr</dd>
        </div>
        <div className="flex justify-between gap-4 border-t border-[var(--hairline)] pt-2">
          <dt className="type-h3 text-ink">In total</dt>
          <dd className="type-h3 num text-ink">{cost.totalCredits} cr</dd>
        </div>
      </dl>

      <p className="type-sm mt-2 text-muted">
        Unticking a channel takes away a draft and not a credit. One writing pass covers every
        channel it is for. Unticking a whole row is what changes the total.
      </p>

      {outcome.kind === 'short' ? <NotEnough {...outcome} /> : null}
      {outcome.kind === 'failed' ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {outcome.message}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Button onClick={makeThem} loading={pending} disabled={cost.includedCount === 0}>
          <CostLabel action="Make these drafts" cost={cost.totalCredits} />
        </Button>
        {cost.includedCount === 0 ? (
          <span className="type-sm text-muted">Keep at least one draft.</span>
        ) : null}
      </div>
    </section>
  )
}

/**
 * The refusal at a zero balance — BOTH numbers, the charge claim, and the way
 * out.
 *
 * ── AND THE SINGULAR IS NOT AN AFTERTHOUGHT ──────────────────────────────────
 * "needs 1 credits" is the branch a funded workspace never reaches, which is
 * exactly why it shipped wrong elsewhere: the only way to see it is to render
 * it. `batch-preview.test.tsx` renders `required: 1` and reads the sentence.
 */
function NotEnough({ required, available }: { required: number; available: number }) {
  return (
    <p role="alert" className="mt-3 rounded-input bg-warn-bg p-3 type-sm text-ink">
      This batch needs <span className="num">{required}</span>{' '}
      {required === 1 ? 'credit' : 'credits'} and you have <span className="num">{available}</span>.
      Nothing was written and nothing was charged.{' '}
      <Link href="/wallet" className="font-semibold underline underline-offset-2">
        Top up your wallet
      </Link>
    </p>
  )
}

function BatchDone({ batch, outcome }: { batch: BatchView; outcome: Outcome }) {
  const written = batch.derivatives.filter((d) => d.status === 'written')
  const drafts = outcome.kind === 'made' ? outcome.drafts : written.length
  const failedKinds = outcome.kind === 'made' ? outcome.failedKinds : 0
  // A batch still marked `running` is one whose request was cut off. Nothing
  // resumes it, so it is reported for what it is rather than as a finished run.
  const stopped = outcome.kind !== 'made' && batch.status === 'running'

  return (
    <section aria-labelledby="remix-done" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="remix-done" className="type-h2">
        {stopped
          ? 'This batch stopped part-way'
          : drafts === 0
            ? 'Nothing was written'
            : 'The drafts are written'}
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        {drafts === 0 ? (
          <>Nothing came back that could be saved, and the writing that failed was not charged.</>
        ) : (
          <>
            <span className="num">{drafts}</span> {drafts === 1 ? 'draft is' : 'drafts are'} waiting
            in{' '}
            <Link href="/posts" className="font-[550] text-accent underline underline-offset-2">
              your posts
            </Link>
            . Every one is a draft. Read it, change it, and approve it yourself before it goes
            anywhere.
          </>
        )}
      </p>
      {failedKinds > 0 ? (
        <p role="status" className="type-sm mt-2 text-muted">
          <span className="num">{failedKinds}</span> {failedKinds === 1 ? 'row' : 'rows'} came back
          empty and {failedKinds === 1 ? 'was' : 'were'} not charged.
        </p>
      ) : null}
      {outcome.kind === 'made' ? (
        <p className="type-sm mt-2 text-muted">
          <span className="num">{outcome.spent}</span> {outcome.spent === 1 ? 'credit' : 'credits'}{' '}
          charged.
        </p>
      ) : null}
    </section>
  )
}
