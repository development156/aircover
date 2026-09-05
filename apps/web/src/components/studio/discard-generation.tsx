'use client'

import { useState, useTransition } from 'react'
import { Trash2 } from 'lucide-react'

import { discardGeneration } from '@/app/actions/studio'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * REMOVING A REQUEST FROM THE LIST.
 *
 * ── THE SENTENCE HAS TO SAY WHICH THING GOES ────────────────────────────────
 * "Delete this?" is ambiguous here in a way that costs somebody work: the record
 * and the picture are two different things, and only the record goes. A person
 * who thinks their picture is about to be deleted will not tidy up at all, and
 * one who thinks it survives when it does not loses something they were using.
 * So the confirmation names both halves.
 *
 * ── AND IT CONFIRMS IN A DIALOG, NOT A `confirm()` ──────────────────────────
 * A native `confirm()` is unstyled, unthemed, cannot say two sentences well, and
 * on some browsers is suppressed entirely. This app confirms in `ui/modal.tsx`,
 * which is the native `<dialog>` and therefore keeps the focus trap and Escape
 * that `confirm()` was being used for.
 */
export function DiscardGeneration({
  generationId,
  prompt,
  onRemoved,
}: {
  generationId: string
  /** Named in the confirmation, so nobody removes the wrong one. */
  prompt: string
  /**
   * Called once the record is gone. The wall re-reads and the tile vanishes;
   * the viewer is LOOKING at that record and has to leave, since a reload of
   * its route would be a 404 wearing a picture.
   */
  onRemoved?: () => void
}) {
  const [asking, setAsking] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [busy, start] = useTransition()

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setNote(null)
          setAsking(true)
        }}
        className="flex items-center gap-1 self-start type-sm text-muted underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <Trash2 className="size-[14px]" aria-hidden />
        Remove this from the list
      </button>

      <Modal
        open={asking}
        onClose={() => setAsking(false)}
        title="Remove this request?"
        description="This removes the record of what you asked for and what it cost. Any picture it made stays in your library, and anything you have already posted is untouched."
        footer={
          <>
            {/* A real secondary control, not an underlined word: in a footer
                beside a filled button, a bare text link reads as a caption. */}
            <Button variant="ghost" onClick={() => setAsking(false)} disabled={busy}>
              Keep it
            </Button>
            <Button
              onClick={() =>
                start(async () => {
                  const result = await discardGeneration(generationId)
                  if (result.ok) {
                    setAsking(false)
                    onRemoved?.()
                    return
                  }
                  setNote(result.message)
                })
              }
              loading={busy}
            >
              Remove the request
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <p className="type-sm text-muted">
            You asked for: <span className="text-ink">{prompt}</span>
          </p>

          {note === null ? null : (
            <p role="alert" className="type-sm text-ink">
              {note}
            </p>
          )}
        </div>
      </Modal>
    </>
  )
}
