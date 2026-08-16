import { ComingSoon } from '@/components/coming-soon'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Approvals' }

/**
 * Planned, not built. Deliberately absent from the rail: nine live nav items
 * plus three dead ones reads as an unfinished product, so the route exists and
 * works while promotion to the menu stays an owner decision.
 */
export default function ApprovalsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Approvals</PageTitle>
      <ComingSoon
        feature="Approvals"
        summary="Review everything waiting on you in one queue, instead of hunting through Posts."
        includes={[
          'One queue across channels',
          'Bulk approve',
          'Why Sahoda suggested it',
          'Reject with a reason',
        ]}
      />
    </div>
  )
}
