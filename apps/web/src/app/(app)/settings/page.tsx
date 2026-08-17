import { SlidersHorizontal } from 'lucide-react'
import { WorkspaceNameField } from '@/components/settings/workspace-name-field'

import { EmptyState } from '@/components/empty-state'
import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Settings' }

/**
 * Workspace — the default settings tab.
 *
 * READ-ONLY on purpose. Renaming a workspace is a mutation and this pass writes
 * none, so the rows state what is stored and offer no control. A disabled input
 * would imply an edit that is not coming.
 */
export default async function SettingsPage() {
  const workspace = await getActiveWorkspace()

  if (workspace === null) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Nothing to configure yet"
        body="Settings belong to a workspace and you don't have one yet. Nothing failed — there is simply nothing to show until one exists."
      />
    )
  }

  return (
    <SettingCard title="Workspace">
      <SettingRow
        label="Name"
        hint="What this workspace is called in the switcher."
        control={<WorkspaceNameField workspaceId={workspace.id} initialName={workspace.name} />}
      />
      <SettingRow
        label="Address"
        hint="Its stable identifier. Used in links and never reused."
        control={<span className="text-[13px] font-[550] text-ink">{workspace.slug}</span>}
      />
    </SettingCard>
  )
}
