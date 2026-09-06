'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import type { ChannelSet } from '@sahoda/shared'

import { acceptCropForUpload } from '@/app/actions/posts-crop'
import { attachMedia } from '@/app/actions/posts-media'
import { CropOfferDialog } from '@/components/media/crop-offer-dialog'
import type { FocalPoint } from '@/lib/media/crop-geometry'
import { NO_OFFER_COPY } from '@/lib/media/offer-state'
import type { AcceptCropState } from '@/lib/media/crop-state'
import type { AttachMediaState } from '@/lib/posts/media-state'
import {
  MEDIA_UPLOAD_CAP_BYTES,
  MEDIA_UPLOAD_TOO_LARGE,
  uploadTransportRefusal,
} from '@/lib/posts/media-constants'
import { cn } from '@/lib/utils'

import { ChannelObjections } from './channel-objections'
import { acceptForChannels, capMbForChannels } from './media-accept'

export interface MediaAttachProps {
  postId: string
  /** The post's selected channels — drives `accept` and the outcome copy. */
  channels: ChannelSet
}

/**
 * Attach one image to this post.
 *
 * The control is a real `<input type="file">`, visually hidden but still the
 * only tab stop, with a `<label>` styled as the button — so the accessible name
 * and the focus ring both belong to the thing that actually opens the dialog.
 * A `<button>` that click()s a hidden input would leave the input as a second,
 * invisible tab stop.
 *
 * `accept` is read from the Constraint Engine (see `media-accept.ts`) and is a
 * hint only. Nothing here is a check: `File.type` is whatever the browser was
 * told to say and the size is trivially spoofable, so the server sniffs the
 * bytes and makes the decision. This component only reports it.
 *
 * The one exception is the size CAP, read here before the action is called.
 * Not as a check the server relies on, but because a file over it never
 * reaches the server: the platform answers 413 at the edge and the awaited
 * action throws (see `asset-upload.tsx`, where it took the whole screen). The
 * action calls are wrapped for the same reason.
 *
 * Attaching spends NO credits — it stores a file and runs the engine, neither
 * of which touches the ledger — so no cost is quoted, only the size ceiling.
 */
