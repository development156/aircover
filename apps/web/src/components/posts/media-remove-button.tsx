'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'

import { detachMedia } from '@/app/actions/posts-media'
import { Button } from '@/components/ui/button'

/**
 * Two-step inline confirm for detaching one file.
 *
 * `window.confirm` is deliberately NOT used — a native modal blocks the whole
 * tab, cannot be styled or focus-managed, and is forbidden in this environment.
 * Arming is local state; the second press is the real destructive call. Same
 * shape as `delete-post-button.tsx`, so the two destructive controls in the
 * editor behave identically.
 *
 * The armed state disarms itself after a short window so a row can never sit
 * one click from deletion indefinitely.
 */
const CONFIRM_WINDOW_MS = 8000

export interface MediaRemoveButtonProps {
  mediaId: string
  /** Names WHICH file is one press from being gone — a row list of "Remove" is not enough. */
  fileName: string
}

export function MediaRemoveButton({ mediaId, fileName }: MediaRemoveButtonProps) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)
  const confirmRef = useRef<HTMLButtonElement>(null)
  // Set only when we disarm a subtree that currently owns focus.
  const restoreFocus = useRef(false)
  const promptId = useId()

  /**
   * Disarming unmounts the focused "Confirm remove" button. Without handing
   * focus back to the trigger the caret drops to <body> and a keyboard user
   * restarts from the top of the page — after a cancel, after a failed remove,
   * and (worst) when the timer fires while they are still reading.
   */
  function disarm() {
    restoreFocus.current = true
    setArmed(false)
  }

  useEffect(() => {
    if (armed) {
      confirmRef.current?.focus()
      return
    }
    if (restoreFocus.current) {
      restoreFocus.current = false
      triggerRef.current?.focus()
    }
  }, [armed])

  // Auto-disarm, held while the request is in flight so the row does not reset
  // out from under it.
  useEffect(() => {
    if (!armed || pending) return
    const timer = window.setTimeout(() => {
      // Same disarm-with-focus-return as `disarm()`, inlined so this effect has
      // no function dependency that would restart the window on every render.
      restoreFocus.current = true
      setArmed(false)
    }, CONFIRM_WINDOW_MS)
    return () => window.clearTimeout(timer)
  }, [armed, pending])

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const state = await detachMedia(mediaId)
      if (!state.ok) {
        setError(state.message)
        disarm()
        return
      }
      // The action revalidates /posts; refresh pulls the new server render and
      // holds `pending` until it lands, so the row cannot look stale. On
      // success this row unmounts, which is the one case focus cannot be
      // returned to a trigger that no longer exists.
      router.refresh()
    })
  }

  return (
    <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
      {armed ? (
        <>
          {/* No aria-live: the prompt and its text mount in the same commit, so
              a live region would never fire. It is bound to the destructive
              control instead — that IS what a screen reader reaches. */}
          <span id={promptId} className="text-[12.5px] text-muted">
            Remove this file from the post?
          </span>
          <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={disarm}>
            Cancel
          </Button>
          <Button
            ref={confirmRef}
            type="button"
            variant="destructive"
            size="sm"
            loading={pending}
            onClick={onConfirm}
            // The visible label stays a prefix of the accessible name (WCAG 2.5.3).
            aria-label={`Confirm remove ${fileName}`}
            aria-describedby={promptId}
          >
            {pending ? 'Removing…' : 'Confirm remove'}
          </Button>
        </>
      ) : (
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setArmed(true)}
          data-guide="post-media.remove"
          aria-label={`Remove ${fileName}`}
        >
          <Trash2 size={14} strokeWidth={1.8} aria-hidden />
          Remove
        </Button>
      )}

      {error !== null ? (
        <div
          role="alert"
          className="w-full rounded-input border border-danger-bg bg-danger-bg px-3 py-2.5 text-[13px] text-danger"
        >
          {/* Not "the file is still attached": one failure arm is the row
              already being gone, and another is a throw AFTER the delete
              landed. Reload is the only claim that is true in every arm. */}
          {error} Reload to see what is still attached.
        </div>
      ) : null}
    </div>
  )
}
