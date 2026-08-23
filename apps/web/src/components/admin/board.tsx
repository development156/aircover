import { BoardView } from '@/components/admin/board-view'
import { toCards } from '@/lib/ops/board'
import { canWrite, getOpsAdmin } from '@/lib/ops/guard'
import { readRecentQaRuns, readRoadmapItems, readTasks } from '@/lib/ops/read'

/**
 * D3 · Scrum board, server half (doc 13 §10) — reads, then hands plain data to
 * the client view that owns the filters.
 */
export async function Board() {
  const [tasks, runs, admin, items] = await Promise.all([
    readTasks(),
    readRecentQaRuns(),
    getOpsAdmin(),
    readRoadmapItems(),
  ])

  if (tasks.status !== 'ok') {
    return (
      <section id="board" aria-labelledby="board-heading" className="scroll-mt-4">
        <h2 id="board-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Board
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          We couldn&apos;t read the board just now. The cards are safe. This is our read failing.
          Reload to try again.
        </p>
        {tasks.eventId ? (
          <p className="mt-2 font-mono text-[11px] text-faint">Reference {tasks.eventId}</p>
        ) : null}
      </section>
    )
  }

  // A failed QA read costs the dots, not the board. Every card then shows
  // `none`, which is exactly what "we have no verdict for this" means — the
  // same thing it would mean if the runs genuinely were not there.
  const cards = toCards(tasks.data, runs.status === 'ok' ? runs.data : [], new Date())

  // Real roadmap titles, so a rolled-up stage reads "Foundations — ops tables,
  // RLS…" rather than "AO1". An unreadable roadmap costs the words and nothing
  // else: `rollup` falls back to the code rather than to a blank heading.
  const stageLabels =
    items.status === 'ok'
      ? Object.fromEntries(items.data.map((item) => [item.code, item.title]))
      : {}

  // A viewer never receives the write controls. The RPCs refuse them anyway;
  // this keeps the page from offering something it knows will be refused.
  return (
    <BoardView cards={cards} canWrite={admin ? canWrite(admin) : false} stageLabels={stageLabels} />
  )
}
