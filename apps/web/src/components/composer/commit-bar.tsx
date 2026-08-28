'use client'

import { useState } from 'react'
import { ArrowDown, Save } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { AutosaveStatus } from '@/components/posts/use-autosave'

const POST_STATUS_COPY: Readonly<Record<AutosaveStatus, string>> = {
  // NOT "nothing written yet". MEASURED in a browser capture: after a reload of a
  // post with a body, the status is legitimately `idle` — nothing has changed
  // since the page loaded — and the bar told the writer their post was empty
  // while their words sat on screen above it. `idle` is a statement about
  // CHANGES, not about content.
  idle: 'No changes yet',
  unsaved: 'Post not saved yet',
  saving: 'Saving your post…',
  // NAMED, because it sits beside "· 2 versions not saved" and a bare "Saved"
  // there reads as a claim about everything on the screen. The post is one row;
  // each version is its own.
  saved: 'Post saved',
  error: 'Post not saved',
}

export interface CommitBarProps {
  status: AutosaveStatus
  /** How many selected channels have copy that is not in their row yet. */
  unsavedVersions: number
  /** Whether the finish section exists to be linked to. */
  canFinish: boolean
  /**
   * Write the post and every dirty version. THE SAME FUNCTION `SendControls`
   * calls — one save, reached from two places, so the two can never disagree
   * about what "saved" means.
   */
  onSaveDraft: () => Promise<boolean>
  /**
   * Take the reader to the send panel, once the save has landed.
   *
   * ── WHY THIS IS A CALL AND NOT JUST THE ADDRESS ─────────────────────────────
   * The address is still set, because it is a real address and Back should
   * return. But an address ALONE cannot carry this: assigning a hash that the
   * bar already assigned fires no `hashchange`, so the second press of Save
   * saved the post and moved nothing, silently, for as long as the reader
   * stayed on `#finish`. MEASURED. The call happens every time; the address is
   * for the browser.
   */
  onFinish?: () => void
}

/**
 * The one strip that stays on screen: is my work safe, and where do I finish?
 *
 * ── STICKY, NOT FIXED, AND THAT IS A MEASURED CHOICE ─────────────────────────
 * `position: fixed` chrome renders at its scroll offset in a full-page
 * screenshot, which is how the mobile bottom bar came to be written up as a bug
 * that did not exist (docs/27 §0). Sticky participates in layout, so it needs no
 * padding compensation on `<main>` and it photographs where it actually sits.
 *
 * On a phone it stops 56px short of the viewport floor, which is the height of
 * the app's bottom navigation — otherwise the one control at the end of the page
 * is the one control covered, on the one device that has the bar.
 *
 * ── SAVE CAME BACK, AND IT IS A DIFFERENT BUTTON THAN THE ONE THAT LEFT ──────
 * "Save all versions" used to live here and was removed, because save floating
 * over the page while send sat four screens down put the two endings to the same
 * piece of work in two places. Founder's ruling (REQUESTS §33) puts a save back
 * on the bar, and it is right: a writer at the top of a long composer should not
 * have to travel to the end of the page to make their work safe.
 *
 * What is different is that there is now ONE save function. `onSaveDraft` is the
 * same `saveAllAndWait` that `SendControls` calls, so the floating one and the
 * one in the panel cannot disagree about what "saved" means — which is exactly
 * how the old pair went wrong: the bar saved versions, the panel saved the post,
 * and neither said so.
 *
 * ── AND "SAVE" IS NOT A LINK PRETENDING TO BE A BUTTON ───────────────────────
 * The second control was a bare anchor to `#finish` labelled "Save and send". It
 * saved nothing; it scrolled. The founder asked for it to read "Save", and a
 * scroll link called Save would be the vaguest possible label for the most
 * important word on the screen. So it now SAVES and then goes to the end of the
 * page — the label is true, and the journey it was there for is unchanged.
 */
