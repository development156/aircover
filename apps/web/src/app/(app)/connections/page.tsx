import { Link2 } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Connections' }

export default function ConnectionsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Connections</PageTitle>
      <EmptyState
        icon={Link2}
        title="No channels connected"
        body="X and Google Business Profile connect here when the adapters land."
      />
    </div>
  )
}
