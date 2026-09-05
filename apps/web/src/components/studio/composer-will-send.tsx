import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'

import type { BrandSignal } from '@sahoda/shared'

import { colorNames } from '@/lib/brand/color-name'

/**
 * "WILL SEND": REFERENCE, NOT A DECISION TAKEN ON EVERY PRESS.
 *
 * Closed by default, behind its own disclosure — `Wall.dc.html`'s own ruling.
 * A permanent block here cost the wall a row of pictures, and what the Brand
 * Brain will add is something to check, not something decided fresh every
 * time the prompt changes. The disclosure follows the page theme; the bar
 * around it is the one thing on this screen that inverts.
 *
 * ── A FIXED LABEL COLUMN, NOT ONE SIZED TO WHATEVER'S LONGEST ────────────
 * `--space-20` (80px, the same spacing ladder every other measurement on
 * this screen uses) is the label track's width, named rather than left as
 * `auto`: an `auto` column reflows to the longest label THIS render happens
 * to have, so the value column starts at a different x depending on which
 * fields a workspace's Brand Brain answered — a grid that only agrees with
 * itself sometimes. Every value then starts at the same x, in every render,
 * because the column that precedes it always measures the same.
 */
export function ComposerWillSend({ signals }: { signals: BrandSignal[] | null }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-2" data-guide="studio-signals">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        aria-controls="studio-signals-detail"
        className="flex w-fit items-center gap-1.5 type-eyebrow text-muted transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <ChevronDown
          className={`size-[12px] shrink-0 transition-micro ${open ? 'rotate-180' : ''}`}
          aria-hidden
        />
        Will send
      </button>
      {open ? (
        <div id="studio-signals-detail" className="flex flex-col gap-2">
          {signals === null ? (
            <p className="type-sm text-muted">
              Sahoda could not read your Brand Brain just now, so it cannot show what it would add.
              The picture can still be drawn.
            </p>
          ) : signals.length === 0 ? (
            <p className="type-sm text-muted">
              Nothing from your Brand Brain. Fill it in and pictures start looking like your
              business rather than generic.
            </p>
          ) : (
            <>
              {/*
               * ── WHAT THE DOT MEANS, IN WORDS ──────────────────────────
               * Read `stampNote`-style: the mark beside each field is a real
               * distinction (confirmed vs guessed), already spoken to a
               * screen reader below (", which you confirmed" / ", which
               * Sahoda guessed") but never spelled out for a sighted reader,
               * who saw a solid dot beside one field and a hollow one beside
               * another with no way to decode either. This states the same
               * claim in words instead of deleting the mark.
               */}
              <p className="type-sm text-muted">
                A filled dot means you confirmed it. A hollow one means Sahoda guessed it from what
                it has read.
              </p>
              <dl className="grid grid-cols-[var(--space-20)_1fr] items-baseline gap-x-3 gap-y-2">
                {signals.map((signal) => {
                  // The one leaf that is colour, and the reason this file exists:
                  // `signal.value` here is raw theme notation (`oklch(...)`,
                  // comma-joined), and printing it is the exact defect being
                  // fixed. A colour is painted, never spelled.
                  const swatches =
                    signal.field === 'colours'
                      ? signal.value.split(', ').filter((c) => c !== '')
                      : null
                  return (
                    <Fragment key={signal.field}>
                      <dt className="flex items-center gap-1.5 whitespace-nowrap type-sm text-muted">
                        <span
                          aria-hidden
                          className={`size-[6px] shrink-0 rounded-full ${
                            signal.certainty === 'confirmed' ? 'bg-primary' : 'surface-ring-firm'
                          }`}
                        />
                        {signal.field.length === 0
                          ? signal.field
                          : signal.field[0]!.toUpperCase() + signal.field.slice(1)}
                      </dt>
                      <dd className="flex min-w-0 items-baseline gap-1.5">
                        {swatches === null ? (
                          <span className="line-clamp-2 type-sm text-ink">{signal.value}</span>
                        ) : (
                          <span className="flex flex-wrap items-center gap-1">
                            {swatches.map((colour, at) => (
                              <span
                                key={`${colour}-${at}`}
                                aria-hidden
                                style={{ background: colour }}
                                /*
                                 * ── A RING THAT SHOWS AGAINST ANY FILL, INCLUDING WHITE ──
                                 * `surface-ring` (`--line-soft`, 5% black) is right for a
                                 * card, wrong for a swatch: a brand colour close to the
                                 * canvas rendered white on white with no visible edge at
                                 * all. `--line-firm` is an ALPHA overlay (28% black in
                                 * light, 30% white in dark), so it darkens or lightens
                                 * whatever colour sits under it instead of trying to
                                 * out-contrast a fixed hex against an unknown one — the
                                 * same class of fix `apps/web/CLAUDE.md` documents for
                                 * dark accent-on-tint, applied here to a swatch rather
                                 * than a badge. Checked in both themes.
                                 */
                                className="size-[13px] shrink-0 rounded-sm shadow-[inset_0_0_0_1px_var(--line-firm)]"
                              />
                            ))}
                            <span className="sr-only">{colorNames(swatches).join(', ')}</span>
                          </span>
                        )}
                        <span className="sr-only">
                          {signal.certainty === 'confirmed'
                            ? ', which you confirmed'
                            : ', which Sahoda guessed'}
                        </span>
                      </dd>
                    </Fragment>
                  )
                })}
              </dl>
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
