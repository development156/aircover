import { X } from 'lucide-react'

import { ReferenceUpload } from '@/components/studio/reference-upload'
import type { LibraryPicture } from '@/lib/studio/read'

/**
 * QUICK ADD, WITHOUT OPENING MATCH.
 *
 * A 44px tile per picked reference, plus its own compact upload tile, so a
 * SECOND picture can be added without reopening the Match panel — the
 * photograph on the phone in somebody's hand should not need a panel opened
 * first. Rendered only once at least one reference is picked: the Match
 * pill is the one door in for a FIRST picture, and this row appearing before
 * anything is picked would be the same door twice, adjacent.
 *
 * The numeral on each thumbnail is the pick ORDER, not a tick: `signReferences`
 * sends them in that order and the first weighs most.
 */
export function ComposerPickedReferences({
  picked,
  libraryPictures,
  maxReferences,
  onOpen,
  onRemove,
  onAdd,
}: {
  picked: string[]
  libraryPictures: LibraryPicture[]
  maxReferences: number
  onOpen: (picture: { assetId: string; url: string | null; title: string | null }) => void
  onRemove: (assetId: string) => void
  onAdd: (assetId: string) => void
}) {
  if (picked.length === 0) return null

  return (
    <ul className="flex flex-wrap items-center gap-2" data-guide="studio-picked">
      {picked.map((assetId, at) => {
        const picture = libraryPictures.find((one) => one.assetId === assetId) ?? null
        const named = picture?.title ?? 'this picture'
        return (
          <li key={assetId} className="relative">
            {/* ── CLICK OPENS A LARGE PREVIEW, NEVER REMOVES ────────────────────
                The X below is the one and only removal path. */}
            <button
              type="button"
              onClick={() =>
                onOpen({ assetId, url: picture?.url ?? null, title: picture?.title ?? null })
              }
              aria-label={`Open ${named} large, picked ${at + 1} of ${picked.length}`}
              className="surface-ring relative block size-[44px] overflow-hidden rounded-sm transition-micro hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {picture?.url == null ? (
                <span className="flex size-full items-center justify-center bg-s2" />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element -- a
                // short-lived signed URL from a private bucket cannot be
                // optimised without proxying the credential.
                <img src={picture.url} alt="" className="size-full object-cover object-top" />
              )}
              <span className="absolute bottom-0 left-0 flex size-[16px] items-center justify-center rounded-pill bg-primary type-sm text-primary-foreground">
                <span className="num">{at + 1}</span>
              </span>
            </button>
            <button
              type="button"
              onClick={() => onRemove(assetId)}
              aria-label={`Stop matching ${named}, picked ${at + 1} of ${picked.length}`}
              className="surface-ring absolute -right-1.5 -top-1.5 flex size-[16px] items-center justify-center rounded-full bg-surface-3 text-ink transition-micro hover:opacity-80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              <X className="size-[10px]" aria-hidden />
            </button>
          </li>
        )
      })}
      <li>
        <ReferenceUpload
          compact
          disabled={maxReferences > 0 && picked.length >= maxReferences}
          onAdded={onAdd}
        />
      </li>
      <li className="type-sm text-muted">
        <span className="num">{picked.length}</span> to match, in order
      </li>
    </ul>
  )
}
