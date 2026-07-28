import { Board } from '@/components/admin/board'
import { AdminCharts } from '@/components/admin/charts'
import { Changelog } from '@/components/admin/changelog'
import { RoadmapCard } from '@/components/admin/roadmap-card'
import { HeaderStrips } from '@/components/admin/strips'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Dev' }

/**
 * `/admin/dev` — the DevOps dashboard (doc 13 §14).
 *
 * Layout is the doc's: roadmap card full-width on top, strips under it, then the
 * board with the changelog rail at 380px on the right. The regions are laid out
 * first and filled card by card, so each one lands in its final position rather
 * than being moved once the real component arrives.
 */
export default function AdminDevPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Dev</PageTitle>

      <RoadmapCard />

      <HeaderStrips />

      <div className="grid gap-grid wide:grid-cols-[1fr_380px]">
        <Board />
        <Changelog />
      </div>

      <AdminCharts />
    </div>
  )
}
