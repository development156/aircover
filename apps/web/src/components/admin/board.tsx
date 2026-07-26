import { BoardView } from '@/components/admin/board-view'
import { toCards } from '@/lib/ops/board'
import { readRecentQaRuns, readTasks } from '@/lib/ops/read'

/**
 * D3 · Scrum board, server half (doc 13 §10) — reads, then hands plain data to
 * the client view that owns the filters.
 */
export async function Board() {
  const [tasks, runs] = await Promise.all([readTasks(), readRecentQaRuns()])

  if (tasks.status !== 'ok') {
    return (
      <section id="board" aria-labelledby="board-heading" className="scroll-mt-4">
        <h2 id="board-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Board
        </h2>
        <p className="mt-1.5 text-[13px] text-muted">
          We couldn&apos;t read the board just now. The cards are safe — this is our read failing.
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

  return <BoardView cards={cards} />
}
