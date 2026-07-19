import { Globe } from 'lucide-react'

import { EmptyState } from '@/components/empty-state'
import { PageTitle } from '@/components/page-title'

export const metadata = { title: 'Sites' }

/**
 * Sites — MOUNT POINT ONLY, deliberately.
 *
 * This route exists so the seeded Guide tour that navigates to `/sites` stops
 * landing on a 404. There is nothing behind it on purpose: `packages/sites` is
 * wt-pub's, actively being built, and it defines the `SiteStore` / `Deployer`
 * ports apps/web is meant to mount. Building a generator or a section renderer
 * here would collide with those ports at integration.
 *
 * The deploy half is not merely unbuilt, it is UNOWNED — no lane in the roadmap
 * carries it, and there is no Cloudflare client or wrangler config anywhere in
 * the repo. So a site could be generated but never actually published, and
 * writing `status = 'published'` off the back of that would be precisely the
 * fabricated success state the honesty rule forbids.
 *
 * Note on the tour anchor: this page deliberately does NOT carry
 * `data-guide="sites.generate"`. There is no generate button, and hanging that
 * anchor on a placeholder would make the tour step appear to work over a feature
 * that does not exist. A missing anchor auto-skips (FSD M14), which is the
 * honest behaviour until the real control lands.
 */
export default function SitesPage() {
  return (
    <div className="space-y-grid">
      <PageTitle>Sites</PageTitle>
      <EmptyState
        icon={Globe}
        title="Sites aren't building yet"
        body="Generating a site and publishing it to a real address are still being built. I'd rather show you nothing here than a page that can't go live."
        tip="Your posts and wallet are ready to use in the meantime."
      />
    </div>
  )
}
