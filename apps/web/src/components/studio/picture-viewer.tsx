'use client'

import { useState } from 'react'
import { Download } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'
import { downloadName, type CanvasPicture } from '@/lib/studio/canvas'

/**
 * ONE PICTURE, AS LARGE AS THE SCREEN ALLOWS, WITH A WAY TO KEEP IT.
 *
 * ── ON THE NATIVE DIALOG, DELIBERATELY ──────────────────────────────────────
 * `ui/modal.tsx` is built on `<dialog showModal()>`, which puts the panel in the
 * browser's TOP LAYER. That matters here beyond focus trapping: this app has a
 * standing trap where a `backdrop-filter` ancestor becomes the containing block
 * for `position: fixed`, so a hand-rolled overlay can silently lay out as a
 * strip instead of the viewport (apps/web/CLAUDE.md). The top layer has no
 * containing block to be captured by, so this cannot happen to it.
 *
 * ── WHY THE DOWNLOAD FETCHES BYTES INSTEAD OF LINKING ───────────────────────
 * The href is a short-lived signed URL on the storage host, and `<a download>`
 * is IGNORED cross-origin: the browser navigates to the picture instead of
 * saving it, which loses the person their screen and gives them no file. So the
 * bytes are fetched, wrapped in an object URL on this origin, and saved under a
 * name they will recognise later.
 *
 * A fetch that fails says so and offers the one remedy that works. It does NOT
 * silently fall back to opening the picture in a tab, because somebody who
 * pressed Save and got a new tab has to work out for themselves that nothing
 * was saved.
 */
export function PictureViewer({
  picture,
  onClose,
}: {
  picture: CanvasPicture | null
  onClose: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [failed, setFailed] = useState(false)

  async function save() {
    if (picture === null) return
    setFailed(false)
    setSaving(true)
    let objectUrl: string | null = null
    try {
      const response = await fetch(picture.url)
      if (!response.ok) throw new Error('FETCH_FAILED')
      const blob = await response.blob()
      objectUrl = URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = objectUrl
      link.download = downloadName(picture)
      document.body.appendChild(link)
      link.click()
      link.remove()
    } catch {
      setFailed(true)
    } finally {
      // Revoked either way. An object URL that is never revoked holds the whole
      // picture in memory for as long as the tab lives.
      if (objectUrl !== null) URL.revokeObjectURL(objectUrl)
      setSaving(false)
    }
  }

  return (
    <Modal
      open={picture !== null}
      onClose={onClose}
      title={picture === null ? 'Your picture' : picture.prompt}
      className="w-[min(96vw,1100px)]"
    >
      {picture === null ? null : (
        <div className="flex flex-col gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived
              signed URL from a private bucket cannot be optimised by next/image
              without proxying the credential. */}
          <img
            src={picture.url}
            alt={picture.prompt}
            width={picture.width ?? undefined}
            height={picture.height ?? undefined}
            className="surface-ring max-h-[68vh] w-full rounded-card bg-s2 object-contain"
          />

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={save} loading={saving} data-guide="studio-download">
              <Download className="size-[15px]" aria-hidden />
              Save to your computer
            </Button>
            {picture.width === null || picture.height === null ? null : (
              <span className="type-sm text-muted">
                <span className="num">{picture.width}</span> by{' '}
                <span className="num">{picture.height}</span> pixels
              </span>
            )}
          </div>

          {failed ? (
            <p role="alert" className="type-sm text-ink">
              Sahoda could not save this picture just now. The picture is safe in your library, and
              reopening this screen gives the link another try.
            </p>
          ) : null}
        </div>
      )}
    </Modal>
  )
}
