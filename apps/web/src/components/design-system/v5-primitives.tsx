'use client'

import { useId, useState } from 'react'

/**
 * The primitives v5 adds, and the two the reference is built out of.
 *
 * ── NO INVENTED NUMBERS, INCLUDING HERE ──────────────────────────────────────
 * The reference's dashboards are full of confident figures. This product may
 * never render one it cannot prove, and a primitive rack is not an exemption:
 * a specimen stat card showing a plausible "12,480 reach" is a fabricated
 * figure whether or not it sits on /design-system, and it teaches the next
 * session that inventing one is fine.
 *
 * So the stat card ships in BOTH of its real states and the demonstration one
 * is labelled as such:
 *
 *   · NOT YET MEASURED — the slot is real, the reading has not arrived. This is
 *     the state every account is in for its first hour, which makes it the
 *     most-seen version of this component in the product and the one most
 *     likely never to have been designed.
 *   · MEASURED — carries a figure, and says where it came from.
 *
 * The sparkline is drawn from the same series the label quotes, so the picture
 * and the number cannot disagree.
 */

/** Demonstration series. Declared once so the line and the delta share it. */
const DEMO_SERIES = [4, 6, 5, 9, 8, 12, 11, 15, 14, 18, 17, 21]

function sparkPath(values: readonly number[], w: number, h: number): string {
  if (values.length < 2) return ''
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w
      const y = h - ((v - min) / span) * h
      return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}

