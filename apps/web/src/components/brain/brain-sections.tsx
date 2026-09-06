import { BrainCircuit } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { CreateWorkspaceButton } from '@/components/workspace/create-workspace-button'
import { SectionCard } from '@/components/brain/section-card'
import { SectionCardEmpty } from '@/components/brain/section-card-empty'
import { BRAIN_SECTIONS, type BrainSectionKey } from '@/lib/brand/fields'
import { readBrain } from '@/lib/brand/read-brain'

/**
 * Renders a chosen subset of the Brand Brain's sections.
 *
 * Every /brain tab that shows real fields goes through here, so the read, the
 * four not-ready branches and the card grid are written once. Before the tabs
 * existed, `page.tsx` carried all of that inline and the five sections were a
 * flat grid with nothing to say which was which.
 *
 * `only` is a whitelist rather than a filter predicate on purpose: a tab shows
 * exactly the sections it names, so adding a section to `BRAIN_SECTIONS` cannot
 * silently make it appear on a tab nobody chose it for.
 */
export async function BrainSections({ only }: { only: readonly BrainSectionKey[] }) {
  const brain = await readBrain()

  const sections = BRAIN_SECTIONS.filter((section) => only.includes(section.key))

  // No workspace means there is nowhere for a brain to live and nothing on this
  // screen can change that, so the structure would be decoration. The ONE remedy
  // is creating a workspace, so that is the control offered. This branch used
  // to say "until the Brand Brain has been resolved once" with nothing under it:
  // a resolve needs a workspace, so the sentence named a remedy that could not
  // work — the same status /brain and the console both answer with this button.
  if (brain.status === 'no-workspace') {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Create a workspace to build a Brand Brain"
        body="These fields are what Sahoda writes your captions, your weekly plan and your website from. A Brand Brain belongs to a workspace and you don’t have one yet. Nothing failed."
        action={<CreateWorkspaceButton variant="primary" />}
      />
    )
  }

  // NO BRAIN, BUT A WORKSPACE. The sections still render — empty, labelled, and
  // claiming nothing. Replacing them with a single sentence, as this branch used
  // to, deleted the one thing a new user is actually asking: what does a Brand
  // Brain hold? The line below still says nothing has been resolved; it just no
  // longer stands in place of the structure.
  if (brain.status === 'no-brain') {
    return (
      <div className="space-y-grid">
        <p className="text-[13px] text-muted">
          Nothing has been resolved yet. These are the fields Sahoda writes your captions, your
          weekly plan and your website from.
        </p>
        <div className="grid gap-grid wide:grid-cols-2">
          {sections.map((section) => (
            <SectionCardEmpty key={section.key} section={section} />
          ))}
        </div>
      </div>
    )
  }

  if (brain.status === 'unreadable') {
    return (
      <div role="alert" className="rounded-input bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
        Could not read your Brand Brain just now. Reload to try again. Nothing has changed and
        nothing was charged.
      </div>
    )
  }

  return (
    <div className="grid gap-grid wide:grid-cols-2">
      {sections.map((section) => (
        <SectionCard
          key={section.key}
          section={section}
          brain={brain.active}
          provenance={brain.provenance}
        />
      ))}
    </div>
  )
}
