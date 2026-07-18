import { SquarePen } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'

export const metadata = { title: 'Posts' }

export default function PostsPage() {
  return (
    <div className="space-y-grid">
      <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Posts</h1>
      <EmptyState
        icon={SquarePen}
        title="Nothing drafted yet"
        body="The posts editor lands next in Alpha."
      />
    </div>
  )
}
