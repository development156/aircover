import { Board } from '@/components/admin/board'
import { AdminCharts } from '@/components/admin/charts'
import { Changelog } from '@/components/admin/changelog'
import { DangerZone } from '@/components/admin/danger-zone'
import { DevRegions } from '@/components/admin/dev-regions'
import { HeroCard } from '@/components/admin/hero-card'
import { HeaderStrips } from '@/components/admin/strips'
import { PageTitle } from '@/components/page-title'
import { toCards } from '@/lib/ops/board'
import { getOpsAdmin } from '@/lib/ops/guard'
import { GATE_SUITES, readGateRuns, readRecentQaRuns, readTasks } from '@/lib/ops/read'
import { isRed } from '@/lib/ops/rollup'
import { gateChips, redSuitesFrom } from '@/lib/ops/session-pulse'

export const metadata = { title: 'Dev' }

/**
 * `/admin/dev` — the DevOps dashboard (doc 13 §14, rebuilt by SL-062).
 *
 * PROGRESS LEADS. The hero card sits at the top, never collapsible, and answers
 * "where are we" on its own. Everything below it is detail, collapsed until
 * somebody opens it, with the open/closed choice remembered per admin.
 *
 * The red flags on the collapsed headers are computed HERE, from the same reads
 * the regions themselves use — `readTasks`, `readRecentQaRuns` and
 * `readGateRuns` are all request-cached, so this costs no extra queries and,
 * more importantly, cannot disagree with what is inside the region it labels.
 */
export default async function AdminDevPage() {
  const [admin, tasks, runs, gates] = await Promise.all([
    getOpsAdmin(),
    readTasks(),
    readRecentQaRuns(),
    readGateRuns(),
  ])

  const cards =
    tasks.status === 'ok'
      ? toCards(tasks.data, runs.status === 'ok' ? runs.data : [], new Date())
      : []
  const redCards = cards.filter(isRed).length
  const redSuites =
    gates.status === 'ok' ? redSuitesFrom(gateChips([...GATE_SUITES], gates.data)) : []

  return (
    <div className="space-y-grid">
      <PageTitle>Dev</PageTitle>

      <HeroCard />

      <DevRegions
        // Falls back to a shared key rather than throwing: a request that got
        // this far HAS an admin, and a layout preference is not worth a crash.
        adminId={admin?.user_id ?? 'unknown-admin'}
        cardCount={cards.length > 0 ? `${cards.length} cards` : undefined}
        boardRed={redCards > 0 ? `${redCards} blocked or failing` : null}
        gatesRed={
          redSuites.length > 0
            ? `${redSuites.join(', ')} ${redSuites.length === 1 ? 'is' : 'are'} failing`
            : null
        }
        strips={<HeaderStrips />}
        board={<Board />}
        changelog={<Changelog />}
        charts={<AdminCharts />}
      />

      {/* Last on the page, and outside the collapsible regions: a destructive
          tool should not be something you meet by expanding a header. Renders
          nothing at all for a non-owner — the RPC refuses them anyway, so a
          visible control would only be a button that fails. */}
      <DangerZone isOwner={admin?.role === 'owner'} />
    </div>
  )
}
