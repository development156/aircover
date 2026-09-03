'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Download, ImageDown, Maximize2, PenLine, RotateCcw } from 'lucide-react'

import { startPostFromPicture } from '@/app/actions/studio'
import type { CanvasPicture } from '@/lib/studio/canvas'
import { canCopyImage, copyImageToClipboard } from '@/lib/studio/clipboard-image'
import { describeCopyFailure } from '@/lib/studio/refusal-copy'
import { savePicture } from '@/lib/studio/save-picture'

/**
 * EVERYTHING A PERSON DOES WITH A FINISHED PICTURE, IN ONE PLACE.
 *
 * ── ALWAYS VISIBLE, NEVER HOVER-ONLY ────────────────────────────────────────
 * A row that appears on hover does not exist for a phone, for a keyboard, or for
 * a screen reader. Half this product's users are shop owners holding a phone, so
 * a hover-revealed toolbar is a feature half of them never find.
 *
 * ── AND AN ACTION THAT CANNOT WORK IS NOT OFFERED ───────────────────────────
 * Copy is dropped when the browser will not take a picture at all rather than
 * shown and then refused, because a button that always fails teaches people to
 * distrust the row it sits in. When it is offered and fails anyway, the sentence
 * distinguishes "this browser will not" from "that did not work", since those
 * two have different remedies and only one of them is worth retrying.
 */
export function PictureActions({
  picture,
  onOpen,
  onReuse,
  onDraw,
}: {
  picture: CanvasPicture
  /** Open it large. Omitted where the picture is already open large. */
  onOpen?: () => void
  /** Load its request back into the controls, without spending anything. */
  onReuse?: () => void
  /** Mark it up. Omitted where drawing is not reachable. */
  onDraw?: () => void
}) {
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  /**
   * Decided after mount, never during render: `canCopyImage` reads `window`, and
   * a server render that guessed either way would hydrate into a mismatch. It
   * starts false, so the row is briefly one action short rather than briefly
   * offering one that cannot work.
   */
  const [canCopy, setCanCopy] = useState(false)
  useEffect(() => setCanCopy(canCopyImage()), [])

  const router = useRouter()
  const [starting, setStarting] = useState(false)

  async function save() {
    setNote(null)
    setSaving(true)
    const ok = await savePicture(picture)
    if (!ok) {
      setNote(
        'Sahoda could not save that picture to your computer just now. It is safe in your library, and trying again usually works.',
      )
    }
    setSaving(false)
  }

  async function copy() {
    setNote(null)
    const result = await copyImageToClipboard(picture.url)
    setNote(describeCopyFailure(result))
    if (result === 'copied') {
      setCopied(true)
      // Long enough to read, short enough that it does not look stuck. The same
      // two seconds the rest of this app's copy buttons use.
      window.setTimeout(() => setCopied(false), 2000)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-3" data-guide="studio-picture-actions">
        {onOpen === undefined ? null : (
          <Action onClick={onOpen} Icon={Maximize2} label="Open it large" />
        )}
        {onReuse === undefined ? null : (
          <Action onClick={onReuse} Icon={RotateCcw} label="Use these words again" />
        )}
        {onDraw === undefined ? null : (
          <Action onClick={onDraw} Icon={ImageDown} label="Draw on it" />
        )}
        {/* ── THE STEP THAT WAS LOSING PICTURES ────────────────────────────
            A picture that never becomes a post is the whole point of this
            product not happening, and the route there used to be: open the
            composer, find the library, recognise your own picture, attach it.
            Four places to stop. Only offered for a picture that still HAS a
            file, since a post cannot carry one that was deleted. */}
        <Action
          onClick={async () => {
            setNote(null)
            setStarting(true)
            const result = await startPostFromPicture(picture.assetId)
            setStarting(false)
            if (result.ok) {
              router.push(`/posts/${result.postId}`)
              return
            }
            // A draft that exists is still somewhere to go. The attach is the
            // half that failed, so the sentence travels WITH them rather than
            // stranding them here beside a post they cannot see.
            if (result.postId !== undefined) {
              setNote(result.message)
              router.push(`/posts/${result.postId}`)
              return
            }
            setNote(result.message)
          }}
          Icon={PenLine}
          label={starting ? 'Starting a post' : 'Use it in a post'}
        />
        <Action onClick={save} Icon={Download} label={saving ? 'Saving' : 'Save it'} />
        {/* Dropped entirely where the browser will not take a picture. A button
            that always fails teaches people to distrust the row it sits in. */}
        {canCopy ? (
          <Action
            onClick={copy}
            Icon={copied ? Check : Copy}
            label={copied ? 'Copied' : 'Copy the picture'}
          />
        ) : null}
      </div>

      {note === null ? null : (
        <p role="alert" className="type-sm text-ink">
          {note}
        </p>
      )}
    </div>
  )
}

function Action({
  onClick,
  Icon,
  label,
}: {
  onClick: () => void
  Icon: typeof Copy
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1 type-sm text-muted underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
    >
      <Icon className="size-[14px]" aria-hidden />
      {label}
    </button>
  )
}
