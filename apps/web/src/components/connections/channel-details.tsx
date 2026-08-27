'use client'

import { useState } from 'react'
import { Info } from 'lucide-react'

import { Drawer } from '@/components/ui/drawer'

/**
 * WHAT A CHANNEL ACTUALLY DOES, ON ASK.
 *
 * ── WHY A DRAWER AND NOT MORE TILE ───────────────────────────────────────────
 * A tile answers one question: will this carry a post, and is it linked. Everything
 * a person asks NEXT — what Sahoda can publish here, how long the link lasts, what
 * it costs, why this one says "Not proven live" — is a second question, and eight
 * tiles that each answered both would be eight walls of text on a screen whose job
 * is to be scanned.
 *
 * `drawer.tsx`'s own header states the rule this follows: a modal interrupts and
 * demands an answer, a drawer is a side surface consulted while the page behind it
 * stays the subject. Nothing here needs answering. It is a reference panel.
 *
 * ── EVERY FACT IS PASSED IN, NONE IS DERIVED HERE ────────────────────────────
 * This is a client component, so anything it computed would be computed from
 * whatever the server chose to serialise — and a number recomputed on the client
 * from a partial view is how a screen ends up disagreeing with itself. The sole
 * job here is to render rows somebody else measured.
 *
 * ── THE `backdrop-filter` TRAP DOES NOT APPLY, AND THAT IS NOT AN ACCIDENT ───
 * apps/web/CLAUDE.md records that an element with a `backdrop-filter` becomes the
 * containing block for `position: fixed` descendants, which is why the command
 * palette had to be portalled out of the `glass` topbar. This drawer is a native
 * `<dialog>` opened with `showModal()`, so it renders in the browser's TOP LAYER
 * rather than in the normal flow, and it is mounted inside a page tile rather than
 * inside any `glass` element. Both facts have to stay true: move this into the
 * topbar or the rail and it needs a portal like the palette does.
 */

export interface DetailRow {
  term: string
  /** Already-measured text. Never a figure this component works out. */
  detail: string
}

export function ChannelDetails({
  label,
  blurb,
  rows,
  note,
}: {
  /** The channel's full name — the drawer's title and its own subject. */
  label: string
  /** One sentence on what Sahoda does with this channel. */
  blurb: string
  rows: readonly DetailRow[]
  /**
   * A closing caveat, when the channel has one. Absent rather than empty on a
   * channel with nothing to caveat: an empty note would render a rule and a gap
   * that read as content failing to load.
   */
  note?: string
}) {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        /* An `aria-label` that names the CHANNEL. Eight tiles each carrying a
           control announced as "Details" gives a screen reader user eight
           identical buttons and no way to tell them apart. */
        aria-label={`What Sahoda does with ${label}`}
        aria-haspopup="dialog"
        data-channel-details={label}
        className="inline-flex items-center gap-1.5 rounded-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc)]"
      >
        <Info aria-hidden className="size-3.5" />
        <span className="type-sm">Details</span>
      </button>

      {/* Mounted only while open. A closed `<dialog>` left in the tree keeps its
          contents in the accessible tree on some engines, and this panel names a
          customer's account handles. */}
      {open ? (
        <Drawer open onClose={() => setOpen(false)} title={label}>
          <div className="space-y-4">
            <p className="type-body text-muted">{blurb}</p>

            <dl className="space-y-3">
              {rows.map((row) => (
                <div key={row.term} className="border-t border-line-soft pt-3">
                  <dt className="type-eyebrow text-muted">{row.term}</dt>
                  {/* `num` on the value: several of these carry counts and day
                      figures, and tabular figures are the house rule for any
                      number a reader might compare against another row. */}
                  <dd className="type-sm num mt-label-gap">{row.detail}</dd>
                </div>
              ))}
            </dl>

            {note ? (
              <p className="rounded-input bg-s2 px-3 py-2.5 type-sm text-muted" role="note">
                {note}
              </p>
            ) : null}
          </div>
        </Drawer>
      ) : null}
    </>
  )
}
