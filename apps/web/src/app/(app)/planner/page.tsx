import { CalendarDays } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'

export const metadata = { title: 'Planner' }

export default function PlannerPage() {
  return (
    <div className="space-y-grid">
      <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Planner</h1>
      <EmptyState
        icon={CalendarDays}
        title="Your week shows up here"
        body="The planner fills in once posts exist."
      />
    </div>
  )
}
