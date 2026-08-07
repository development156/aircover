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
        title="Nothing to configure yet"
        body="Workspace and profile settings are still being built — nothing here is hidden behind a setting in the meantime."
      />
    </div>
  )
}
