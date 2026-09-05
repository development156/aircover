import Link from 'next/link'
import { notFound } from 'next/navigation'

import { Unreadable } from '@/components/design-system/absence-row'
import { ViewerScreen } from '@/components/studio/viewer-screen'
import { brandSignalsFor } from '@/lib/studio/brand-signals'
import { generatableFormats } from '@/lib/studio/formats'
import { readLibraryPictures } from '@/lib/studio/read'
import { initialValuesFromGeneration } from '@/lib/studio/viewer-initial-values'
import { readPictureForViewer } from '@/lib/studio/viewer-read'
import { activeWorkspaceRead } from '@/lib/workspaces'

export const metadata = { title: 'A picture' }

/**
 * `/studio/<id>`. ONE PICTURE, ITS OWN SCREEN.
 *
 * ── ONLY A CONFIRMED ABSENCE IS A 404 ────────────────────────────────────────
 * `readPictureForViewer` scopes both its reads by this workspace's own id, so
 * a picture that belongs to another workspace and one that was never written
 * come back as the identical `not-found` — telling them apart would confirm to
 * somebody that an id they guessed names a real picture, just not theirs. A
 * READ FAILURE is a different fact and never becomes a 404: `notFound()` tells
 * a customer the picture is gone, and a transient error is not that.
 */
export default async function StudioViewerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const read = await readPictureForViewer(id)

  if (read.status === 'not-found') notFound()

  if (read.status === 'unreadable') {
    return (
      <div className="space-y-grid">
        <Link
          href="/studio"
          className="type-sm font-[550] text-muted underline underline-offset-2 hover:text-ink"
        >
          Back to your work
        </Link>
        <section className="surface-ring flex flex-col items-center gap-2 rounded-card bg-surface px-5 py-10 text-center">
          <Unreadable what="This picture" />
          <h1 className="type-h3 mt-1">Sahoda could not read this picture</h1>
          <p className="type-body max-w-[42ch] text-muted">
            It did not come back this time. Reload. The picture has not gone anywhere.
          </p>
        </section>
      </div>
    )
  }

  const { picture, generation, lineage, versions } = read

  // In parallel: the composer's own reads, exactly as `/studio` fetches them.
  // No wallet read here for the same reason `/studio` dropped its own: the
  // topbar's credit pill already carries that figure, so a second read just
  // to print it again beside the composer would be a second copy of the same
  // fact — see `composer.tsx`'s own header.
  const [formats, library, signals] = await Promise.all([
    Promise.resolve(generatableFormats()),
    readLibraryPictures(),
    activeWorkspaceRead().then((active) =>
      active.status === 'ok' ? brandSignalsFor(active.workspace.id).catch(() => null) : null,
    ),
  ])

  const initialValues = initialValuesFromGeneration(generation, lineage)
  const remixLocked = !lineage.columnsApplied

  return (
    <ViewerScreen
      picture={picture}
      modelId={generation.model_id}
      referenceAssetIds={generation.reference_asset_ids}
      versions={versions}
      formats={formats}
      library={library}
      signals={signals}
      initialValues={initialValues}
      sourceGenerationId={generation.id}
      remixLocked={remixLocked}
    />
  )
}
