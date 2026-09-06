'use client'

import { useState, useTransition } from 'react'
import { Lightbulb } from 'lucide-react'

import { resolveLearning } from '@/app/actions/loop-controls'
import { Button } from '@/components/ui/button'
import { metricInWords } from '@/lib/report/metric-words'
import type { PendingLearning } from '@/lib/loop/read'

/**
 * WHAT SAHODA NOTICED — proposed, never applied.
 *
 * ── THE TWO BUTTONS ARE NOT A CONFIRM DIALOG ─────────────────────────────────
 * Accepting writes a new version of the Brand Brain. Rejecting writes nothing to
 * it at all — not a version, not a timestamp. So they are genuinely different
 * actions with different consequences, and the copy says which is which rather
 * than offering "Yes" and "No" against a question the reader has to hold in
 * their head.
 *
 * ── THE EVIDENCE IS SHOWN, AND IT IS SHOWN AS WHAT IT IS ─────────────────────
 * A learning is a claim about the reader's own business, so the panel prints how
 * many posts it was computed from and over how many days. That is the number
 * that decides whether the claim deserves belief, and burying it would make a
 * finding from three posts look exactly like a finding from three hundred.
 *
 * When a proposal recorded no evidence, this shows NO figures rather than
 * zeroes. A sample size of 0 on screen reads as a real measurement of nothing,
 * which is a different and false claim from "this one did not record its
 * working".
 */

export function PendingLearnings({ learnings }: { learnings: readonly PendingLearning[] }) {
  if (learnings.length === 0) return null
  return (
    <section aria-labelledby="loop-learnings" className="flex flex-col gap-3">
      <div>
        <h2 id="loop-learnings" className="type-h2">
          What Sahoda noticed
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          Each of these would change your Brand Brain. None of them has. Accepting one writes a new
          version you can see in the Brain; turning it down leaves the Brain exactly as it is.
        </p>
      </div>
      <ul className="grid gap-2">
        {learnings.map((learning) => (
          <LearningCard key={learning.id} learning={learning} />
        ))}
      </ul>
    </section>
  )
}

function LearningCard({ learning }: { learning: PendingLearning }) {
  const [settled, setSettled] = useState<'accepted' | 'rejected' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function answer(decision: 'accepted' | 'rejected') {
    setError(null)
    startTransition(async () => {
      const result = await resolveLearning(learning.id, decision)
      if (!result.ok) {
        setError(result.message ?? 'Could not save that.')
        return
      }
      setSettled(result.status ?? decision)
    })
  }

  if (settled) {
    return (
      <li className="surface-ring rounded-card bg-surface p-4">
        <p className="type-body text-muted">
          {settled === 'accepted'
            ? 'Added to your Brand Brain.'
            : 'Turned down. Your Brand Brain is unchanged.'}
        </p>
      </li>
    )
  }

  return (
    <li className="surface-ring rounded-card bg-surface p-4">
      <div className="flex items-start gap-3">
        <Lightbulb
          size={16}
          strokeWidth={1.8}
          aria-hidden
          className="mt-icon-nudge shrink-0 text-accent"
        />
        <div className="min-w-0 flex-1">
          <p className="type-body text-ink">{learning.summary}</p>
          {learning.evidence ? (
            <p className="type-sm mt-1.5 text-muted">
              From <span className="num">{learning.evidence.postCount}</span>{' '}
              {learning.evidence.postCount === 1 ? 'post' : 'posts'} over{' '}
              <span className="num">{learning.evidence.windowDays}</span>{' '}
              {learning.evidence.windowDays === 1 ? 'day' : 'days'}, measured by{' '}
              {metricInWords(learning.evidence.metric)}.
            </p>
          ) : (
            <p className="type-sm mt-1.5 text-muted">
              This one did not record what it was computed from.
            </p>
          )}
        </div>
      </div>

      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => answer('accepted')} loading={pending}>
          Add it to my Brain
        </Button>
        <Button variant="ghost" onClick={() => answer('rejected')} disabled={pending}>
          Not right
        </Button>
      </div>
    </li>
  )
}
