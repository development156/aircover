import { MESH_TASK_ACTION, creditCost } from '@sahoda/shared'

import { PageTitle } from '@/components/page-title'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import { RecentGenerations } from '@/components/studio/recent-generations'
import { brandSignalsFor } from '@/lib/studio/brand-signals'
import { canvasPictures } from '@/lib/studio/canvas'
import { generatableFormats } from '@/lib/studio/formats'
import { readGenerations, readLibraryPictures } from '@/lib/studio/read'
import { readBalance } from '@/lib/wallet/read'
import { activeWorkspaceRead } from '@/lib/workspaces'

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
  /**
   * ── ALL THREE IN PARALLEL, INCLUDING THE ONE THAT NEEDS A WORKSPACE ───────
   * The signals read DEPENDS on the workspace, so the obvious shape is to await
   * the workspace and then await the signals — and that is a second round trip
   * this screen waits on before it paints anything. `read-waterfall.test.ts`
   * refused exactly that, correctly: the Studio's first paint is where a person
   * decides whether to spend, which is why the canvas editor is already lazy.
   *
   * The dependency lives INSIDE the parallel arm instead, so the signals query
   * races the other two rather than following them. `activeWorkspaceRead` is
   * `cache()`d, so the workspace itself is read once for the whole request no
   * matter how many readers ask.
   */
  const [recent, library, signals, wallet] = await Promise.all([
    readGenerations(),
    readLibraryPictures(),
    // NULL is "could not read", which the composer states as its own sentence.
    // An EMPTY array means the Brand Brain has nothing to add, which is a
    // different thing and one a person can act on. `BrandSignalsSchema`'s own
    // header forbids collapsing the two, so the catch returns null and never [].
    activeWorkspaceRead().then((active) =>
      active.status === 'ok' ? brandSignalsFor(active.workspace.id).catch(() => null) : null,
    ),
    // In the same parallel arm as everything else, for the reason above.
    readBalance(),
  ])

  /**
   * ── THE BALANCE IS SHOWN ONLY WHEN IT WAS READ ────────────────────────────
   * `readBalance` answers three ways and only one of them is a number. Neither
   * of the others may become one here: rendering "0 credits left" for a read
   * that FAILED would tell somebody with a full wallet they cannot afford to
   * work, which is the exact defect that union exists to prevent.
   *
   * Null renders as nothing at all rather than as a diagnosis. This readout is
   * a convenience beside the page title; the wallet screen owns the sentence
   * for a failed read, and the refusal copy owns the one for a shortfall at the
   * moment of spending. A header that announced an error would be a third voice
   * on a question the other two already answer better.
   */
  const balance = wallet.status === 'ok' ? wallet.balance.available : null

  const formats = generatableFormats()
  const cost = creditCost(MESH_TASK_ACTION.image_generate)
  // An empty canvas on a FAILED read, deliberately. A read that failed produced
  // no pictures, and the list below is where that distinction is stated: the
  // canvas inventing a reason would be a second, vaguer answer to the same
  // question.
  const pictures = recent.status === 'ok' ? canvasPictures(recent.cards) : []

  return (
    <div className="space-y-grid">
      <PageTitle sub="Describe a picture and Sahoda draws it, using what it knows about your brand.">
        Studio
      </PageTitle>

      <StudioWorkbench
        formats={formats}
        cost={cost}
        library={library}
        pictures={pictures}
        signals={signals}
        balance={balance}
      />

      <RecentGenerations read={recent} />
    </div>
  )
}
