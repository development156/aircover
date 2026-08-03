import { FlowChart } from '@/components/admin/flow-chart'
import { GateChart } from '@/components/admin/gate-chart'
import { buildFlowHistory } from '@/lib/ops/flow-history'
import { buildGateHistory } from '@/lib/ops/gate-history'
import { readRecentQaRuns, readTasks } from '@/lib/ops/read'

/**
 * The two charts under the board (SL-042), server half.
 *
 * Deliberately NOT a velocity chart. Velocity over a handful of days is a
 * number that moves for reasons that have nothing to do with the team, and
 * putting one here would invite exactly the reading it cannot support. It
 * arrives when there is enough history to mean something.
 *
 * Each chart fails on its own: an unreadable QA feed costs the gate strip, not
 * the flow, and neither reports an empty window as a healthy one.
 */
export async function AdminCharts() {
  const [tasks, runs] = await Promise.all([readTasks(), readRecentQaRuns()])
  const now = new Date()

  return (
    /* Side by side from the wide breakpoint (SL-062 §4). Below it they stack,
       because two charts squeezed into half a narrow screen are two charts
       nobody can read. The shadow is gone: the collapsible region around this
       is already a card, and a card inside a card reads as a mistake. */
    <div className="grid gap-grid wide:grid-cols-2">
      <section aria-labelledby="flow-heading" className="rounded-card border border-line bg-bg p-4">
        <h2 id="flow-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Cumulative flow
        </h2>
        <p className="mt-1 mb-3 text-[13px] text-muted">Where every card sat, day by day.</p>

        {tasks.status === 'ok' ? (
          <FlowChart history={buildFlowHistory(tasks.data, now)} />
        ) : (
          <p className="text-[13px] text-muted">
            We couldn&apos;t read the board, so this is blank rather than empty — there may well be
            work here. Reload to try again.
          </p>
        )}
      </section>

      <section aria-labelledby="gate-heading" className="rounded-card border border-line bg-bg p-4">
        <h2 id="gate-heading" className="text-[15px] font-bold tracking-[-0.01em]">
          Gate health
        </h2>
        <p className="mt-1 mb-3 text-[13px] text-muted">
          Every suite, every day. A hollow cell is a day it did not run.
        </p>

        {runs.status === 'ok' ? (
          <GateChart history={buildGateHistory(runs.data, now)} />
        ) : (
          <p className="text-[13px] text-muted">
            We couldn&apos;t read the QA runs, so this is blank rather than empty. Reload to try
            again.
          </p>
        )}
      </section>
    </div>
  )
}
