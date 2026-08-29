'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { deletePost } from '@/app/actions/posts'
import { InlineError } from '@/components/posts/inline-error'
import { Button } from '@/components/ui/button'
import { Modal } from '@/components/ui/modal'

/**
 * Delete a post, behind a dialog that says what is about to be lost.
 *
 * ── WHY THIS STOPPED BEING AN INLINE TWO-STEP ────────────────────────────────
 * It used to arm in place: the trigger swapped itself for "Delete “{title}” for
 * good?" plus Cancel and Confirm, laid out in a row on the card. That was fine
 * while a card was a full-width row with ~1400px to spend on it.
 *
 * The posts list is now a grid of ~325px square tiles, and the armed row is
 * wider than the tile. MEASURED from the screen: the prompt spilled out of its
 * card and across the one beside it, and Cancel and Confirm were pushed off the
 * edge entirely — the delete could be STARTED and then not finished, which is
 * the worst of the three possible outcomes. Widening the tile or truncating the
 * prompt would both have been fixes to the symptom.
 *
 * `Modal` is built on the native `<dialog>`, which renders in the browser's TOP
 * LAYER. That is the property that matters here: a top-layer element cannot be
 * clipped by an ancestor's `overflow`, cannot lose a stacking-context race, and
 * does not care how narrow the card it was summoned from is. The confirm step is
 * now independent of the layout around it, which is why this cannot regress the
 * same way when the tile changes size again.
 *
 * `window.confirm` is still not used, for the reason it never was: it blocks the
 * whole tab, cannot be styled, and cannot carry the two sentences below.
 *
 * ── WHY THE CONFIRM BUTTON IS NOT A SPECIAL COLOUR ───────────────────────────
 * There is no red in this palette at all (button.tsx, RETHEME.md §5), so a
 * "danger colour" was never available to lose. The buttons here are the app's
 * ordinary ones — Cancel is the standard bordered button and Confirm is the
 * brand primary, the same control as "Create post". What makes this safe is not
 * hue: it is that the action now sits behind a dialog that names the post, says
 * plainly that it cannot be undone, and says what happens to any credits already
 * spent on it. A colour a reader has to learn is a weaker guard than a sentence
 * they can read.
 */

export interface DeletePostButtonProps {
  postId: string
  /** Shown in the dialog so the user knows WHICH post is about to go. */
  title: string
  /**
   * Icon-only trigger, for a LIST TILE.
   *
   * docs/26 §1.5: a destructive action never gets standing real estate in a
   * list row. MEASURED on /posts: eight cards each spent a full-width rule and
   * ~55px of footer on one right-aligned `Delete`, and it was the only action
   * with dedicated space anywhere on the screen — no Open, no Edit, no
   * Schedule, no Approve.
   *
   * Compact drops the WORD, not the control and not its name: `aria-label`
   * still reads "Delete {title}", so the scan path loses a destructive verb
   * repeated eight times while a screen reader loses nothing. The dialog still
   * spells the title out in full.
   */
  compact?: boolean
  /**
   * Does a version of this post actually exist on a platform right now?
   *
   * Decided by the CALLER from evidence (a permalink), never from a status
   * column. It changes what the dialog may claim: deleting here removes our
   * rows and does not reach out to X, LinkedIn or Google, so for a post that
   * really went out, "it goes for good" would be false in the direction that
   * matters — the reader would believe the post is off the internet.
   */
  liveElsewhere?: boolean
}

