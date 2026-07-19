import { SlidersHorizontal } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Settings</PageTitle>
      <EmptyState
        icon={SlidersHorizontal}
        title="Settings arrive with workspaces"
        body="Workspace and profile settings land with the bootstrap flow."
      />
    </div>
  )
}
