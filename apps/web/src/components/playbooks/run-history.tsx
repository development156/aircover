import Link from 'next/link'

import { recipeNameFor } from '@/lib/playbooks/read'
import type { RunWithItems } from '@/lib/playbooks/store'

/**
 * WHAT EACH RUN DID, AND WHAT IT PRODUCED.
 *
 * ── FOUR ENDINGS, IN FOUR DIFFERENT SENTENCES ────────────────────────────────
 * `completed`, `nothing_to_do`, `cancelled` and `failed` are genuinely different
 * things and collapsing them into "done / not done" is where automation UIs start
 * lying. A run that found no festival did its job; a run somebody stopped is not
 * a failure; a run that broke charged nothing. Each gets its own line.
 *
 * ── EVERY NUMBER IS A COUNT OF ROWS OR A CREDIT TOTAL ───────────────────────
 * There is no success rate, no time saved, no estimated reach. Those would be
 * claims about the reader's business and no query behind this list has earned
 * one. `spent_credits` is a stored sum of what the ledger charged; the item
 * counts are counts.
 */

const ENDING: Record<string, string> = {
  completed: 'Finished',
  nothing_to_do: 'Found nothing in the window',
  awaiting_cost_approval: 'Waiting for you to approve the cost',
  proposing: 'Working out what to make',
  running: 'Writing',
  cancelled: 'Stopped',
  failed: 'Stopped on an error',
}

const OUTCOME: Record<string, string> = {
  drafted: 'draft in your Planner',
  awaiting_approval: 'scheduled, waiting for your approval',
  suggested: 'suggestion only',
  skipped: 'dropped from the preview',
  failed: 'could not be written',
  proposed: 'proposed',
}

/**
 * Statuses in which a run is still LIVE, and therefore occupies its playbook's
 * one-live-run slot. Taken from the same set the partial unique index uses: a
 * run is live until it reaches a terminal status.
 */
const HOLDS_THE_SLOT = new Set(['proposing', 'awaiting_cost_approval', 'running'])

export function RunHistory({ runs }: { runs: readonly RunWithItems[] }) {
  return (
    <section aria-labelledby="pb-history" className="surface-ring rounded-card bg-surface p-4">
      <h2 id="pb-history" className="type-h3 text-ink">
        What your playbooks have done
      </h2>

      {runs.length === 0 ? (
        // The claim is precise: no playbook of yours has run. Not "no playbooks
        // exist" and not "nothing was found" — those are different sentences and
        // only one of them is true here.
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          None of your playbooks has run yet. When one does, this is where you see what set it off,
          what it made, and what it cost.
        </p>
      ) : (
        <ul className="mt-3 grid gap-3">
          {runs.map((run) => (
            <li key={run.id} className="surface-ring rounded-card bg-s2 p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="type-body text-ink">{recipeNameFor(run.recipe_key)}</h3>
                <span className="type-sm text-muted">
                  {ENDING[run.status] ?? run.status}
                  {run.trigger_source === 'schedule' ? ' · on its schedule' : ''}
                </span>
              </div>

              {HOLDS_THE_SLOT.has(run.status) ? (
                // ── WHY THIS SENTENCE EXISTS ────────────────────────────────
                // Two rules, each right on its own. A playbook may have one live
                // run at a time (a partial unique index refuses a second), and a
                // run that has proposed but not been approved is still live. So
                // an unopened preview STOPS the schedule from proposing anything
                // new for that playbook — the daily check counts it as
                // `alreadyRunning` and moves on, which is correct: opening a
                // second would charge twice for the same festival.
                //
                // Correct, and completely invisible. In November somebody will
                // see a playbook that has not fired for weeks and read it as
                // broken. Saying it here is the difference between a bug report
                // and a decision.
                <p className="type-sm mt-1 text-muted">
                  Nothing new will be proposed for this playbook until you approve or stop this run.
                </p>
              ) : null}

              <p className="type-sm mt-1 text-muted">
                Started{' '}
                <time dateTime={run.started_at} className="tabular-nums">
                  {run.started_at.slice(0, 10)}
                </time>
                {run.spent_credits > 0 ? (
                  <>
                    {' · spent '}
                    <span className="tabular-nums">{run.spent_credits}</span>
                    {run.spent_credits === 1 ? ' credit' : ' credits'}
                  </>
                ) : (
                  // Zero is stated rather than omitted. "Nothing was charged" is
                  // the answer people most want from an automation they did not
                  // watch, and a blank leaves them guessing.
                  ' · nothing charged'
                )}
              </p>

              {run.items.length > 0 ? (
                <ul className="mt-2 grid gap-1">
                  {run.items.map((item) => (
                    <li key={item.id} className="type-sm flex flex-wrap gap-x-2 text-muted">
                      <span className="text-ink">{item.title}</span>
                      <span>— {OUTCOME[item.outcome] ?? item.outcome}</span>
                      {item.post_id ? (
                        <Link
                          href={`/posts/${item.post_id}`}
                          className="font-[550] text-accent underline underline-offset-2"
                        >
                          Open it
                        </Link>
                      ) : null}
                    </li>
                  ))}
                </ul>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
