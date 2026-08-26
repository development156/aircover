import type { Metadata } from 'next'

import { requireOpsAdmin } from '@/lib/ops/guard'
import { readMarketingObservations } from '@/lib/ops/read'

export const metadata: Metadata = { title: 'Marketing Brain' }

/**
 * `/admin/brain` — what the Marketing Brain has actually written.
 *
 * ── IT SHIPS WITH THE TABLE, NOT AFTER IT ───────────────────────────────────
 * docs/53's build order puts this in the same step as the migration for one
 * reason: `post_publish_logs` spent months holding seven failed publishes that
 * nobody could see, because the table existed and the window onto it did not.
 * The Marketing Brain is hidden from customers by design, so an operator page is
 * not a nice-to-have here, it is the ONLY way to answer "is the weekly pass
 * writing anything, and is what it writes any good".
 *
 * ── THE RAW EVIDENCE IS ON THE PAGE, NOT BEHIND A CONTROL ───────────────────
 * A claim's whole value is its arithmetic, so an operator judging a claim needs
 * the arithmetic in front of them. Rendered as JSON, deliberately: this is the
 * stored shape, and prettifying it here would mean an operator reviewing a
 * formatted version of a row rather than the row.
 */
export default async function MarketingBrainPage() {
  await requireOpsAdmin()
  const read = await readMarketingObservations()

  // An empty page here means "the pass has written nothing", which is a real and
  // useful finding. A failed read means nobody knows. Saying the first when the
  // second is true is how a broken job looks like a quiet one.
  if (read.status !== 'ok') {
    return (
      <div className="space-y-grid">
        <h1 className="type-h2 font-extrabold">Marketing Brain</h1>
        <div
          role="alert"
          className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 type-sm text-danger"
        >
          We couldn&apos;t read the observations just now. This is our read failing, not a report
          that the pass has written nothing. Reload to try again.
        </div>
        {read.eventId ? (
          <p className="font-mono type-chip text-muted">Reference {read.eventId}</p>
        ) : null}
      </div>
    )
  }

  return (
    <div className="space-y-grid">
      <div>
        <h1 className="type-h2 font-extrabold">Marketing Brain</h1>
        <p className="type-sm mt-1 max-w-[70ch] text-muted">
          Every observation the weekly pass has written, newest first. Customers never see this
          list; they see individual observations on their report. Nothing here was phrased by a
          model.
        </p>
      </div>

      {read.data.length === 0 ? (
        <p className="surface-ring rounded-card bg-surface p-4 type-body text-muted">
          The pass has written nothing yet. It runs on Sundays and only speaks when a workspace has
          enough published posts to clear the floors.
        </p>
      ) : (
        <ul className="grid gap-3">
          {read.data.map((row) => (
            <li key={row.id} className="surface-ring rounded-card bg-surface p-4">
              <p className="type-chip flex flex-wrap gap-2 font-mono text-muted">
                <span>{row.computed_on}</span>
                <span aria-hidden>·</span>
                <span>{row.kind}</span>
                <span aria-hidden>·</span>
                <span>{row.subject}</span>
                <span aria-hidden>·</span>
                <span>ws {row.workspace_id.slice(0, 8)}</span>
              </p>
              <p className="type-body mt-1.5 max-w-[70ch] text-ink">{row.claim}</p>
              <pre className="mt-2 overflow-x-auto rounded-input bg-subtle p-2.5 font-mono type-chip text-muted">
                {JSON.stringify(row.evidence, null, 2)}
              </pre>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
