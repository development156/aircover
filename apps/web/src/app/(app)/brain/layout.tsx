import { BrainMapFrame } from '@/components/brain/brain-map-frame'
import { BrainTabs } from '@/components/brain/brain-tabs'
import { PageTitle } from '@/components/page-title'

/**
 * Wraps every Brand Brain section.
 *
 * The title lives here rather than in the pages because `page.tsx` returns it
 * from four separate branches (no-workspace, no-brain, unreadable, and the real
 * one) and a heading repeated four times drifts on the fifth. One owner.
 */
export default function BrainLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-grid">
      {/* The compact map rides the title row on EVERY brain screen, because the
          answers happen on the tabs and the picture has to be where the press is.
          The layout re-renders after each write, so the node lights here. */}
      <PageTitle
        sub="Everything Sahoda knows about your business, and where it learned it."
        actions={<BrainMapFrame />}
      >
        Brand Brain
      </PageTitle>
      <BrainTabs />
      {children}
    </div>
  )
}
