import type { Metadata } from 'next'

import { PageTitle } from '@/components/page-title'
import { requireOpsAdmin } from '@/lib/ops/guard'
import { readPublishDeadLetters } from '@/lib/ops/read'

export const metadata: Metadata = { title: 'Dead letters' }

const JOBS_SUB =
  'Publishes that failed, newest first, across every workspace. Tenants are shown by id. Naming them would mean widening what an operator can read.'

/**
 * `/admin/jobs` — the publishes that failed.
 *
 * Doc 19 §4 asks for a dead-letter view because failed jobs vanish. They did not
 * quite vanish: `post_publish_logs` recorded every one. What vanished was the
 * ability to LOOK, because the table carried a single member-scoped select
 * policy and `apps/web` has no service-role client (correctly — it must never
 * gain one). MEASURED 2026-08-22: 7 failed publishes in production, visible to
 * nobody but a member of the one workspace they happened in.
 *
 * Migration 20260822160000 adds the `app.is_ops_admin()` policy, so this page
 * renders through the operator's own token and RLS decides what it shows.
 */
export default async function DeadLettersPage() {
  await requireOpsAdmin()
  const letters = await readPublishDeadLetters()

  // An unreadable list is said out loud. An empty dead-letter page means
  // "nothing has failed", which is the best possible news and must never be the
  // way a broken read looks.
  if (letters.status !== 'ok') {
    return (
      <div className="space-y-grid">
        {/* NO `sub` — see /admin/brain. The read failed, so there is no list
            for the description to describe. */}
        <PageTitle>Dead letters</PageTitle>
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 type-sm text-danger"
        >
          We couldn&apos;t read the failed publishes just now. This is our read failing, not a
          report that nothing has failed. Reload to try again.
        </div>
        {letters.eventId ? (
          <p className="font-mono type-chip text-muted">Reference {letters.eventId}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <PageTitle sub={JOBS_SUB}>Dead letters</PageTitle>

      {letters.data.length === 0 ? (
        <p className="type-body text-muted">
          No publish has failed. This list is empty because nothing is in it, not because we
          couldn&apos;t read it.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="type-sm w-full text-left">
            <thead className="text-muted">
              <tr className="border-b border-line-soft">
                <th scope="col" className="type-eyebrow py-2 pr-4">
                  When
                </th>
                <th scope="col" className="type-eyebrow py-2 pr-4">
                  Channel
                </th>
                <th scope="col" className="type-eyebrow py-2 pr-4">
                  Mode
                </th>
                {/* A count is a number, and numbers sit on the right. */}
                <th scope="col" className="type-eyebrow py-2 pr-4 text-right">
                  Attempt
                </th>
                <th scope="col" className="type-eyebrow py-2 pr-4">
                  Workspace
                </th>
                <th scope="col" className="type-eyebrow py-2">
                  What the platform said
                </th>
              </tr>
            </thead>
            <tbody>
              {letters.data.map((letter) => (
                <tr
                  key={letter.id}
                  className="border-b border-line-soft align-top transition-micro last:border-0 hover:bg-s2"
                >
                  <td className="py-2 pr-4 tabular-nums whitespace-nowrap">
                    {letter.created_at.slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="py-2 pr-4">{letter.channel}</td>
                  <td className="py-2 pr-4">{letter.mode}</td>
                  <td className="num py-2 pr-4 text-right tabular-nums">{letter.attempt}</td>
                  <td className="py-2 pr-4 font-mono type-chip text-muted">
                    {letter.workspace_id.slice(0, 8)}
                  </td>
                  <td className="py-2">
                    {/* The provider's own words, unedited. A dead-letter list that
                        paraphrased the error would be the one place a paraphrase
                        costs the most. */}
                    {letter.error ?? (
                      <span className="text-muted">
                        recorded as failed with no message. The failure is real, the reason was not
                        captured
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
