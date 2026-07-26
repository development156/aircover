import { QaConsoleView } from '@/components/admin/qa-console-view'
import { PageTitle } from '@/components/page-title'
import { readRecentQaRuns } from '@/lib/ops/read'

export const metadata = { title: 'QA' }

/** D4 · QA console (doc 13 §11 + §14). */
export default async function AdminQaPage() {
  const runs = await readRecentQaRuns()

  return (
    <div className="space-y-grid">
      <PageTitle>QA</PageTitle>

      {runs.status === 'ok' ? (
        <QaConsoleView runs={runs.data} />
      ) : (
        <section className="rounded-card border border-line bg-bg p-5 shadow-card">
          <p className="text-[13px] text-muted">
            We couldn&apos;t read the QA runs just now. The records are safe — this is our read
            failing. Reload to try again.
          </p>
          {runs.eventId ? (
            <p className="mt-2 font-mono text-[11px] text-faint">Reference {runs.eventId}</p>
          ) : null}
        </section>
      )}
    </div>
  )
}
