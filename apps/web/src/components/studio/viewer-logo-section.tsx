import Link from 'next/link'
import { Lock } from 'lucide-react'

import { anchorNote } from '@/lib/studio/anchor-note'
import { stampNote } from '@/lib/studio/stamp-copy'
import type { CanvasPicture } from '@/lib/studio/canvas'

/**
 * WHAT HAPPENED TO THE LOGO, AND WHICH VERSION IS ON SCREEN.
 *
 * ── THE TOGGLE ONLY EXISTS WHEN THERE ARE GENUINELY TWO PICTURES ────────────
 * `stampNote(outcome).hasBothVersions` is true for exactly one answer,
 * `stamped`, because every other outcome produced one picture and a toggle
 * over one picture is a control that does nothing.
 *
 * ── THE PLACEMENT SENTENCE COMES FROM `anchor-note.ts`, NOT FROM HERE ───────
 * Its four outcomes stay four: `unrecorded` renders the locked "Exact
 * placement: coming soon" this product has always shown while nothing
 * measured it, `as_chosen` says nothing (the mark went where it was asked),
 * and the two `moved` reasons each carry their own sentence naming the
 * corner. This component never writes a fifth sentence of its own.
 */
export function ViewerLogoSection({
  picture,
  showing,
  onShowingChange,
}: {
  picture: CanvasPicture
  showing: 'stamped' | 'original'
  onShowingChange: (next: 'stamped' | 'original') => void
}) {
  const note = stampNote(picture.stampOutcome)
  const placement = anchorNote({
    anchor: picture.stampAnchor ?? null,
    reason: picture.stampAnchorMovedReason ?? null,
  })

  return (
    <div className="flex flex-col gap-2.5" data-guide="studio-logo-bar">
      <span className="type-eyebrow text-muted">Your logo</span>

      {note.hasBothVersions ? (
        <>
          <div
            role="group"
            aria-label="Which version of this picture to show"
            className="surface-ring flex h-[38px] items-center gap-1 rounded-pill bg-s2 p-1"
          >
            {(['stamped', 'original'] as const).map((which) => (
              <button
                key={which}
                type="button"
                onClick={() => onShowingChange(which)}
                aria-pressed={showing === which}
                className={`flex-1 rounded-pill py-1.5 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  showing === which
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted hover:text-ink'
                }`}
              >
                {which === 'stamped' ? 'With your logo' : 'Without it'}
              </button>
            ))}
          </div>

          {placement.moved ? (
            <span data-guide="studio-frame-note" className="type-sm text-muted">
              {placement.body}
            </span>
          ) : placement.reason === 'unrecorded' ? (
            <span
              data-guide="studio-frame-note"
              className="inline-flex items-center gap-1.5 type-sm text-muted"
            >
              <Lock className="size-[11px]" aria-hidden />
              Exact placement: coming soon
            </span>
          ) : null}
        </>
      ) : (
        <div className="flex flex-col gap-1">
          <span className="type-sm font-[550] text-ink">{note.title}</span>
          <span className="type-sm text-muted">{note.body}</span>
          {note.remedy === null ? null : (
            <Link
              href={note.remedy.href}
              className="type-sm font-[600] text-ink underline underline-offset-2 transition-micro hover:text-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              {note.remedy.label}
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
