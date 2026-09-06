'use client'

import type { Route } from 'next'
import Link from 'next/link'
import { createPortal } from 'react-dom'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Search } from 'lucide-react'

import { ALL_SECTIONS } from '@/lib/nav/sections'
import { panelShift, panelWidthFor } from '@/lib/shell/palette-anchor'
import { cn } from '@/lib/utils'

/**
 * The header search, and the palette behind it.
 *
 * NAVIGATION ONLY. It moves between routes the nav already exposes and reads no
 * data — deliberately, so the shell's search box cannot become a surface that
 * has to be kept honest against the database. If it ever needs to find a post
 * or a conversation, that is a data change and belongs to a different pass.
 *
 * No `cmdk` dependency: this is a filtered list and a keydown handler, and the
 * kit ships its own visual language for both. Adding a component library to
 * render twelve links would be the larger change, not the smaller one.
 */

type Destination = { href: Route; label: string; hint: string; soon?: boolean }

/**
 * PROJECTED FROM `lib/nav/sections.ts`, not hand-written.
 *
 * ── WHY IT USED TO BE A SECOND LIST, AND WHY THAT WAS THE BUG ────────────────
 * This array was maintained by hand beside the rail's, and it carried a comment
 * explaining that `/sites` was "deliberately absent, for the same reason it is
 * absent from the rail". That comment is the tell: it existed only because two
 * lists could disagree, and keeping them in step was a rule somebody had to
 * remember. Twenty-one sections is more than anybody remembers.
 *
 * Now there is one map and this reads it. A section cannot be in the menu and
 * missing from search, or the reverse.
 *
 * ── UNBUILT SECTIONS ARE SEARCHABLE, AND MARKED ─────────────────────────────
 * Someone typing "playbooks" has a question, and "no results" answers it with
 * silence — they conclude the app cannot do it, when the truth is that it will.
 * The row appears, carries the same "Soon" word the rail uses, and lands on a
 * screen that says the same thing at length.
 */
const DESTINATIONS: readonly Destination[] = [
  // Creation is the reference's first-class command: the + button, C and ⌘K
  // all open it, so it leads the list rather than sitting under Posts. It is not
  // a nav SECTION — it has no rail item — so it is written here rather than
  // added to the map for the sake of this one list.
  { href: '/create', label: 'Create', hint: 'Start something new' },
  ...ALL_SECTIONS.map((section) => ({
    href: section.href,
    label: section.label,
    hint: section.hint,
    soon: section.state === 'soon',
  })),
]

/** The stylesheet's own cap, so the derived width can never exceed it. */
const PANEL_MAX = 520

/**
 * How far tokens.css's unlayered `:focus-visible` ring extends beyond its box —
 * `outline: 2px` at `outline-offset: 2px`, plus a 4px shadow spread.
 */
const RING_OVERHANG = 4

function matches(d: Destination, q: string): boolean {
  const needle = q.trim().toLowerCase()
  if (needle === '') return true
  return d.label.toLowerCase().includes(needle) || d.hint.toLowerCase().includes(needle)
}

