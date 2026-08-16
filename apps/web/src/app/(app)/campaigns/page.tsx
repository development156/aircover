import { ComingSoon } from '@/components/coming-soon'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Campaigns' }

/**
 * Planned, not built. Deliberately absent from the rail: nine live nav items
 * plus three dead ones reads as an unfinished product, so the route exists and
 * works while promotion to the menu stays an owner decision.
 */
export default function CampaignsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Campaigns</PageTitle>
      <ComingSoon
        feature="Campaigns"
        summary="Group posts into a run with one goal, one budget and one report."
        includes={[
          'Multi-post runs',
          'Shared goal and budget',
          'One report per campaign',
          'Channel mix',
        ]}
      />
    </div>
  )
}