export function CommitBar({
  status,
  unsavedVersions,
  canFinish,
  onSaveDraft,
  onFinish,
}: CommitBarProps) {
  const versionWord = unsavedVersions === 1 ? 'version' : 'versions'
  const [saving, setSaving] = useState(false)

  /**
   * Save, then go. The order matters and the `await` is the whole point: jumping
   * first would move the page out from under a write still in flight, and a
   * reader who then closed the tab would lose it.
   *
   * The jump is a plain hash assignment rather than `router.push` so it behaves
   * like the anchor it replaces — it lands on `#finish`, `scroll-mt-6` on that
   * section keeps the heading clear of the topbar, and Back returns. It is no
   * longer the whole mechanism, though: see `onFinish`.
   */
  async function saveThenFinish() {
    setSaving(true)
    await onSaveDraft()
    setSaving(false)
    window.location.hash = 'finish'
    // And ASK, rather than leaving it to the event the line above may not
    // fire. See `onFinish` for what that cost the second press.
    onFinish?.()
  }

  /**
   * ── AN EMPTY BAR IS FURNITURE, AND IT WAS THE WIDEST THING ON THE SCREEN ────
   * `docs/34` §10 named this screen the worst in the product and listed, among
   * the reasons, "the widest element on it says 'No changes yet' and carries no
   * control". MEASURED again on this lane's baseline frame at 1440: on
   * `/posts/new` the bar spans the full content column, holds one grey phrase,
   * and offers nothing — while the thing the reader came to do is a textarea
   * two thirds its width.
   *
   * `idle` is deliberately NOT the same as "empty" (see POST_STATUS_COPY): a
   * reloaded post with a body is legitimately idle, and there the bar carries
   * "Send it" and earns its space. So the test is all three together — nothing
   * has happened, nothing is unsaved, and there is nowhere to go.
   *
   * The LIVE REGION SURVIVES. An `aria-live` container added to the DOM at the
   * same moment its text changes is not reliably announced, so removing the
   * element outright would cost a screen-reader user the first "Post not saved
   * yet" — trading a visual defect for an accessibility one. The region stays
   * mounted and only the chrome goes.
   */
  const carriesNothing = status === 'idle' && unsavedVersions === 0 && !canFinish
  if (carriesNothing) {
    return (
      <p aria-live="polite" className="sr-only">
        {POST_STATUS_COPY[status]}
      </p>
    )
  }

  return (
    <div className="sticky bottom-0 z-5 -mx-page pt-2 max-narrow:bottom-[56px] max-narrow:-mx-page-mobile">
      <div className="surface-ring flex flex-wrap items-center justify-between gap-3 rounded-card bg-surface px-3 py-2.5 shadow-pop">
        <p aria-live="polite" className="text-[12.5px] text-muted">
          {/* Two facts, never merged: the post is one row and each version is its
              own. "Saved" about the post while three versions sit unwritten is the
              exact half-truth this product refuses. */}
          <span className={status === 'error' ? 'text-danger' : undefined}>
            {POST_STATUS_COPY[status]}
          </span>
          {unsavedVersions > 0 ? (
            <>
              {' · '}
              <span className="font-semibold text-ink">
                <span className="tabular-nums">{unsavedVersions}</span> {versionWord} not saved
              </span>
            </>
          ) : null}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {/* The safe half, and it stays put. A writer three screens up wants
              their work written down, not a trip to the end of the page. */}
          <Button
            size="sm"
            variant="secondary"
            data-bar-save-draft
            loading={saving}
            disabled={saving}
            onClick={() => void onSaveDraft()}
          >
            <Save size={13} aria-hidden />
            Save as draft
          </Button>

          {canFinish ? (
            <Button
              size="sm"
              data-bar-save
              loading={saving}
              disabled={saving}
              onClick={() => void saveThenFinish()}
            >
              <ArrowDown size={13} aria-hidden />
              Save
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
