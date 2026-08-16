import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Audience' }

export default function BrainAudiencePage() {
  return (
    <ComingSoon
      feature="Audience Twin"
      summary="Build a working model of who you sell to, so every post is written for a real person rather than an average."
      includes={[
        'Segments from your own customers',
        'What each segment responds to',
        'Objections to answer',
        'Tone per segment',
      ]}
    />
  )
}
