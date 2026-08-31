'use client'

import { useRef, useState, useTransition } from 'react'
import { ImagePlus } from 'lucide-react'

import { uploadAsset } from '@/app/actions/assets'
import { describeUploadRefusal, uploadAccept } from '@/lib/studio/upload'

/**
 * ADD A PICTURE FROM THIS DEVICE, AND USE IT STRAIGHT AWAY.
 *
 * ── THE HOLE THIS FILLS ─────────────────────────────────────────────────────
 * "Match this picture" only worked on pictures already in the library, so the
 * photograph on the phone in somebody's hand could not start a generation. They
 * had to leave the Studio, find the library, upload, come back, and hope the
 * right thing was at the top. Most people do not come back.
 *
 * ── THE INPUT IS THE CONTROL, THE DROP IS THE SHORTCUT ──────────────────────
 * A real `<input type="file">` inside a real `<label>` is what makes this work
 * with a keyboard, with a screen reader, and on a phone where there is nothing
 * to drag FROM. The drop target is an addition for people with a mouse and a
 * window, never the only way in.
 *
 * ── AND THE NEW PICTURE IS SELECTED FOR YOU ─────────────────────────────────
 * Somebody who adds a picture to match wants to match it. Handing back the id
 * and leaving them to find it in the grid is the same trip through the library
 * they came here to avoid.
 */
export function ReferenceUpload({
  onAdded,
  disabled,
}: {
  /** Called with the stored asset's id, so the caller can select it at once. */
  onAdded: (assetId: string) => void
  /** True when the mode already holds as many references as it can use. */
  disabled: boolean
}) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, start] = useTransition()

  function take(files: FileList | null) {
    setNote(null)
    const file = files?.[0]
    if (!file) return

    // Checked before the bytes leave the device, so nobody waits through the
    // upload of a file that was never going to be accepted. It is a courtesy,
    // not the guard: the server refuses on bytes it has PROVEN.
    const refusal = describeUploadRefusal({ type: file.type, size: file.size })
    if (refusal !== null) {
      setNote(refusal)
      return
    }

    start(async () => {
      const body = new FormData()
      body.set('file', file)
      const result = await uploadAsset(body)
      if (result.ok) {
        onAdded(result.asset.id)
        return
      }
      setNote(result.message)
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <label
        onDragOver={(event) => {
          if (disabled) return
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          if (disabled) return
          take(event.dataTransfer.files)
        }}
        className={`surface-ring flex cursor-pointer items-center justify-center gap-2 rounded-card px-3 py-3 type-sm transition-micro focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
          over ? 'bg-tint-50 text-ink dark:bg-s2' : 'bg-s2 text-muted'
        } ${disabled ? 'opacity-60' : ''}`}
        data-guide="studio-upload"
      >
        <ImagePlus className="size-[16px]" aria-hidden />
        <span>{busy ? 'Adding your picture' : 'Add a picture from this device'}</span>
        <input
          ref={input}
          type="file"
          accept={uploadAccept()}
          className="sr-only"
          // Disabled rather than hidden: the control still reads to a screen
          // reader, and its state explains why nothing happens, where a missing
          // control would just be missing.
          disabled={disabled || busy}
          onChange={(event) => {
            take(event.target.files)
            // Cleared so choosing the SAME file twice fires again. Without this,
            // a person whose first attempt failed presses the control, picks the
            // same photograph, and nothing at all happens.
            event.target.value = ''
          }}
        />
      </label>

      {note === null ? null : (
        <p role="alert" className="type-sm text-ink">
          {note}
        </p>
      )}
    </div>
  )
}
