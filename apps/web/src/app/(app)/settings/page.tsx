import { SlidersHorizontal } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'

export const metadata = { title: 'Settings' }

export default function SettingsPage() {
  return (
    <div className="space-y-grid">
      <h1 className="text-[25px] leading-8 font-extrabold tracking-[-0.01em]">Settings</h1>
      <EmptyState
        icon={SlidersHorizontal}
        title="Settings arrive with workspaces"
        body="Workspace and profile settings land with the bootstrap flow."
      />
    </div>
  )
}