export function MediaAttach({ postId, channels }: MediaAttachProps) {
  const router = useRouter()
  const [result, setResult] = useState<AttachMediaState | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  /**
   * The File the refusal was about, kept so accepting a crop can send the same
   * bytes back. It is NOT in storage: the attach refused before uploading, which
   * is exactly the behaviour the offer must not change.
   */
  const pickedRef = useRef<File | null>(null)
  const [cropOpen, setCropOpen] = useState(false)
  const [cropError, setCropError] = useState<string | null>(null)
  /**
   * The outcome of an ACCEPTED crop, kept apart from `result`.
   *
   * An earlier version pushed it into `result` as a synthetic success and had to
   * invent a `PostMedia` row to satisfy the type — a value that does not exist,
   * waiting for the first reader of `result.media`. A crop is its own outcome
   * with its own sentence ("the original is in your library"), so it gets its own
   * field.
   */
  const [cropped, setCropped] = useState<AcceptCropState | null>(null)
  // A blob URL for the picked file, so the preview draws the real photograph
  // without anything having been uploaded. Revoked when it is replaced.
  const [localSrc, setLocalSrc] = useState<string | null>(null)
  // Set only while an attach this control started is in flight.
  const reclaimFocus = useRef(false)
  const inputId = useId()
  const limitsId = useId()

  // A verdict is about the channel set it was decided against. Once that set
  // changes the verdict is no longer a fact about this post: "every channel on
  // this post accepts it" would keep asserting a clearance that was never
  // granted for the channel just added — while the pane's own violation alert
  // below it says the opposite. Dropped on change rather than reworded, because
  // the only honest verdict for the new set is the one nobody has asked for yet.
  const channelKey = [...channels].sort().join(',')
  const [verdictChannels, setVerdictChannels] = useState(channelKey)
  if (verdictChannels !== channelKey) {
    setVerdictChannels(channelKey)
    if (result !== null) setResult(null)
  }

  /**
   * Disabling a focused element blurs it, so going pending drops the caret to
   * <body> and a keyboard user restarts from the top of the page — the same
   * failure the remove control guards against. Focus is handed back only if the
   * disable is what orphaned it; if the writer moved on during the upload,
   * whatever they moved to keeps it.
   */
  useEffect(() => {
    if (pending || !reclaimFocus.current) return
    reclaimFocus.current = false
    const active = document.activeElement
    if (active === null || active === document.body) inputRef.current?.focus()
  }, [pending])

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const file = input.files?.[0]
    // Cleared as soon as the File is in hand: `change` only fires on a NEW
    // value, so without this, re-picking the same file after a refusal (having
    // fixed nothing, or having fixed it in place) would do nothing at all.
    input.value = ''
    if (!file) return

    setResult(null)
    setCropError(null)
    setCropped(null)
    if (file.size > MEDIA_UPLOAD_CAP_BYTES) {
      setResult({ ok: false, message: MEDIA_UPLOAD_TOO_LARGE })
      return
    }

    // `change` only fires after the writer drove this control, so the focus
    // about to be destroyed by `disabled` is ours to give back.
    reclaimFocus.current = true
    pickedRef.current = file
    setLocalSrc((previous) => {
      if (previous !== null) URL.revokeObjectURL(previous)
      return URL.createObjectURL(file)
    })
    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      let state: AttachMediaState
      try {
        state = await attachMedia(postId, formData)
      } catch {
        setResult({ ok: false, message: uploadTransportRefusal(file.name || 'that file') })
        return
      }
      setResult(state)
      // The refusal is rendered either way. The dialog is an ADDITION on top of
      // it, so dismissing the dialog leaves the writer looking at exactly the
      // screen they would have seen before this existed.
      if (!state.ok && state.offer !== undefined) setCropOpen(true)
      // Only a success changed the server's list, and only the server can mint
      // the signed preview URL for the new row. The result stays in state
      // across the refresh so warnings survive the re-render rather than
      // flashing past.
      if (state.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p id={limitsId} className="text-[12px] text-muted">
        Images only, up to <span className="tabular-nums">{capMbForChannels(channels)} MB</span>.
        Attaching spends no credits.
      </p>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={acceptForChannels(channels)}
        disabled={pending}
        onChange={onPick}
        aria-describedby={limitsId}
        className="peer sr-only"
      />
      {/* The ring is mirrored from the peer input because the input itself is
          clipped to a pixel — without this the only focus indicator on this
          control would be invisible. Matches the global :focus-visible floor
          (docs/08 §8): 2px --acc, offset 2. */}
      <label
        htmlFor={inputId}
        data-guide="post-media.attach"
        className={cn(
          'inline-flex w-full items-center justify-center gap-2 rounded-pill border-[1.5px] border-ink px-3 py-[6px] text-[13px] font-semibold text-ink transition-micro',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          pending
            ? 'pointer-events-none opacity-45'
            : 'cursor-pointer hover:bg-ink hover:text-white dark:hover:bg-white dark:hover:text-[var(--canvas)] active:scale-[.97]',
        )}
      >
        <Paperclip size={13} aria-hidden />
        {pending ? 'Checking this file…' : 'Add media'}
      </label>

      {/* One persistent polite region, so pending → outcome is announced as a
          content change rather than as a region that appears from nowhere. */}
      <div aria-live="polite">
        {pending ? (
          <p className="rounded-input bg-s1 px-3 py-2.5 text-[13px] text-muted">
            Checking this file against every channel on this post, then attaching it…
          </p>
        ) : null}

        {!pending && cropped !== null && cropped.ok ? (
          <div className="space-y-2">
            <p className="rounded-input bg-ok-bg px-3 py-2.5 type-body text-ok">
              {cropped.message}
            </p>
            {cropped.warnings.length > 0 ? (
              <>
                <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 type-body text-warn">
                  These channels still will not use it:
                </p>
                <ChannelObjections objections={cropped.warnings} tone="warn" />
              </>
            ) : null}
          </div>
        ) : null}

        {!pending && result !== null && result.ok ? (
          <div className="space-y-2">
            {result.warnings.length > 0 ? (
              <>
                {/* Warn, not danger: the file IS on the post. Saying only
                    "attached" would hide that half the channels will drop it;
                    colouring it as an error would claim the upload failed. */}
                <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
                  Attached this file. It is on the post. These channels will not use it:
                </p>
                <ChannelObjections objections={result.warnings} tone="warn" />
              </>
            ) : (
              <p className="rounded-input bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
                {channels.length > 0
                  ? 'Attached this file. Every channel on this post accepts it.'
                  : 'Attached this file. Pick channels to check it against their limits.'}
              </p>
            )}
          </div>
        ) : null}
      </div>

      {!pending && result !== null && !result.ok ? (
        <div role="alert" className="space-y-2">
          {/* The action's message is rendered as-is and NOT suffixed with
              "nothing was attached" — one of its failure arms is "Attached, but
              the response was unreadable", where the row really does exist. A
              blanket reassurance would be a lie in exactly the case the writer
              most needs the truth. */}
          <p className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger">
            {result.message}
          </p>
          <ChannelObjections objections={result.rejections ?? []} tone="danger" />
          {/* Why no crop was offered, when there is a reason worth saying. "Too
              small to crop" and "these channels want contradictory shapes" are
              different situations and only one of them is worth a second try. */}
          {result.noOffer !== undefined && (NO_OFFER_COPY[result.noOffer] ?? '') !== '' ? (
            <p className="rounded-input bg-s1 px-3 py-2.5 type-body text-muted">
              {NO_OFFER_COPY[result.noOffer]}
            </p>
          ) : null}
          {result.offer !== undefined ? (
            <button
              type="button"
              onClick={() => setCropOpen(true)}
              className="rounded-pill border-[1.5px] border-ink px-3 py-1.5 type-body font-semibold text-ink transition-micro hover:bg-ink hover:text-white dark:hover:bg-white dark:hover:text-[var(--canvas)]"
            >
              Show the crop Sahoda would make
            </button>
          ) : null}
        </div>
      ) : null}

      {result !== null && !result.ok && result.offer !== undefined ? (
        <CropOfferDialog
          offer={result.offer}
          open={cropOpen}
          onClose={() => setCropOpen(false)}
          pending={pending}
          localSrc={localSrc}
          error={cropError}
          onAccept={(focal: FocalPoint) => {
            const file = pickedRef.current
            if (file === null) return
            setCropError(null)
            const formData = new FormData()
            formData.append('file', file)
            startTransition(async () => {
              let state: AcceptCropState
              try {
                state = await acceptCropForUpload(postId, formData, focal.x, focal.y)
              } catch {
                setCropError(uploadTransportRefusal(file.name || 'that file'))
                return
              }
              if (!state.ok) {
                setCropError(state.message)
                return
              }
              setCropOpen(false)
              setResult(null)
              setCropped(state)
              router.refresh()
            })
          }}
        />
      ) : null}
    </div>
  )
}
