'use client'

import { useState } from 'react'
import Link from 'next/link'

import { Button } from '@/components/ui/button'
import type { PhotoListRead } from '@/lib/studio/read'

/**
 * CHOOSING A PICTURE FOR A SLOT.
 *
 * ── FOUR NOTHINGS, AND EACH GETS ITS OWN SENTENCE ───────────────────────────
 * A library that failed to read is not an empty library, and neither is an
 * account with no workspace. Showing "you have no pictures" for a failed read
 * tells somebody to go and upload photos they already have, which is the
 * impossible remedy `no-impossible-remedy.spec.ts` exists to forbid. So the
 * four states are separate and only one of them offers the upload link.
 *
 * ── THE THUMBNAIL IS A SIGNED URL AND THE DESIGN IS NOT ─────────────────────
 * What gets stored is the asset ID. This grid uses short-lived signed URLs
 * because it is ordinary HTML; the renderer never sees one, and a picture whose
 * URL failed to sign is still listed and still choosable, because choosing it
 * reads bytes rather than this address.
 */
export function PhotoPicker({
  read,
  chosen,
  onChoose,
  onClear,
  busy,
}: {
  read: PhotoListRead
  /** The asset this slot currently holds, so the grid can say which one is in use. */
  chosen: string | null
  onChoose: (assetId: string) => void
  onClear: () => void
  busy: boolean
}) {
  const [open, setOpen] = useState(false)

  const chosenPhoto =
    read.status === 'ok' && chosen !== null
      ? (read.photos.find((photo) => photo.id === chosen) ?? null)
      : null

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="secondary"
          onClick={() => setOpen((current) => !current)}
          disabled={busy}
          aria-expanded={open}
          data-guide="studio-photo-picker"
        >
          {chosen === null ? 'Choose a picture' : 'Change the picture'}
        </Button>
        {chosen === null ? null : (
          <Button type="button" variant="ghost" onClick={onClear} disabled={busy}>
            Remove it
          </Button>
        )}
        {/* Named when we can name it. A chosen picture whose row is not in this
            list is still in the design, so the state says "chosen" rather than
            claiming a name nobody read. */}
        {chosen === null ? null : (
          <span className="type-sm text-muted">
            {chosenPhoto?.title ?? 'A picture from your library'}
          </span>
        )}
      </div>

      {!open ? null : read.status === 'no-workspace' ? (
        <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          Pictures belong to a workspace, and this account is not in one.
        </p>
      ) : read.status === 'unreadable' ? (
        <p role="alert" className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          Sahoda could not read your library just now, so this is not a reading of what you have.
          Reload the page to try again.
        </p>
      ) : read.photos.length === 0 ? (
        <p className="surface-ring rounded-card bg-s2 px-3 py-3 type-sm text-muted">
          There are no pictures in your library yet.{' '}
          <Link
            href="/assets"
            className="underline transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            Add one
          </Link>{' '}
          and it appears here.
        </p>
      ) : (
        <ul className="grid grid-cols-3 gap-2 wide:grid-cols-4">
          {read.photos.map((photo) => {
            const isChosen = photo.id === chosen
            return (
              <li key={photo.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChoose(photo.id)
                    setOpen(false)
                  }}
                  disabled={busy}
                  aria-pressed={isChosen}
                  className={`surface-ring block w-full overflow-hidden rounded-sm bg-s2 transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                    isChosen ? 'outline-2 outline-offset-2 outline-accent' : 'hover:opacity-90'
                  }`}
                  style={{ aspectRatio: '1 / 1' }}
                >
                  {photo.url === null ? (
                    // The file is there and choosing it works. Only the preview
                    // is missing, and it says that rather than looking broken.
                    <span className="flex h-full items-center justify-center px-1 type-sm text-muted">
                      No preview
                    </span>
                  ) : (
                    // eslint-disable-next-line @next/next/no-img-element -- a signed
                    // URL from a private bucket, which the image optimiser cannot
                    // fetch and would 500 on.
                    <img
                      src={photo.url}
                      alt={photo.title ?? 'A picture in your library'}
                      className="size-full object-cover"
                    />
                  )}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
