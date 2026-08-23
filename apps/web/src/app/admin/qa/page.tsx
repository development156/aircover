import { QaComposer } from '@/components/admin/qa-composer'
import { QaConsoleView } from '@/components/admin/qa-console-view'
import { QaTransfer } from '@/components/admin/qa-transfer'
import type { QaThumb } from '@/components/admin/qa-screenshots'
import { PageTitle } from '@/components/page-title'
import { requireOpsAdmin } from '@/lib/ops/guard'
import {
  readMyOpenQaDraft,
  readQaArtifacts,
  readRecentQaRuns,
  readTasks,
  signQaArtifactViews,
} from '@/lib/ops/read'

export const metadata = { title: 'QA' }

/** D4 · QA console (doc 13 §11 + §14). */
export default async function AdminQaPage() {
  const admin = await requireOpsAdmin()

  const [runs, tasks, draft] = await Promise.all([
    readRecentQaRuns(),
    readTasks(),
    readMyOpenQaDraft(admin.email),
  ])

  // Only the caller's own open draft restores, and only its own screenshots come
  // back with it.
  const openDraft = draft.status === 'ok' ? draft.data : null
  let restoredThumbs: QaThumb[] = []

  if (openDraft) {
    const artifacts = await readQaArtifacts(openDraft.id)
    if (artifacts.status === 'ok') {
      const urls = await signQaArtifactViews(artifacts.data.map((item) => item.storage_path))
      restoredThumbs = artifacts.data.map((item) => ({
        key: item.id,
        url: urls[item.storage_path] ?? null,
        caption: item.caption,
        state: 'stored' as const,
      }))
    }
  }

  const taskCodes = tasks.status === 'ok' ? tasks.data.map((task) => task.code) : []

  return (
    <div className="space-y-grid">
      <PageTitle>QA</PageTitle>

      {/* Composing is a write path that needs none of the feed, so a failed feed
          read must not take it down too. */}
      <QaComposer openDraft={openDraft} restoredThumbs={restoredThumbs} taskCodes={taskCodes} />

      {draft.status === 'unreadable' ? (
        <p className="text-[12px] text-warn">
          We couldn&apos;t check for an unfinished draft. If you left one open, finish it after a
          reload rather than starting a second.
        </p>
      ) : null}

      <QaTransfer />

      {runs.status === 'ok' ? (
        <QaConsoleView runs={runs.data} />
      ) : (
        <section className="rounded-card border border-line bg-bg p-5 shadow-card">
          <p className="text-[13px] text-muted">
            We couldn&apos;t read the QA runs just now. The records are safe. This is our read
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
