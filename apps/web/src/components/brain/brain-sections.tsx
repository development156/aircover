import { BrainCircuit } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { SectionCard } from '@/components/brain/section-card'
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

  if (brain.status === 'no-workspace' || brain.status === 'no-brain') {
    return (
      <EmptyState
        icon={BrainCircuit}
        title="Sahoda doesn’t know your brand yet"
        body="These fields are what every caption, campaign and reply is written from. There is nothing to show until the Brand Brain has been resolved once."
      />
    )
  }

  if (brain.status === 'unreadable') {
    return (
      <div role="alert" className="rounded-input bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
        Could not read your Brand Brain just now — reload to try again. Nothing has changed and
        nothing was charged.
      </div>
    )
  }

  const sections = BRAIN_SECTIONS.filter((section) => only.includes(section.key))

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
