import { MESH_TASK_ACTION, creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import { RecentGenerations } from '@/components/studio/recent-generations'
import { generatableFormats } from '@/lib/studio/formats'
import { readGenerations, readLibraryPictures } from '@/lib/studio/read'

export const metadata = { title: 'Studio' }

/**
 * THE STUDIO. WHERE PICTURES COME FROM.
 *
 * Not a design canvas. The generative layer: a person says what they want, the
 * Studio adds who they are, and a model draws it. The words that go ON a picture
 * are a separate deterministic layer and are not built yet.
 *
 * ── WHAT THE READER LEARNS HERE, IN ORDER ───────────────────────────────────
 * Why this exists, what it costs before anything is spent, and what makes their
 * pictures theirs rather than generic. The last of those is the whole point of
 * the product and is easy to leave implicit: a person who does not know their
 * Brand Brain feeds this screen will never go and fill it in, and will get
 * ordinary pictures forever while believing that is all Sahoda can do.
 */
export default async function StudioPage() {
  // In parallel, deliberately. Sequentially the picker would wait on the
  // gallery and the screen would take twice as long to draw for no reason.
  const [recent, library] = await Promise.all([readGenerations(), readLibraryPictures()])

  const formats = generatableFormats()
  const cost = creditCost(MESH_TASK_ACTION.image_generate)

  return (
    <div className="space-y-grid">
      <PageTitle sub="Describe a picture and Sahoda draws it, using what it knows about your brand.">
        Studio
      </PageTitle>

      <StudioWorkbench formats={formats} cost={cost} library={library} />

      <RecentGenerations read={recent} />
    </div>
  )
}
