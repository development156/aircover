import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Planner' }

export default function PlannerPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Planner</PageTitle>
      <EmptyState
        icon={CalendarDays}
        title="Your week shows up here"
        body="The planner fills in once posts exist."
      />
    </div>
  )
}
