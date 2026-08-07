import { CircleDot, Clock, HelpCircle, Rocket, UserRound } from 'lucide-react'

import type { Freshness } from '@/lib/ops/freshness'
import type { HeroCard } from '@/lib/ops/hero'
import type { UnprovenClaim } from '@/lib/ops/cannot-prove'
import type { WaitingOn } from '@/lib/ops/waiting'
import { cn } from '@/lib/utils'

/**
 * The panels inside the hero card (SL-062 §1). Presentational only — every
 * value arrives already computed, so nothing here can disagree with the tests.
 *
 * Each panel says something specific rather than rendering nothing when it is
 * empty: "nothing shipped in the last seven days" is a real and important
 * answer, and an absent panel would read as an unasked question.
 */

export function Panel({
  title,
  icon: Icon,
  red = false,
  children,
}: {
  title: string
  icon: typeof Rocket
  red?: boolean
  children: React.ReactNode
}) {
  return (
    <section
      className={cn(
        'rounded-input border p-3',
        red ? 'border-danger/40 bg-danger-bg' : 'border-line bg-s1',
      )}
    >
      <h3
        className={cn(
          'flex items-center gap-1.5 text-[12px] font-semibold',
          red ? 'text-danger' : 'text-ink',
        )}
      >
        <Icon size={13} strokeWidth={2} aria-hidden className="shrink-0" />
        {title}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

const EMPTY = 'text-[12px] text-muted'

export function ShippedPanel({ cards }: { cards: readonly HeroCard[] }) {
  return (
    <Panel title="What shipped this week" icon={Rocket}>
      {cards.length === 0 ? (
        <p className={EMPTY}>Nothing reached Done in the last seven days.</p>
      ) : (
        <ul className="space-y-1.5">
          {cards.slice(0, 6).map((card) => (
            <li key={card.code} className="text-[12px] leading-[17px] text-ink">
              {card.headline}
            </li>
          ))}
          {cards.length > 6 ? (
            <li className="text-[12px] text-muted tabular-nums">and {cards.length - 6} more</li>
          ) : null}
        </ul>
      )}
    </Panel>
  )
}

export function BlockedPanel({ cards }: { cards: readonly HeroCard[] }) {
  // Red whenever there IS anything, never conditional on a collapse (§5).
  return (
    <Panel title="What is blocked, and why" icon={CircleDot} red={cards.length > 0}>
      {cards.length === 0 ? (
        <p className={EMPTY}>Nothing is blocked.</p>
      ) : (
        <ul className="space-y-2">
          {cards.map((card) => (
            <li key={card.code} className="text-[12px] leading-[17px]">
              <a
                href={`#task-${card.code}`}
                className="font-medium text-ink underline decoration-line underline-offset-2 transition-micro hover:decoration-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {card.headline}
              </a>
              {/* A blocked card with no reason says so. Silence would read as
                  "blocked for a good reason", and it is not one. */}
              <span className="block text-muted">
                {card.reason ?? 'Blocked, with no reason recorded.'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function NextPanel({ cards, remaining }: { cards: readonly HeroCard[]; remaining: number }) {
  return (
    <Panel title="What is next" icon={Clock}>
      {cards.length === 0 ? (
        <p className={EMPTY}>Nothing is queued that is not blocked.</p>
      ) : (
        <ul className="space-y-1.5">
          {cards.map((card) => (
            <li key={card.code} className="text-[12px] leading-[17px] text-ink">
              {card.headline}
            </li>
          ))}
          {remaining > 0 ? (
            <li className="text-[12px] text-muted tabular-nums">and {remaining} more waiting</li>
          ) : null}
        </ul>
      )}
    </Panel>
  )
}

export function WaitingPanel({ entries }: { entries: readonly WaitingOn[] }) {
  return (
    <Panel title="Who is waiting on whom" icon={UserRound}>
      {entries.length === 0 ? (
        <p className={EMPTY}>Nothing is waiting on a person.</p>
      ) : (
        <ul className="space-y-2">
          {entries.map((entry) => (
            <li key={entry.code} className="text-[12px] leading-[17px]">
              <span className="font-semibold text-ink">{entry.who}</span>
              <span className="block text-muted">{entry.action}</span>
              <a
                href={`#task-${entry.code}`}
                className="font-mono text-[10px] text-muted tabular-nums underline decoration-line underline-offset-2"
              >
                {entry.code} · since {entry.since}
              </a>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

export function CannotProvePanel({ claims }: { claims: readonly UnprovenClaim[] }) {
  return (
    <Panel title="What we cannot yet prove" icon={HelpCircle}>
      {claims.length === 0 ? (
        <p className={EMPTY}>Every check we know of has run at least once.</p>
      ) : (
        <ul className="space-y-2">
          {claims.map((claim) => (
            <li key={claim.key} className="text-[12px] leading-[17px] text-ink">
              {claim.what}
              {/* Provenance on every line. A transcription and a live reading
                  must never look the same. */}
              <span className="block text-[11px] text-muted">
                {claim.source === 'derived' ? 'Read from the record' : 'Recorded by hand'} ·{' '}
                {claim.from}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

const FRESHNESS_STYLE: Record<Freshness['level'], string> = {
  fresh: 'text-muted',
  ageing: 'text-warn',
  // Crimson, never orange, for a board old enough to mislead (docs/08 §6).
  stale: 'text-danger',
  unknown: 'text-danger',
}

export function FreshnessLine({ freshness }: { freshness: Freshness }) {
  return (
    <span
      className={cn('text-[12px] tabular-nums', FRESHNESS_STYLE[freshness.level])}
      title="Read from the newest change in the console's own tables — never reported by the sync itself."
    >
      {freshness.label}
    </span>
  )
}
