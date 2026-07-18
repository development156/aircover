import { SquarePen } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Posts' }

export default function PostsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Posts</PageTitle>
      <EmptyState
        icon={SquarePen}
        title="Nothing drafted yet"
        body="The posts editor lands next in Alpha."
      />
    </div>
  )
}
