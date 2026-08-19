import { AdsTabs } from '@/components/ads/ads-tabs'
import { PageTitle } from '@/components/page-title'
import { RoadmapBanner } from '@/components/roadmap/inert'

/**
 * Wraps every Ads screen.
 *
 * ── THE CLAIM IS MADE ONCE, AT THE TOP, BEFORE ANYTHING BELOW IT ─────────────
 * The banner sits in the LAYOUT rather than in each page, so it cannot be
 * forgotten on the sixth screen someone adds — and so it is the first thing read
 * on every one of the five. Every card under it is a picture; this is the
 * caption for all of them.
 *
 * The title lives here for the same reason `BrainLayout` holds its own: five
 * pages each rendering their own heading is five headings that drift.
 */
export default function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-grid">
      <PageTitle sub="Paid campaigns on Meta and Google, planned in the same place as your posts.">
        Ads
      </PageTitle>
      <AdsTabs />
      <RoadmapBanner what="Ads will put paid spend next to the posts it supports, under one goal and one report." />
      {children}
    </div>
  )
}
