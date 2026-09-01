import { ObservationNote } from '@/components/brain/observation-note'
import { brainWaiting } from '@/lib/brain/waiting'
import type { BrainRead } from '@/lib/brain/read'

/**
 * WHAT I NOTICED ON MY OWN — the Marketing Brain's block, kept through the
 * report's rebuild.
 *
 * ── FOUR STATES, AND THE TWO EMPTY ONES SAY DIFFERENT THINGS ────────────────
 * A failed read must not tell somebody they have published too little, and a
 * customer who has published too little must not be offered a reload. Both are
 * the impossible remedy this codebase forbids elsewhere.
 *
 * ── AND IT NAMES THE FLOOR RATHER THAN THE OUTCOME ─────────────────────────
 * "Nothing noticed yet" is true and useless: it reads as a product that is not
 * working. Saying what a noticing needs behind it tells the reader what would
 * change it.
 */
export function NoticedBlock({ brain }: { brain: BrainRead }) {
  return (
    <section className="surface-ring rounded-card bg-surface p-4">
      <h3 className="type-h3 text-ink">What I noticed on my own</h3>
      <div className="mt-2">
        {brain.status === 'error' ? (
          <p className="type-body max-w-[62ch] text-muted">
            Sahoda couldn&rsquo;t read what it has noticed just now, so this block can&rsquo;t say
            whether there is anything. Try again in a moment.
          </p>
        ) : brain.status === 'no-workspace' ? (
          <p className="type-body max-w-[62ch] text-muted">
            Finish setting up your workspace and this fills in.
          </p>
        ) : brain.observations.length === 0 ? (
          <WaitingNote brain={brain} />
        ) : (
          <ul className="grid gap-2">
            {brain.observations.map((observation) => (
              <li key={`${observation.kind}:${observation.subject}:${observation.computedOn}`}>
                <ObservationNote observation={observation} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}

/**
 * WHY THE BLOCK IS EMPTY, WHICH IS A DIFFERENT SENTENCE EVERY WEEK.
 *
 * One static paragraph read identically in week 1 and week 20, so a customer
 * whose report had been empty for two months could not tell a product that is
 * working and waiting from a job that stopped running.
 */
function WaitingNote({ brain }: { brain: Extract<BrainRead, { status: 'ok' }> }) {
  const waiting = brainWaiting(brain.lastPass)

  if (waiting.state === 'never-examined') {
    return (
      <p className="type-body max-w-[62ch] text-muted">
        Sahoda has not looked at this workspace yet. It reads your published posts once a week and
        only speaks when the numbers are strong enough to stand behind.
      </p>
    )
  }

  return (
    <div className="space-y-2">
      <p className="type-body max-w-[62ch] text-muted">
        Sahoda last looked on <span className="num">{waiting.lastLookedOn}</span> and had nothing it
        could stand behind.
      </p>
      {waiting.reasons.length > 0 && (
        <ul className="grid gap-1 border-l-2 border-line pl-2.5">
          {waiting.reasons.map((reason) => (
            <li key={reason} className="type-sm max-w-[62ch] text-muted">
              {reason}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