export function DeletePostButton({
  postId,
  title,
  compact = false,
  liveElsewhere = false,
}: DeletePostButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const triggerRef = useRef<HTMLButtonElement>(null)

  /**
   * Closing returns focus to the trigger by hand.
   *
   * `<dialog>` restores focus on its own when it closes, but only to the element
   * that was focused when `showModal()` ran — and on a POINTER press that is the
   * trigger, while on a keyboard press it is also the trigger, so the two agree
   * right up until the dialog is closed by the Escape key during a re-render.
   * Doing it explicitly costs one line and removes the case where the caret
   * drops to <body> and a keyboard user restarts from the top of the page.
   */
  function close() {
    setOpen(false)
    triggerRef.current?.focus()
  }

  function onConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await deletePost(postId)
      if (!result.ok) {
        // ── THE REASON STAYS IN THE DIALOG, AND THIS IS A REVERSAL ──────────
        // It used to close the dialog and print the reason on the CARD, on the
        // reasoning that an open dialog leaves the primary button inviting an
        // identical second attempt. That reasoning was about the button and
        // ignored where the sentence lands: the inline error sat in the card's
        // header column, which is `flex-none` — shrink zero, so it takes its
        // max-content width — inside a card with no `overflow-hidden`. MEASURED
        // in Chromium at 1440 in the four-column grid: a 326px tile and a 458px
        // error box, overhanging by 209px and painting over the tile beside it.
        // That is the ORIGINAL DEFECT, moved from the prompt to the failure
        // message, and it would have shipped as the fix for itself.
        //
        // The dialog is the top layer and cannot overflow anything, so the
        // reason belongs there. The retry worry is answered by naming it: the
        // button reads "Try again", so a second press is a decision rather than
        // a repeat, and the reason it failed is on screen while it is made.
        setError(result.message)
        return
      }
      toast('Deleted the post.')
      setOpen(false)
      // The action revalidates /posts; refresh pulls the new server render and
      // keeps `pending` true until it lands, so the tile cannot look stale.
      router.refresh()
    })
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <Button
        ref={triggerRef}
        type="button"
        variant="ghost"
        size="sm"
        // Cleared on OPEN, not on close: a dialog reopened later must not show
        // the reason a previous attempt failed as though it were about this one.
        onClick={() => {
          setError(null)
          setOpen(true)
        }}
        data-guide="posts.delete"
        aria-label={`Delete ${title}`}
        // The touch floor is a TOKEN class, not a literal 44 — docs/26 §9.
        className={compact ? 'text-muted max-narrow:min-h-[44px] max-narrow:min-w-[44px]' : ''}
      >
        <Trash2 size={15} strokeWidth={1.8} aria-hidden />
        {compact ? null : 'Delete'}
      </Button>

      {/* ── MOUNTED ONLY ONCE OPENED ──────────────────────────────────────
          `Modal` renders its `<dialog>`, and therefore its `<h2>` title, whether
          or not it is showing. Mounted unconditionally, every tile on /posts put
          the string “Delete “{title}”?” into the document permanently — invisible
          on screen, but present to anything that reads the page as text. It was
          caught by an unrelated guard: `post-card-heading.test.tsx` looks for the
          post's title and suddenly found TWO matches, its own heading and this
          dialog's. A closed question should contribute nothing to the page. */}
      {open ? (
        <Modal
          open
          onClose={close}
          // The dialog owns the X and the Escape key; a call site cannot reach
          // either. Without this, Escape mid-delete dismissed the dialog while
          // the request kept running, next to a "Keep it" the same code path
          // deliberately disables.
          busy={pending}
          // The title names the post, so the dialog is answerable without reading
          // the body — and a screen reader announces WHICH post on open.
          title={`Delete “${title}”?`}
          footer={
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={close} disabled={pending}>
                Keep it
              </Button>
              <Button
                type="button"
                variant="primary"
                loading={pending}
                onClick={onConfirm}
                // The visible label stays a PREFIX of the accessible name
                // (WCAG 2.5.3), and the name carries the title so the control is
                // never just "Delete" with no idea which post is one press away.
                aria-label={`Delete ${title} for good`}
              >
                {pending ? 'Deleting…' : error ? 'Try again' : 'Delete for good'}
              </Button>
            </div>
          }
        >
          {/* ── TWO SENTENCES, TWO DIFFERENT CLAIMS ───────────────────────────
              The first is about the draft and is unconditional: the row is
              deleted outright, and its channel versions and attachments go with
              it on the same cascade. Nothing goes to a bin, so "cannot be undone"
              is literally true rather than a caution.

              The second is about credits, and it is worded to be true whether or
              not any were ever spent. It does NOT say credits were spent — this
              component cannot know that, and asserting a charge that never
              happened would be inventing a figure about someone's own account.
              What it can state is the RULE, which holds in both cases: the charge
              happens when the work is done, and deleting what the work produced
              does not reverse it. MEASURED in `deletePost`: the action deletes
              the row and never touches the ledger, so there is no refund to
              describe and none to promise. */}
          {/* ── THREE CLAIMS, EACH SCOPED TO WHAT IS ACTUALLY TRUE ────────
              1. What goes. Deliberately says "from Sahoda" rather than "for
                 good": the delete cascades over the post, its channel versions,
                 its schedule and its publish log, and that is the whole of its
                 reach. It also drops the LINK to any attached photo — not the
                 photo. The asset and the file in the library are untouched, so
                 "anything attached to it" would have read as "your photos go
                 too", which is broader than the truth.
              2. What does NOT go, and only when there is something. Shown on the
                 evidence of a permalink, so a plain draft never reads a sentence
                 about platforms it never reached — and a post that really went
                 out is never left believing this takes it down.
              3. Credits. Worded to hold whether or not any were spent: this
                 component cannot know, and asserting a charge that never
                 happened would be inventing a figure about someone's account.
                 MEASURED in `deletePost`: it touches no ledger, so there is no
                 refund to describe and none to promise. */}
          <p className="type-body text-muted">
            This removes the post from Sahoda: the draft, every channel version, its schedule and
            anything recorded about how it did. Photos stay in your library. This cannot be undone.
          </p>
          {liveElsewhere ? (
            <p className="type-body mt-3 text-muted">
              It has already gone out, and deleting it here does not take it down. To remove the
              live post, delete it on the platform itself.
            </p>
          ) : null}
          <p className="type-body mt-3 text-muted">
            If Sahoda wrote or improved anything in this post, those credits were spent when the
            work was done. Deleting it does not bring them back.
          </p>
          {/* The failure, where it cannot overflow anything. `InlineError`
              carries the alert role, so the reason is announced rather than
              merely drawn — the dialog is already open when it appears, so
              nothing else would announce it. */}
          {error ? (
            <InlineError className="mt-3 text-left">{error} The post is still here.</InlineError>
          ) : null}
        </Modal>
      ) : null}
    </div>
  )
}
