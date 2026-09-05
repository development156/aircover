import { Fragment, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import Link from 'next/link'

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
 */
export function ComposerWillSend({ signals }: { signals: BrandSignal[] | null }) {
  const [open, setOpen] = useState(false)

  return (
    <div className="flex flex-col gap-1.5" data-guide="studio-signals">
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
        <div id="studio-signals-detail" className="flex flex-col gap-1.5">
          {/* ── A REMEDY ONLY WHERE ONE WORKS ──────────────────────────────
              Offered for the two answers a person can act on: a brain with
              things in it, where the work is confirming the guesses, and an
              empty one, where the work is filling it. NOT offered when the
              read FAILED, because opening the brain is not what fixes a read
              that could not be made. `no-impossible-remedy.spec.ts` is the
              standing rule this follows. (wt-jiban's card, kept inside the
              closed disclosure the founder ruled for on 2026-09-04.) */}
          {signals === null ? null : (
            <Link
              href="/brain"
              className="w-fit type-sm text-muted underline underline-offset-2 transition-micro hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              Open your Brand Brain
            </Link>
          )}
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
            <dl className="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1.5">
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
                              className="surface-ring size-[13px] shrink-0 rounded-sm"
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
          )}
        </div>
      ) : null}
    </div>
  )
}
