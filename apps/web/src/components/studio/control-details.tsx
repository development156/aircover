'use client'

import { useId, useState } from 'react'
import { Info } from 'lucide-react'

import { Drawer } from '@/components/ui/drawer'

/**
 * ONE "DETAILS" AFFORDANCE PER SETTINGS CONTROL, NOT PER OPTION.
 *
 * ── THE FOUNDER'S RULING, IN CODE ────────────────────────────────────────────
 * On `/connections`, a "Details" button slides the long explanation into a
 * right-hand drawer and leaves the tile itself scannable. On `/studio`, every
 * settings pill used to dump the same wall of prose straight into the page the
 * moment it opened. This is the shared piece that makes the composer's controls
 * behave like the first screen instead of the second: `ModelPicker`'s Model
 * control, and `ComposerPanels`' Approach and Logo controls, each render
 * exactly one of these next to their legend, never one per option inside the
 * list.
 *
 * ── REUSES `Drawer`, DOES NOT REBUILD IT ─────────────────────────────────────
 * Same native `<dialog>` machinery `ChannelDetails` uses: top layer, immune to
 * the `backdrop-filter` containing-block trap (apps/web/CLAUDE.md). This file
 * adds nothing but the trigger and the mount-only-while-open guard.
 */
export function ControlDetails({
  label,
  title,
  children,
  dataGuide,
}: {
  /** What this button is FOR, read by a screen reader with nothing else nearby. */
  label: string
  /** The drawer's own title. */
  title: string
  children: React.ReactNode
  dataGuide?: string
}) {
  const [open, setOpen] = useState(false)
  const buttonId = useId()

  return (
    <>
      <button
        type="button"
        id={buttonId}
        onClick={() => setOpen(true)}
        aria-label={label}
        aria-haspopup="dialog"
        data-guide={dataGuide}
        className="inline-flex items-center gap-1.5 rounded-sm text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--acc)] max-narrow:min-h-[44px]"
      >
        <Info aria-hidden className="size-3.5" />
        <span className="type-sm">Details</span>
      </button>

      {/* Mounted only while open, same reasoning as `ChannelDetails`: a closed
          `<dialog>` left in the tree keeps its contents in the accessible tree
          on some engines. */}
      {open ? (
        <Drawer open onClose={() => setOpen(false)} title={title}>
          {children}
        </Drawer>
      ) : null}
    </>
  )
}
