'use client'

import { ArrowDown } from 'lucide-react'

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
  savingVersions: boolean
  onSaveAll: () => void
  /** Whether the finish section exists to be linked to. */
  canFinish: boolean
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
 * ── WHY IT DOES NOT CARRY PUBLISH ────────────────────────────────────────────
 * Publishing is irreversible, per channel, and needs its warnings beside it. It
 * lives in `FinishPanel` and this bar links to it — see that file.
 */
export function CommitBar({
  status,
  unsavedVersions,
  savingVersions,
  onSaveAll,
  canFinish,
}: CommitBarProps) {
  const versionWord = unsavedVersions === 1 ? 'version' : 'versions'
  // MEASURED in a browser snapshot: the plural helper alone rendered the button
  // as "Save all version". "All" and a singular do not go together in English,
  // and a count of one does not need the word "all" at all.
  const saveAllLabel = unsavedVersions === 1 ? 'Save this version' : 'Save all versions'

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
          {unsavedVersions > 0 ? (
            <Button variant="secondary" size="sm" onClick={onSaveAll} loading={savingVersions}>
              {saveAllLabel}
            </Button>
          ) : null}
          {canFinish ? (
            // A LINK, because it navigates. `router.push` from a button would not
            // survive a reload, would not appear in the page's link list and
            // would not open in a new tab — docs/26 §10.2.
            <a
              href="#finish"
              className="surface-ring-firm inline-flex h-7 shrink-0 items-center gap-icon-gap rounded-sm bg-surface px-btn-tight text-[12px] leading-none font-[550] text-ink transition-micro hover:bg-s2 max-narrow:min-h-[44px]"
            >
              <ArrowDown size={13} aria-hidden />
              Send it
            </a>
          ) : null}
        </div>
      </div>
    </div>
  )
}
