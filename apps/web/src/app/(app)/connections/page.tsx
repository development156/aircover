import { Link2 } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'

export const metadata = { title: 'Connections' }

export default function ConnectionsPage() {
  return (
    <div className="space-y-grid">
      <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Connections</h1>
      <EmptyState
        icon={Link2}
        title="No channels connected"
        body="X and Google Business Profile connect here when the adapters land."
      />
    </div>
  )
}
