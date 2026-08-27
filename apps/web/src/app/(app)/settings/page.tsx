import { SlidersHorizontal } from 'lucide-react'
import { WorkspaceNameField } from '@/components/settings/workspace-name-field'
import { WorkspaceTimezoneField } from '@/components/settings/workspace-timezone-field'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { SettingCard, SettingRow } from '@/components/settings/setting-row'
import { Enter } from '@/components/motion/stagger'
import { YourDataPanel } from '@/components/settings/your-data-panel'
import { getActiveWorkspace } from '@/lib/workspaces'

export const metadata = { title: 'Settings' }

/**
 * Workspace — the default settings tab.
 *
 * NOT read-only any more. This comment used to say "READ-ONLY on purpose …the
 * rows state what is stored and offer no control", which stopped being true
 * when `WorkspaceNameField` landed with a real input and a Save. Corrected
 * rather than left, because a stale comment about what a screen refuses to do
 * is exactly the kind a later session trusts without re-deriving.
 *
 * Name and time zone are editable. Address is genuinely read-only: the slug is
 * a stable identifier used in links and never reused, so there is no control to
 * offer and none is rendered. A disabled input there would imply an edit that
 * is not coming (docs/26 §10.2).
 *
 * The time zone row carries a disclosure saying the setting is recorded and
 * does not change any time on any screen yet, because nothing reads the column
 * so far. That sentence is load-bearing and goes in the change that makes the
 * screens read it, not before.
 *
 * The pane's width cap lives in `layout.tsx` — see docs/26 §6.1 for why a form
 * this short looked unfinished at 1440 without one.
 */
export default async function SettingsPage() {
  const workspace = await getActiveWorkspace()

  if (workspace === null) {
    return (
      <EmptyState
        icon={SlidersHorizontal}
        title="Nothing to configure yet"
        body="Settings belong to a workspace and you don't have one yet. Nothing failed. There is simply nothing to show until one exists."
        // MEASURED across all 19 routes on a seeded account: this was the ONE
        // no-workspace screen that named the remedy and then did not offer it.
        // /home, /posts, /planner, /wallet, /connections and /sites all put the
        // button right there; here the reader had to know to go elsewhere.
        action={<CreateWorkspaceButton variant="primary" />}
      />
    )
  }

  return (
    <Enter>
      <div className="space-y-grid">
        <SettingCard title="Workspace">
          <SettingRow
            label="Name"
            hint="What this workspace is called in the switcher."
            control={<WorkspaceNameField workspaceId={workspace.id} initialName={workspace.name} />}
          />
          <SettingRow
            label="Address"
            hint="Its stable identifier. Used in links and never reused."
            control={<span className="type-sm font-[550] text-ink">{workspace.slug}</span>}
          />
          <SettingRow
            label="Time zone"
            hint="Where this business is. Sahoda needs it to judge when your posts do best."
            control={
              <WorkspaceTimezoneField
                workspaceId={workspace.id}
                initialTimezone={workspace.timezone}
              />
            }
          >
            {/*
              THE HONEST DISCLOSURE, AND WHY IT IS NOT OPTIONAL.
              Nothing in the product reads this column yet: every time on every
              screen is rendered in IST, from 38 hardcoded sites. A setting that
              silently changes nothing is the same defect as a figure no query
              produced, so the row says what it does and what it does not do.
              Delete this line in the change that makes the screens read it,
              not before.
            */}
            <p className="type-meta text-muted">
              Sahoda still shows and schedules every time in IST. This setting is recorded and does
              not change them yet.
            </p>
          </SettingRow>
        </SettingCard>

        {/* Below the workspace rows, not above: taking a copy of everything and
            asking for deletion are things you come here to do deliberately, not
            things you should meet on the way to renaming a workspace. */}
        <YourDataPanel />
      </div>
    </Enter>
  )
}
