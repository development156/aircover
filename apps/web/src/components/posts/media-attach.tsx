'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Paperclip } from 'lucide-react'
import type { Channel } from '@sahoda/shared'

import { attachMedia } from '@/app/actions/posts-media'
import type { AttachMediaState } from '@/lib/posts/media-state'
import { cn } from '@/lib/utils'

import { ChannelObjections } from './channel-objections'
import { acceptForChannels, capMbForChannels } from './media-accept'

export interface MediaAttachProps {
  postId: string
  /** The post's selected channels — drives `accept` and the outcome copy. */
  channels: Channel[]
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
 * Attaching spends NO credits — it stores a file and runs the engine, neither
 * of which touches the ledger — so no cost is quoted, only the size ceiling.
 */
export function MediaAttach({ postId, channels }: MediaAttachProps) {
  const router = useRouter()
  const [result, setResult] = useState<AttachMediaState | null>(null)
  const [pending, startTransition] = useTransition()
  const inputRef = useRef<HTMLInputElement>(null)
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

    // `change` only fires after the writer drove this control, so the focus
    // about to be destroyed by `disabled` is ours to give back.
    reclaimFocus.current = true
    setResult(null)
    const formData = new FormData()
    formData.append('file', file)

    startTransition(async () => {
      const state = await attachMedia(postId, formData)
      setResult(state)
      // Only a success changed the server's list, and only the server can mint
      // the signed preview URL for the new row. The result stays in state
      // across the refresh so warnings survive the re-render rather than
      // flashing past.
      if (state.ok) router.refresh()
    })
  }

  return (
    <div className="space-y-2 border-t border-line pt-3">
      <p id={limitsId} className="text-[12px] text-faint">
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
            : 'cursor-pointer hover:bg-ink hover:text-white active:scale-[.97]',
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

        {!pending && result !== null && result.ok ? (
          <div className="space-y-2">
            {result.warnings.length > 0 ? (
              <>
                {/* Warn, not danger: the file IS on the post. Saying only
                    "attached" would hide that half the channels will drop it;
                    colouring it as an error would claim the upload failed. */}
                <p className="rounded-input border border-warn bg-warn-bg px-3 py-2.5 text-[13px] text-warn">
                  Attached this file. It is on the post — these channels will not use it:
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
        </div>
      ) : null}
    </div>
  )
}
