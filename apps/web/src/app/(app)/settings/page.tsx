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
 * The time zone row's disclosure used to say the setting was recorded and
 * changed nothing, because nothing read the column. That stopped being true when
 * Posts and the Planner began rendering scheduled times in it, and the sentence
 * was rewritten in that same change rather than left to rot. What it says now is
 * narrower and still exact: those two screens follow this zone, the time PICKER
 * does not, and the timestamps on other screens do not.
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
              This setting now reaches two screens and not the rest: Posts and
              the Planner render scheduled times in it, the picker still builds
              times on the reader's own device clock, and the other files that
              name a zone still name IST. A setting that silently does less than
              a reader would assume is the same defect as one that does nothing,
              so the row states its reach rather than implying all of it. Narrow
              this line as the remaining screens are moved, never widen it first.

              THE WEEK GRID IS NAMED SEPARATELY because it is the one part of the
              Planner this does not reach. `week-window.ts` places every card by
              `PLANNER_GRID_ZONE`, so a card's column and row are IST facts; its
              caption was briefly rendered in the workspace zone instead, which
              drew a New York post in the wrong column under the right time. The
              caption now matches the grid, and this sentence says so rather than
              letting "the Planner" imply the grid moved too.
            */}
            <p className="type-meta text-muted">
              Posts and Planner show your scheduled times in this zone. The Planner's week grid is
              still laid out in IST, choosing a time still follows your own device clock, and other
              timestamps in Sahoda are shown in IST.
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
