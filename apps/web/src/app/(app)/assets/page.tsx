import { ComingSoon } from '@/components/coming-soon'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Assets' }

/**
 * Planned, not built. Deliberately absent from the rail: nine live nav items
 * plus three dead ones reads as an unfinished product, so the route exists and
 * works while promotion to the menu stays an owner decision.
 */
export default function AssetsPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Assets</PageTitle>
      <ComingSoon
        feature="Asset Library"
        summary="Keep the images, logos and clips Sahoda reuses when it writes and designs for you."
        includes={[
          'Uploads and folders',
          'Reuse across posts',
          'Brand-safe filtering',
          'Usage history',
        ]}
      />
    </div>
  )
}
