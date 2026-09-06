import { PageTitle } from '@/components/page-title'
import { StudioWorkbench } from '@/components/studio/studio-workbench'
import { brandSignalsFor } from '@/lib/studio/brand-signals'
import { canvasPictures } from '@/lib/studio/canvas'
import { generatableFormats } from '@/lib/studio/formats'
import { readGenerations, readLibraryPictures } from '@/lib/studio/read'
import { readStoredStartersForActiveBrand } from '@/lib/studio/starters-read'
import { combineStudioStarters } from '@/lib/studio/starter-ladder'
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
  const [recent, library, signals, storedStarters] = await Promise.all([
    readGenerations(),
    readLibraryPictures(),
    // NULL is "could not read", which the composer states as its own sentence.
    // An EMPTY array means the Brand Brain has nothing to add, which is a
    // different thing and one a person can act on. `BrandSignalsSchema`'s own
    // header forbids collapsing the two, so the catch returns null and never [].
    activeWorkspaceRead().then((active) =>
      active.status === 'ok' ? brandSignalsFor(active.workspace.id).catch(() => null) : null,
    ),
    // Step 1 of the starters ladder, raced alongside the other three rather
    // than awaited afterwards — see `starters-read.ts`'s own header for why.
    // Steps 2 and 3 are pure and applied below, once every promise here has
    // settled.
    readStoredStartersForActiveBrand(),
  ])

  const starters = combineStudioStarters(storedStarters, signals)

  // ── NO BALANCE READ HERE ─────────────────────────────────────────────────
  // This page used to also read the wallet balance to print "N credits left"
  // beside the composer. The topbar's own credit pill already shows that
  // figure on every screen, and this page carried no fact the pill did not,
  // so the read (and the second sentence) left with the block that rendered
  // it — see `composer.tsx`'s own header.

  const formats = generatableFormats()
  // The price is not handed in from here any more: it depends on which model
  // the person picks, so the workbench derives it from `modelId` through the
  // same function the action prices the hold with.
  // An empty canvas on a FAILED read, deliberately. A read that failed produced
  // no pictures, and the list below is where that distinction is stated: the
  // canvas inventing a reason would be a second, vaguer answer to the same
  // question.
  const pictures = recent.status === 'ok' ? canvasPictures(recent.cards) : []

  return (
    // ── CONTENT-LED, NOT ONE CAPPED COLUMN ─────────────────────────────────
    // Redesigned: the composer is a bar capped at 820px and centred (which
    // `StudioWorkbench` does for itself), and everything else — the title,
    // "Will send", the work grid — runs the page's own width, because a grid
    // of pictures wants room and a line of text does not. This wrapper used
    // to cap the WHOLE page at the 720px composer's own width; that cap is
    // gone, and `StudioWorkbench` owns its own measure internally now.
    <div className="w-full space-y-grid">
      <PageTitle sub="Describe a picture and Sahoda draws it, using what it knows about your brand.">
        Studio
      </PageTitle>

      <StudioWorkbench
        formats={formats}
        library={library}
        pictures={pictures}
        signals={signals}
        starters={starters}
      />
    </div>
  )
}
