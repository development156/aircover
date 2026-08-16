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
      <PageTitle sub="Everything Sahoda knows about your business, and where it learned it.">
        Brand Brain
      </PageTitle>
      <BrainTabs />
      {children}
    </div>
  )
}
