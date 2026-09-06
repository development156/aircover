import { CopyButton } from '@/components/admin/copy-button'
import type { LibraryPicture } from '@/lib/studio/read'

/**
 * THE WORDS THAT MADE THIS PICTURE, AND WHAT THEY MATCHED.
 *
 * The prompt shown is `prompt_given`: what the person typed, never
 * `prompt_sent`, which also carries whatever the Brand Brain added. A remix
 * that started from the brand-conditioned sentence would compound it every
 * time somebody pressed Draw again.
 *
 * Reference thumbnails are resolved against the SAME bounded, recent library
 * read the composer's own picker uses (`readLibraryPictures`, 12 pictures).
 * An id outside that window still counts in "Matched N pictures" — that
 * number comes from what was actually recorded — but renders no thumbnail of
 * its own rather than a blank standing in for one Sahoda cannot show.
 */
export function ViewerPromptPanel({
  prompt,
  referenceAssetIds,
  libraryPictures,
}: {
  prompt: string
  referenceAssetIds: string[]
  libraryPictures: LibraryPicture[]
}) {
  const thumbnails = referenceAssetIds
    .map((id) => libraryPictures.find((one) => one.assetId === id) ?? null)
    .filter((one): one is LibraryPicture => one !== null && one.url !== null)

  return (
    <div className="flex flex-col gap-2" data-guide="studio-viewer-prompt">
      <span className="type-eyebrow text-muted">Prompt</span>
      <div className="flex gap-2.5">
        {thumbnails.length === 0 ? null : (
          <ul className="flex shrink-0 flex-col gap-1.5">
            {thumbnails.slice(0, 1).map((picture) => (
              <li
                key={picture.assetId}
                className="surface-ring size-[56px] overflow-hidden rounded-card"
              >
                {/* eslint-disable-next-line @next/next/no-img-element -- a
                    short-lived signed URL from a private bucket cannot be
                    optimised by next/image without proxying the credential. */}
                <img
                  src={picture.url ?? undefined}
                  alt=""
                  className="size-full object-cover object-top"
                />
              </li>
            ))}
          </ul>
        )}
        <p className="type-sm text-ink">{prompt}</p>
      </div>
      <div className="flex items-center gap-2.5">
        <CopyButton text={() => prompt} label="Copy" />
        {referenceAssetIds.length === 0 ? null : (
          <span className="type-sm text-muted">
            Matched <span className="num">{referenceAssetIds.length}</span>{' '}
            {referenceAssetIds.length === 1 ? 'picture' : 'pictures'}
          </span>
        )}
      </div>
    </div>
  )
}