export function CommandPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  // The TRIGGER's own element, not whatever had focus. `returnFocusRef` holds the
  // latter and is deliberately different: ⌘K can be pressed from anywhere, and
  // aligning the panel to a text field the reader happened to be typing in would
  // be worse than not aligning it at all.
  const triggerRef = useRef<HTMLButtonElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [shiftX, setShiftX] = useState(0)
  const [panelWidth, setPanelWidth] = useState<number | null>(null)
  // Results are real anchors, and Enter activates the highlighted one through
  // its own ref rather than through `useRouter`. Two reasons, in order:
  // middle-click, ⌘-click and "copy link address" all keep working; and the
  // component stays renderable without an app-router provider, which is what
  // lets Topbar be unit-tested in isolation at all.
  const linkRefs = useRef<Array<HTMLAnchorElement | null>>([])

  const results = useMemo(() => DESTINATIONS.filter((d) => matches(d, query)), [query])

  // Clamp rather than reset: filtering down to fewer results must not silently
  // leave the cursor pointing past the end, which would make Enter a no-op.
  const active = results.length === 0 ? -1 : Math.min(cursor, results.length - 1)

  // Where focus was when the palette opened, so closing can put it back.
  const returnFocusRef = useRef<HTMLElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setCursor(0)
    // MEASURED before this: Escape closed the palette and left focus on <body>,
    // so a keyboard user was dropped at the top of the document and had to tab
    // back through the whole rail to get anywhere. The workspace switcher beside
    // it already restores focus to its trigger; this is the same contract.
    // Deferred a frame because the trigger is only re-rendered as focusable once
    // the overlay has gone.
    const target = returnFocusRef.current
    if (target) requestAnimationFrame(() => target.focus())
  }, [])

  // ⌘K / Ctrl+K, and Escape, from anywhere. Both are bound on the document
  // because the point of a global shortcut is that it works while focus is
  // somewhere else — and Escape especially: bound to the input alone it stops
  // working the moment the user tabs to a result, which is exactly when someone
  // reaching for Escape most expects it to fire.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        setOpen((wasOpen) => {
          // Capture the trigger on the way IN so `close` can hand focus back.
          if (!wasOpen) returnFocusRef.current = document.activeElement as HTMLElement | null
          return !wasOpen
        })
      }
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [close])

  /**
   * ALIGN THE PANEL WITH THE FIELD THAT OPENED IT.
   *
   * `useLayoutEffect`, not `useEffect`: this runs before paint, so the panel is
   * never shown at the wrong place and then jumped. A visible jump on every open
   * is a worse defect than the offset it corrects.
   *
   * Re-measured on resize because the rail's width is a runtime fact — three
   * widths, and the reader can collapse it — so the content column's centre moves
   * and no constant tracks it. See `palette-anchor.ts`.
   */
  useLayoutEffect(() => {
    if (!open) return
    function measure() {
      const trigger = triggerRef.current
      const panel = panelRef.current
      if (!panel) return
      const box = trigger?.getBoundingClientRect()
      // A hidden trigger (`max-narrow:hidden`) measures as a zero-width box, and
      // that is NOT the same as being at x=0 — treating it as a position would
      // slam the panel into the left edge on every phone.
      const centre = box && box.width > 0 ? box.left + box.width / 2 : null

      // WIDTH FIRST, THEN THE SHIFT, and both from the TRIGGER rather than from
      // each other. The shift needs the panel's width, and the width now depends
      // on the trigger — reading the panel's laid-out width here would feed the
      // previous frame's answer back into this one.
      const wanted = panelWidthFor({
        triggerWidth: box && box.width > 0 ? box.width : null,
        // `p-4` around the field, and the ring's overhang. Named rather than
        // read from computed style, which would make this depend on the panel
        // having been painted already. 16, not the 10 it was: with the field
        // running to the panel's right edge, a 10px pad left the ring 6px
        // inside a 28px corner that needs 10.7px there (run 34017127220,
        // both themes). At 16 the ring sits 12px inside, where the arc is 5px.
        pad: 16,
        ringOverhang: RING_OVERHANG,
        max: PANEL_MAX,
      })
      setPanelWidth(wanted)

      setShiftX(
        panelShift({
          triggerCenterX: centre,
          panelWidth: wanted ?? panel.getBoundingClientRect().width,
          viewportWidth: window.innerWidth,
          // The overlay's own `p-4`. Named here rather than read back out of the
          // computed style: it is the same 16px either way, and a style read would
          // make this depend on the panel having been painted already.
          pad: 16,
        }),
      )
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
  }, [open])

  // Escape is NOT handled here — the document listener owns it, so it fires
  // wherever focus happens to be.
  function onInputKey(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      return setCursor((c) => (results.length === 0 ? 0 : (c + 1) % results.length))
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      return setCursor((c) =>
        results.length === 0 ? 0 : (c - 1 + results.length) % results.length,
      )
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      linkRefs.current[active]?.click()
    }
  }

  return (
    <>
      {/* The trigger. A button that looks like a field, because it opens a
          dialog rather than accepting text in place — an actual <input> here
          would promise inline search it does not do. */}
      <button
        ref={triggerRef}
        type="button"
        onClick={(event) => {
          returnFocusRef.current = event.currentTarget
          setOpen(true)
        }}
        data-guide="topbar.search"
        className="surface-ring flex h-control w-full min-w-0 max-w-[460px] shrink items-center gap-2 rounded-input bg-s2 px-3 text-left text-[13px] text-muted transition-micro hover:shadow-[inset_0_0_0_1px_var(--line)] max-narrow:hidden"
      >
        <Search size={15} className="shrink-0" aria-hidden />
        <span className="truncate">Search Sahoda</span>
        {/* A key cap needs an EDGE, and it had none. `bg-surface` inside this
            `bg-s2` field is 1.04:1 on light and, before --surface-2 was given a
            real dark value, was the field's exact colour in dark — so the ⌘K
            hint rendered as two bare glyphs on 78 of the frames it appears in.
            A ring rather than a heavier fill: a key cap reads as a key because
            of its outline, not because of how bright it is. */}
        <kbd className="surface-ring-firm ml-auto shrink-0 rounded-sm bg-surface px-[5px] py-[1px] text-[11px] font-medium text-muted">
          ⌘K
        </kbd>
      </button>

      {/*
        THROUGH A PORTAL TO <body>, AND THAT IS A BUG FIX RATHER THAN TIDYING.

        ── THE DEFECT ──────────────────────────────────────────────────────────
        `<CommandPalette />` is rendered INSIDE `<header className="glass">`
        (topbar.tsx), and `glass` sets `backdrop-filter`. An element with a
        `backdrop-filter` other than `none` becomes a CONTAINING BLOCK for every
        descendant, INCLUDING `position: fixed` ones. So `fixed inset-0` here
        never meant the viewport — it meant the topbar.

        MEASURED in Chromium against the shipped stylesheet, viewport 1879x1007,
        header 60px tall, `backdrop-filter: blur(20px) saturate(1.6)`:

          palette inside the header   overlay box  1834 x 137  at (45, 0)
          palette at <body>           overlay box  1879 x 1007 at (0, 0)

        The scrim therefore covered a STRIP ACROSS THE TOP and the page beneath
        was never dimmed at all. Reported as three separate defects — a "black
        background bug" (that strip), "no difference contrast in background and
        foreground" (an undimmed page under a floating panel), and a panel that
        would not line up — and all three are this one fact.

        ── WHY IT SURVIVED THREE PASSES ────────────────────────────────────────
        Every earlier reproduction rendered the palette at body level, so every
        measurement of the scrim, the panel fill and the anchor was taken in a
        DOM that did not have this trap in it. The numbers were right about the
        markup they were given and the markup was wrong.

        A portal is the fix rather than removing `glass` from the topbar: the
        blur there is deliberate and is the reference design's, and an overlay
        does not belong inside a header regardless.
      */}
      {open && typeof document !== 'undefined'
        ? createPortal(
            <div
              data-palette-overlay
              /**
               * `bg-[var(--scrim)]`, NOT `bg-ink/30`. Same ruling `modal.tsx` carries
               * at its own backdrop, and this was the one overlay in the app that
               * ignored it.
               *
               * ── WHAT `bg-ink/30` ACTUALLY PAINTED ──────────────────────────────
               * MEASURED 2026-08-25 in Chromium against the real tokens:
               *
               *   light  page rgb(250) -> rgb(175). Dimmer, but 30% where the token
               *          says 40%.
               *   dark   `--ink` IS `#ffffff`. The overlay was WHITE at 30% and it
               *          LIT the page: rgb(13) -> rgb(86), luminance 0.004 -> 0.093,
               *          a 23x lift. The page ended up BRIGHTER than the panel over
               *          it, so the palette read as a hole punched in a page that had
               *          just been washed out. An inverted scrim is worse than none.
               *
               * And the compiled CSS carries a second, worse rule. Tailwind emits an
               * alpha utility as a PAIR:
               *
               *   .bg-ink\/30{background-color:var(--ink)}
               *   @supports (color:color-mix(in lab,red,red)){ .bg-ink\/30{…30%…} }
               *
               * so a browser without `color-mix` got a FULLY OPAQUE viewport-filling
               * rectangle — solid black on light, solid white on dark. That is the
               * black background this was reported as, and it is the same shape as
               * the `glass` fallback fixed the day before: a declaration nobody
               * checked because the supported path looked right.
               *
               * `--scrim` is a plain `rgb(0 0 0 / a)` in both themes. One rule, no
               * `@supports` pair, no theme inversion, nothing to get wrong.
               */
              className="fixed inset-0 z-40 flex items-start justify-center bg-[var(--scrim)] p-4 pt-[12vh]"
              onClick={close}
              role="presentation"
            >
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-label="Search Sahoda"
                onClick={(event) => event.stopPropagation()}
                // A TRANSFORM, not a margin or a left. The panel is already centred by
                // the overlay's flexbox; a transform moves the painted result without
                // touching that layout, so the width this was measured from cannot
                // change underneath it and the measurement cannot feed itself.
                style={{
                  ...(shiftX === 0 ? {} : { transform: `translateX(${shiftX}px)` }),
                  // Null leaves `max-w-[520px]` in charge, which is right when
                  // there is no trigger to match.
                  ...(panelWidth === null ? {} : { maxWidth: `${panelWidth}px` }),
                }}
                /**
                 * OPAQUE, not `glass`, and this is a deliberate departure from
                 * docs/37, which lists the command palette among the surfaces glass
                 * is ALLOWED on.
                 *
                 * The rest of that list is chrome you look past — a topbar, a rail,
                 * a bottom bar. This is a list of destinations you have to READ, and
                 * it floats over whatever screen you opened it from. Glass only
                 * stays legible there while `backdrop-filter` is actually blurring
                 * the page underneath, and MEASURED 2026-08-25 it was not: the rows
                 * behind the panel read sharply through it, word for word.
                 *
                 * The `@supports` guard added to `glass` on the same day fixes the
                 * case where a browser does not SUPPORT the property. It cannot help
                 * where a browser supports it and the effect still does not land —
                 * an extension, a GPU fallback, a compositing setting. Legibility of
                 * a menu must not depend on a GPU effect arriving.
                 *
                 * `shadow-lg` and the ring do the lifting instead: the panel reads
                 * as floating because of its edge and its shadow, not because the
                 * page shows through it.
                 *
                 * ── AND IN DARK THE FILL CANNOT DO IT, SO THE EDGE MUST ──────────
                 * `dark:bg-surface-3`, not `bg-surface` in both. MEASURED against
                 * the real tokens with the scrim corrected:
                 *
                 *   light  panel #ffffff over a scrimmed rgb(150)  2.96:1
                 *   dark   panel --surface rgb(23) over rgb(5)     1.14:1
                 *          panel --surface-3 rgb(41) over rgb(5)   1.40:1
                 *
                 * Darkening the page harder cannot help in dark — black minus more
                 * black is still black — so the panel climbs to the TOP of the
                 * elevation ladder instead, which is what `--surface` already is in
                 * light. Even then 1.40:1 is a step, not a separation, which is why
                 * `surface-ring-firm` replaced `surface-ring`: apps/web/CLAUDE.md's
                 * standing rule is that anything which must read as a distinct
                 * object in dark carries its own edge, because the fills are 1.04:1
                 * apart and cannot.
                 */
                className="surface-ring-firm w-full max-w-[520px] overflow-hidden rounded-xl bg-surface shadow-lg dark:bg-surface-3"
              >
                {/*
              THE SEARCH ROW IS INSET, AND THAT IS A BUG FIX RATHER THAN A STYLE.

              tokens.css paints `:focus-visible` UNLAYERED — a 2px outline at 2px
              offset plus a 4px shadow spread, so 4px beyond the focused box on
              every side — which outranks the `outline-none` this input used to
              carry. That class removed nothing; it only made the source read as
              though it had.

              The input is also focused the whole time the palette is open, so
              that ring is not a focus state a reader sees arrive. It is simply
              part of the panel, permanently, and it has to sit somewhere sane.

              MEASURED with the old full-bleed 46px input in a 12px-padded row:
              the ring's top edge landed 4px ABOVE the panel's own top edge, and
              `--r-xl` is 28px, so it cut straight across the rounded corner and
              the divider. Inset at 16px it sits 12px inside the top and the
              right, where the 28px corner needs 5px.
            */}
                <div className="p-4">
                  {/*
                    THE ICON IS OUT OF FLOW, AND THAT IS WHAT MAKES THE PILL LINE
                    UP. It used to be a flex sibling, so it pushed the input
                    rightward inside the row. MEASURED: the focus ring then sat
                    10px past the trigger on the left and 33px past it on the
                    right — the same control, off by a different amount at each
                    end.

                    Out of flow, the input spans the panel's padded width, so the
                    ring is symmetric about the panel's centre. `panelShift` puts
                    that centre on the trigger and `panelWidthFor` makes the two
                    widths equal; the boxes then coincide.

                    `pointer-events-none` because a click on the magnifier should
                    land in the field it decorates, not on nothing.
                  */}
                  <div className="relative">
                    <Search
                      size={15}
                      aria-hidden
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted"
                    />
                    <input
                      ref={inputRef}
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value)
                        setCursor(0)
                      }}
                      onKeyDown={onInputKey}
                      placeholder="Go to…"
                      aria-label="Search destinations"
                      className="h-9 w-full rounded-input border border-line bg-bg pl-8 pr-3 type-sm text-ink placeholder:text-muted"
                    />
                  </div>
                </div>

                {results.length === 0 ? (
                  /* An empty state that says what it searched, not just "no
                 results" — otherwise the user cannot tell a typo from a
                 surface that was never searchable. */
                  <p className="px-3 py-6 text-center text-[13px] text-muted">
                    Nothing here matches “{query.trim()}”. This searches pages, not content.
                  </p>
                ) : (
                  <ul className="max-h-[320px] overflow-y-auto px-2.5 pb-2.5">
                    {results.map((destination, index) => (
                      <li key={destination.href}>
                        <Link
                          href={destination.href}
                          ref={(node) => {
                            linkRefs.current[index] = node
                          }}
                          onClick={close}
                          onMouseEnter={() => setCursor(index)}
                          aria-current={index === active ? 'true' : undefined}
                          className={cn(
                            'flex h-[38px] w-full items-center gap-3 rounded-sm px-[9px] text-left text-[13px] transition-micro',
                            // Ink on the wash, as the rail's active row: accent
                            // on --t50 is 2.75:1 (tokens.css).
                            index === active ? 'bg-brand-wash text-ink' : 'text-ink-body',
                          )}
                        >
                          <span className="font-medium">{destination.label}</span>
                          <span className="min-w-0 flex-1 truncate text-[12px] text-muted">
                            {destination.hint}
                          </span>
                          {/* The same word the rail and the phone sheet use. A
                          searchable roadmap section must say so in the result,
                          or the reader follows it expecting a working feature. */}
                          {destination.soon ? (
                            <>
                              <span aria-hidden className="type-eyebrow flex-none text-muted">
                                Soon
                              </span>
                              <span className="sr-only">, not built yet</span>
                            </>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  )
}
