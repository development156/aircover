'use client'

import { useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Upload } from 'lucide-react'

import type { ChannelRejection } from '@/lib/posts/attach-decision'
import type { UploadAssetState } from '@/lib/assets/state'

import { uploadAsset } from '@/app/actions/assets'
import { UPLOADABLE_MIME_TYPES } from '@/lib/assets/kind'
import {
  MEDIA_UPLOAD_CAP_BYTES,
  MEDIA_UPLOAD_TOO_LARGE,
  uploadTransportRefusal,
} from '@/lib/posts/media-constants'
import { ChannelObjections } from '@/components/posts/channel-objections'
import { cn } from '@/lib/utils'

/**
 * Add photos to the library.
 *
 * ── SEVERAL AT ONCE, BECAUSE A PHONE PICKER OFFERS SEVERAL ───────────────────
 * `multiple` is set: someone photographing a new menu takes four pictures, and
 * a picker that accepts one of them makes them repeat the whole gesture four
 * times. They upload one at a time on the wire — each is sniffed, judged and
 * stored on its own — so one bad file among four does not lose the other three,
 * and the outcome names which one was refused.
 *
 * ── THE CONTROL IS THE INPUT ─────────────────────────────────────────────────
 * A real `<input type="file">`, visually hidden but still the only tab stop,
 * with a `<label>` styled as the button. A `<button>` that click()s a hidden
 * input leaves the input as a second, invisible tab stop. Same shape as the
 * composer's `MediaAttach`.
 *
 * `accept` is a hint, never a check: `File.type` is whatever the browser was
 * told to say. The server sniffs the bytes and decides.
 *
 * ── THE ONE CHECK THAT DOES RUN HERE, AND WHY ────────────────────────────────
 * Size. Not because the client's word is trusted (the server checks again) but
 * because a file over the cap never REACHES the server check: Vercel answers
 * 413 at the edge, the awaited action throws, and the whole screen fell to the
 * error boundary. MEASURED 2026-09-06 with a 5.7 MB PNG. So the size is read
 * here first, the refusal is the server's own sentence, and every call to the
 * action is wrapped, so a transport failure is one refused row rather than a
 * crashed route. Files added before the failure are still added, and the
 * library still refreshes to show them.
 */
const CAP_MB = Math.floor(MEDIA_UPLOAD_CAP_BYTES / 1_000_000)

interface Outcome {
  added: number
  /** Refusals, named by file so the person knows which one to fix. */
  refused: { name: string; message: string }[]
  /** Channels that will not take something that WAS added. */
  unusable: ChannelRejection[]
}

export function AssetUpload({ label = 'Add photos' }: { label?: string }) {
  const router = useRouter()
  const [outcome, setOutcome] = useState<Outcome | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = useId()
  const limitsId = useId()

  function onPick(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget
    const files = Array.from(input.files ?? [])
    // Cleared immediately: `change` only fires on a NEW value, so without this,
    // re-picking the same file after a refusal would do nothing at all.
    input.value = ''
    if (files.length === 0) return

    setOutcome(null)
    startTransition(async () => {
      let added = 0
      const refused: { name: string; message: string }[] = []
      let unusable: ChannelRejection[] = []

      for (const file of files) {
        const name = file.name || 'that file'
        if (file.size > MEDIA_UPLOAD_CAP_BYTES) {
          refused.push({ name, message: MEDIA_UPLOAD_TOO_LARGE })
          continue
        }
        const formData = new FormData()
        formData.append('file', file)
        let state: UploadAssetState
        try {
          state = await uploadAsset(formData)
        } catch {
          refused.push({ name, message: uploadTransportRefusal(name) })
          continue
        }
        if (state.ok) {
          added += 1
          // The LAST file's objections, not a merged set: the sentence below
          // says "it", and merging four files' complaints into one list would
          // attribute one photo's problem to another.
          if (state.unusable.length > 0) unusable = state.unusable
        } else {
          refused.push({ name, message: state.message })
        }
      }

      setOutcome({ added, refused, unusable })
      if (added > 0) router.refresh()
    })
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        id={inputId}
        type="file"
        multiple
        accept={UPLOADABLE_MIME_TYPES.join(',')}
        disabled={pending}
        onChange={onPick}
        aria-describedby={limitsId}
        className="peer sr-only"
      />
      {/* The ring is mirrored from the peer input because the input itself is
          clipped to a pixel — without this the only focus indicator on this
          control would be invisible. */}
      <label
        htmlFor={inputId}
        data-guide="assets.upload"
        className={cn(
          'inline-flex h-control items-center justify-center gap-[6px] rounded-sm bg-primary px-3 text-[13px] leading-none font-[550] text-primary-foreground transition-micro select-none',
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-accent',
          'max-narrow:h-auto max-narrow:min-h-[44px] max-narrow:w-full',
          pending
            ? 'pointer-events-none opacity-45'
            : 'cursor-pointer hover:bg-ink hover:text-white active:translate-y-[0.5px] dark:hover:bg-white dark:hover:text-[var(--canvas)]',
        )}
      >
        <Upload size={15} strokeWidth={1.8} aria-hidden />
        {pending ? 'Adding…' : label}
      </label>

      <p id={limitsId} className="text-[12px] text-muted">
        Photos only, up to <span className="num">{CAP_MB} MB</span> each. Adding a photo spends no
        credits.
      </p>

      <div aria-live="polite">
        {pending ? (
          <p className="rounded-input bg-s1 px-3 py-2.5 text-[13px] text-muted">
            Checking each photo, then adding it to your library…
          </p>
        ) : null}

        {!pending && outcome !== null && outcome.added > 0 ? (
          // B4: this was a full-width `<p>` inside a flex column whose own
          // width is set by the WIDEST sibling (the limits sentence below it),
          // so a ten-character confirmation rendered inside a box built for a
          // much longer line — the "wide grey slab" the founder circled.
          // `inline-flex w-fit` makes the box hug its own text instead of the
          // column's width.
          <p className="inline-flex w-fit rounded-input bg-ok-bg px-3 py-2.5 text-[13px] text-ok">
            {outcome.added === 1 ? 'Added 1 photo.' : `Added ${outcome.added} photos.`}
          </p>
        ) : null}
      </div>

      {!pending && outcome !== null && outcome.unusable.length > 0 ? (
        <div className="space-y-2">
          <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
            Added, and kept. These channels will not use it:
          </p>
          <ChannelObjections objections={outcome.unusable} tone="warn" />
        </div>
      ) : null}

      {!pending && outcome !== null && outcome.refused.length > 0 ? (
        <ul role="alert" className="space-y-1.5">
          {outcome.refused.map((entry, index) => (
            <li
              // Two photos from one phone can share a name; the index keeps
              // both refusals on screen.
              key={`${index}-${entry.name}`}
              className="rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
            >
              <span className="font-semibold">{entry.name}</span>: {entry.message}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