function Sparkline({ values, label }: { values: readonly number[]; label: string }) {
  const w = 120
  const h = 28
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={label}
      className="overflow-visible"
      /* The one place the accent is spent on this card, and it is spent on the
         shape of the measured quantity — which is exactly what the reference
         spends its own accent on. */
      style={{ color: 'var(--brand)' }}
    >
      <path
        d={sparkPath(values, w, h)}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

export function V5Primitives() {
  return (
    <div className="grid gap-8">
      <StatCards />
      <Segmented />
      <Feedback />
    </div>
  )
}

/* ── Stat card ─────────────────────────────────────────────────────────────── */

function StatCards() {
  return (
    <div>
      <h3 className="type-h3 mb-1">Stat card</h3>
      <p className="type-meta mb-3 max-w-prose text-muted">
        One large number, a small label above it, and a sparkline beneath. It is the
        reference&rsquo;s most-repeated object. It ships in both of its real states, because the
        empty one is what every account sees for its first hour. The figures on the right-hand card
        are DEMONSTRATION DATA and the card says so; this product never renders a number it cannot
        prove.
      </p>
      <div className="grid grid-cols-2 gap-4 max-narrow:grid-cols-1">
        {/* 1 · NOT YET MEASURED. The slot is real; the reading has not arrived.
            The absence mark carries an accessible name — a rule with no name is
            a decoration a screen reader skips, which makes the absence
            invisible rather than legible. */}
        <div className="surface-ring rounded-lg bg-surface p-5">
          <p className="type-eyebrow text-muted">Reach</p>
          <p className="type-hero-num num mt-2">
            <span className="is-unmeasured" role="img" aria-label="Not measured yet" />
          </p>
          <p className="type-meta mt-2 text-muted">Connect a channel to start measuring.</p>
          <div className="mt-3 h-[28px]" aria-hidden />
        </div>

        {/* 2 · MEASURED, and it says where the figure came from. */}
        <div className="surface-ring rounded-lg bg-surface p-5">
          <div className="flex items-start justify-between gap-3">
            <p className="type-eyebrow text-muted">Reach</p>
            <span className="is-simulated type-chip rounded-sm px-2 py-1">Demonstration</span>
          </div>
          <p className="type-hero-num num mt-2">21</p>
          <p className="type-meta mt-2 text-muted">Last 12 days · demonstration series</p>
          <div className="mt-3">
            <Sparkline values={DEMO_SERIES} label="Demonstration series, 12 points, rising" />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Segmented control ─────────────────────────────────────────────────────── */

const RANGES = ['7 days', '30 days', '12 months'] as const

function Segmented() {
  const [active, setActive] = useState<string>(RANGES[1])
  const name = useId()
  return (
    <div>
      <h3 className="type-h3 mb-1">Segmented control</h3>
      <p className="type-meta mb-3 max-w-prose text-muted">
        A floating pill, the way the reference draws it: a soft well holding one raised, opaque
        selection. It is a RADIO GROUP, not a row of buttons. The options are mutually exclusive and
        a screen reader has to be told that, or it announces three unrelated controls.
      </p>
      <div
        role="radiogroup"
        aria-label="Reporting window"
        className="inline-flex gap-1 rounded-full bg-s2 p-1"
      >
        {RANGES.map((r) => {
          const selected = r === active
          return (
            <label
              key={r}
              className={[
                'type-chip cursor-pointer rounded-full px-4 py-2 transition-micro',
                'max-narrow:min-h-[44px] max-narrow:inline-flex max-narrow:items-center',
                selected ? 'bg-surface text-ink shadow-card' : 'text-muted hover:text-ink',
              ].join(' ')}
            >
              <input
                type="radio"
                name={name}
                value={r}
                checked={selected}
                onChange={() => setActive(r)}
                className="sr-only"
              />
              {r}
            </label>
          )
        })}
      </div>
    </div>
  )
}

/* ── Badge, empty, error, toast ────────────────────────────────────────────── */

function Feedback() {
  return (
    <div className="grid gap-6">
      <div>
        <h3 className="type-h3 mb-1">Badge</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          A badge states a FACT about the thing it sits on. It borrows the Certainty System&rsquo;s
          fill weights rather than inventing a second ladder, so a badge and a status chip cannot
          drift apart.
        </p>
        <div className="flex flex-wrap gap-2">
          <span className="is-real type-chip rounded-full px-3 py-1">Published</span>
          <span className="is-committed type-chip rounded-full px-3 py-1">Scheduled</span>
          <span className="is-proposed type-chip rounded-full px-3 py-1">Drafted by Sahoda</span>
          <span className="is-simulated type-chip rounded-full px-3 py-1">Not a real send</span>
        </div>
      </div>

      <div>
        <h3 className="type-h3 mb-1">Empty state</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          An invitation to act, never a shrug. It says what will appear here and offers the one
          control that makes it appear. &ldquo;No data&rdquo; is not an empty state. And ONE absence
          gets ONE statement. Five cards each discovering the same emptiness is the defect this rule
          exists for.
        </p>
        <div className="surface-ring grid gap-3 rounded-lg bg-surface p-8 text-center">
          <p className="type-h3">No posts yet</p>
          <p className="type-sm mx-auto max-w-prose text-muted">
            Anything you write or approve shows up here, with the channels it went to.
          </p>
          <div>
            <button
              type="button"
              className="type-chip rounded-full bg-primary px-4 py-2 text-primary-foreground transition-micro hover:bg-primary-strong hover:text-white max-narrow:min-h-[44px]"
            >
              Write a post
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="type-h3 mb-1">Error state</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          Errors do not apologise and are never vague. They say what happened and what to do, in the
          interface&rsquo;s voice. Note the CLAIM: &ldquo;we asked and got nothing&rdquo; is a
          different sentence from &ldquo;you have nothing&rdquo;, and the two must never render the
          same.
        </p>
        <div className="surface-ring grid gap-3 rounded-lg bg-surface p-5">
          <p className="type-h3">
            <span className="is-unreadable mr-2" role="img" aria-label="Could not read" />
            Sahoda could not reach your accounts
          </p>
          <p className="type-sm max-w-prose text-muted">
            The last try was two minutes ago. Nothing was charged. Your posts and schedule are
            unaffected.
          </p>
          <div>
            <button
              type="button"
              className="type-chip surface-ring-firm rounded-full px-4 py-2 transition-micro hover:bg-surface-3 max-narrow:min-h-[44px]"
            >
              Try again
            </button>
          </div>
        </div>
      </div>

      <div>
        <h3 className="type-h3 mb-1">Toast</h3>
        <p className="type-meta mb-3 max-w-prose text-muted">
          Chrome, so it may be glass. An action keeps its name through the whole flow: the button
          that says <em>Publish</em> produces a toast that says <em>Published</em>.
        </p>
        <div className="glass surface-ring inline-flex items-center gap-3 rounded-xl px-4 py-3">
          <span className="blade" aria-hidden />
          <span className="type-sm">Published to Instagram and LinkedIn</span>
        </div>
      </div>
    </div>
  )
}
