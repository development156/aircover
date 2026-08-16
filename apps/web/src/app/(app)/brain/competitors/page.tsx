import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Competitors' }

export default function BrainCompetitorsPage() {
  return (
    <ComingSoon
      feature="Radar"
      summary="Watch what the businesses beside you are posting, and what is working for them."
      includes={[
        'Tracked competitors',
        'What they posted',
        'What got engagement',
        'Gaps you could take',
      ]}
    />
  )
}
