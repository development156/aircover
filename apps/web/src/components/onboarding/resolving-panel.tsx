'use client'

import { useEffect, useState } from 'react'

/**
 * What the resolve is working on, while it works on it.
 *
 * MEASURED: `brand_guidelines` p50 19.1s, p90 24.0s in production. That was
 * nineteen seconds behind a button that said "Resolving…" and nothing else,
 * which is long enough for a person to conclude it has hung and reload — losing
 * the answers they just typed.
 *
 * WHAT THIS IS NOT. It is not a progress bar. There is no percentage, no bar
 * filling, and no claim that a section is FINISHED — because the resolve is a
 * single model call and the server genuinely does not know which part of the
 * answer exists yet. Inventing that would be the fake progress this codebase
 * keeps refusing to ship.
 *
 * WHAT IT IS. The six things the model is being asked to produce, taken from
 * the output schema itself, with the highlight moving through them so the
 * screen is alive; the REAL elapsed seconds; and the measured typical duration
 * so the number has something to mean. Every word is true: these sections are
 * what `BrandMemoryPayloadSchema` requires, and the clock is a clock.
 *
 * Per-section truth would need the model's tokens streamed and parsed as they
 * arrive — real, and a bigger change to a charged path than this screen needs.
 */

/** In the order the schema lists them, which is the order the model writes them. */
const SECTIONS = [
  { label: 'Voice', hint: 'how every caption sounds' },
  { label: 'Brand persona', hint: 'who the brand is when it speaks' },
  { label: 'Customer persona', hint: 'who it is speaking to' },
  { label: 'Hook', hint: 'the promise each post leans on' },
  { label: 'Red lines', hint: 'what it must never say' },
  { label: 'Signal lock', hint: 'how sure we are' },
] as const

/** Production p50 for `brand_guidelines`, 2026-08-12. Not a guess. */
const TYPICAL_SECONDS = 19

export function ResolvingPanel({ isFree }: { isFree: boolean }) {
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const started = Date.now()
    const id = setInterval(() => setElapsed(Math.round((Date.now() - started) / 1000)), 250)
    return () => clearInterval(id)
  }, [])

  // Which section the highlight is sitting on. Decorative and stated as such —
  // it paces off the measured typical, never off any claim about the model.
  const cursor = Math.min(
    SECTIONS.length - 1,
    Math.floor((elapsed / TYPICAL_SECONDS) * SECTIONS.length),
  )
  const overdue = elapsed > TYPICAL_SECONDS * 2

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-col gap-3 rounded-card border border-line bg-s1 p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-[14px] font-semibold text-ink">Working out your brand</p>
        <p className="text-[12.5px] text-muted">
          <span className="num">{elapsed}s</span> · usually about{' '}
          <span className="num">{TYPICAL_SECONDS}s</span>
        </p>
      </div>

      <ul className="flex flex-col gap-1.5">
        {SECTIONS.map((section, index) => {
          const active = index === cursor
          const passed = index < cursor
          return (
            <li
              key={section.label}
              className={[
                'flex items-center gap-2.5 rounded-input px-2.5 py-1.5 transition-micro',
                active ? 'bg-tint-50 dark:bg-s2' : '',
              ].join(' ')}
            >
              <span
                aria-hidden
                className={[
                  'size-1.5 shrink-0 rounded-full',
                  active ? 'animate-pulse bg-accent' : passed ? 'bg-accent/40' : 'bg-line',
                ].join(' ')}
              />
              <span
                className={[
                  'text-[13px]',
                  active ? 'font-semibold text-ink' : passed ? 'text-ink' : 'text-muted',
                ].join(' ')}
              >
                {section.label}
              </span>
              <span className="text-[12px] text-muted">{section.hint}</span>
            </li>
          )
        })}
      </ul>

      <p className="text-[12.5px] text-muted">
        {isFree
          ? 'This one is free. Nothing is charged until you approve it.'
          : 'You are only charged for a real result. A sample or a failure costs nothing.'}
      </p>

      {overdue ? (
        <p className="text-[12.5px] text-warn">
          This is taking longer than usual. It is still going, and it will say so either way.
          Leaving this page is what would lose it.
        </p>
      ) : null}
    </div>
  )
}
