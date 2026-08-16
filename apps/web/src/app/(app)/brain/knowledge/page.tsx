import { ComingSoon } from '@/components/coming-soon'

export const metadata = { title: 'Knowledge' }

export default function BrainKnowledgePage() {
  return (
    <ComingSoon
      feature="Knowledge Library"
      summary="Give Sahoda the documents it should quote from — menus, price lists, policies, FAQs."
      includes={[
        'Upload documents',
        'Cited in generated posts',
        'Kept current',
        'Per-workspace, never shared',
      ]}
    />
  )
}
