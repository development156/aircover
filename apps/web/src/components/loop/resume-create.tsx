'use client'

import { useState, useTransition } from 'react'

import { runCreateStage } from '@/app/actions/loop-create'
import { Button } from '@/components/ui/button'
import { CostLabel } from '@/components/ui/cost-label'
import { credits } from '@/lib/credit-words'

/**
 * The way back into a cycle that was approved and never finished.
 *
 * ── THE STATE THIS SCREEN HAD NO CONTROL FOR ─────────────────────────────────
 * Approving the cost preview is one call and writing the drafts is a second,
 * chained in the preview's own transition. The approval revalidates `/loop`,
 * the cycle is now `creating`, the preview unmounts, and whatever the create
 * stage then had to say (on the wt-core preview: a missing database URL) had
 * no element left to say it in. The page showed "Running now", step 4 of 7,
 * and nothing a person could press. A reload showed the same. The only exit
 * was the stop switch, which also pauses the Loop (MEASURED 2026-09-06).
 *
 * So a cycle in `creating` or `staging` gets this panel: what was approved,
 * what is still unwritten, and the same `runCreateStage` the preview calls.
 * Entering it again is safe by construction: briefs that already carry a post
 * are skipped before anything is charged.
 */
export interface ResumeCreateProps {
  cycleId: string
  /** Briefs approved for this cycle that do not yet carry a post. */
  unwritten: number
  /** What writing those would cost, from the same prices the preview showed. */
  unwrittenCredits: number
  /** What has already been written this cycle. */
  written: number
}

export function ResumeCreate({ cycleId, unwritten, unwrittenCredits, written }: ResumeCreateProps) {
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function resume() {
    setError(null)
    startTransition(async () => {
      const made = await runCreateStage(cycleId)
      if (!made.ok) {
        setError(made.message ?? 'The drafts could not be written. Nothing more was charged.')
        return
      }
      setDone(
        made.created === 0
          ? 'This week is finished. Nothing more needed writing.'
          : `Wrote ${made.created} ${made.created === 1 ? 'draft' : 'drafts'}` +
              (made.spent === undefined ? '.' : ` for ${credits(made.spent)}.`),
      )
    })
  }

  if (done) {
    return (
      <section aria-labelledby="loop-resume" className="surface-ring rounded-card bg-surface p-4">
        <h2 id="loop-resume" className="type-h2">
          This week is written
        </h2>
        <p role="status" className="type-body mt-1 max-w-[68ch] text-muted">
          {done}
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="loop-resume" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="loop-resume" className="type-h2">
        Approved, not yet written
      </h2>
      <p className="type-body mt-1 max-w-[68ch] text-muted">
        {unwritten === 0
          ? `Sahoda wrote ${written === 1 ? 'the post' : `all ${written} posts`} for this week but did not finish the cycle. Finish it here. Nothing more is charged.`
          : `You approved this week and Sahoda has ${written > 0 ? `written ${written} of them, with ` : ''}${unwritten} ${unwritten === 1 ? 'post' : 'posts'} still to write. Nothing is charged until it writes them.`}
      </p>

      {error ? (
        <p role="alert" className="type-sm mt-3 text-danger">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button onClick={resume} loading={pending}>
          {unwritten === 0 ? (
            'Finish this week'
          ) : (
            <CostLabel action="Write this week" cost={unwrittenCredits} />
          )}
        </Button>
      </div>
    </section>
  )
}
