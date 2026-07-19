'use client'

import { useEffect, useId, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deletePost } from '@/app/actions/posts'
import { InlineError } from '@/components/posts/inline-error'
import { Button } from '@/components/ui/button'

/**
 * Two-step inline delete. `window.confirm` is deliberately NOT used — a native
 * modal blocks the whole tab and cannot be styled, focused, or dismissed on our
 * terms. Arming is local state; the second press is the real destructive call.
 *
 * The armed state disarms itself after a short window so a card can never sit
 * "one click from deletion" indefinitely.
 */
const CONFIRM_WINDOW_MS = 8000

export interface DeletePostButtonProps {
  postId: string
  /** Shown in the confirm prompt so the user knows WHICH post is armed. */
  title: string
}

export function DeletePostButton({ postId, title }: DeletePostButtonProps) {
  const router = useRouter()
  const [armed, setArmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const confirmRef = useRef<HTMLButtonElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  // Set only when we disarm a subtree that currently owns focus.
  const restoreFocus = useRef(false)
  const promptId = useId()

  /**
   * Disarming unmounts the focused "Confirm delete" button. Without handing
   * focus back to the trigger, the caret drops to <body> and a keyboard user
   * restarts from the top of the page — after a cancel, after a failed delete,
   * and (worst) when the 8s timer fires while they are still reading.
   */
  function disarm() {
    restoreFocus.current = true
    setArmed(false)
  }

  // Move focus onto the destructive control the moment it appears, so keyboard
  // users are not left tabbing to find the thing they just summoned.
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

  // Auto-disarm. Held while the delete is in flight so the row does not reset
  // out from under an in-progress request.
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
      const result = await deletePost(postId)
      if (!result.ok) {
        setError(result.message)
        disarm()
        return
      }
      toast('Deleted the post.')
      // The action revalidates /posts; refresh pulls the new server render and
      // keeps `pending` true until it lands, so the row cannot look stale.
      router.refresh()
    })
  }

  if (!armed) {
    return (
      <div className="flex flex-col items-end gap-2">
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setArmed(true)}
          data-guide="posts.delete"
          aria-label={`Delete ${title}`}
        >
          <Trash2 size={15} strokeWidth={1.8} aria-hidden />
          Delete
        </Button>

        {error ? (
          <InlineError className="text-left">
            {error} The post is still here — try again.
          </InlineError>
        ) : null}
      </div>
    )
  }

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      {/* No aria-live here: the region and its text mount in the same commit, so
          a live region would never fire. The prompt is bound to the destructive
          control instead — that IS what a screen reader reaches. */}
      <span id={promptId} className="text-[13px] text-muted">
        Delete “{title}” for good?
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
        // Name carries the title so the control is never just "Confirm delete"
        // with no idea WHICH post is one press from being gone. The visible
        // label stays a prefix of the accessible name (WCAG 2.5.3).
        aria-label={`Confirm delete ${title}`}
        aria-describedby={promptId}
      >
        {pending ? 'Deleting…' : 'Confirm delete'}
      </Button>
    </div>
  )
}
