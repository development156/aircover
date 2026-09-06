'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  ArrowRight,
  AtSign,
  Building2,
  Check,
  CheckCheck,
  MapPin,
  Plus,
  Radar as RadarIcon,
  Timer,
  Trash2,
} from 'lucide-react'

import { removeCompetitor } from '@/app/actions/radar'
import { InlineError } from '@/components/posts/inline-error'
import { RadarScope } from '@/components/radar/radar-scope'
import { WatchForm } from '@/components/radar/watch-list'
import { Button } from '@/components/ui/button'
import type { WatchCard } from '@/lib/radar/cards'
import { COMPETITOR_KIND_LABELS, type CompetitorKind } from '@/lib/radar/types'

/**
 * THE RADAR BOARD — three states, and each one is a fact rather than a step.
 *
 * ── WHAT THE REFERENCE ASKED FOR, AND THE ONE PART THAT COULD NOT BE BUILT ──
 * The reference design goes Add → "Scanning…" → Watch list, with the middle
 * screen running a progress rail labelled "Fetching data", "Analyzing changes",
 * "Almost done". Adding a business to the watch list does none of those. It
 * writes one row. The weekly pass that actually reads the page is a cron at
 * 03:40 UTC on Monday (apps/web/vercel.json), and it will not run because
 * somebody pressed a button here.
 *
 * A three-step rail narrating work that is not happening is the same defect as a
 * fabricated number, moving — `radar-scope.tsx` already refuses the animated
 * version of it, and this component would have been the loophole. So the middle
 * state is kept, with its animation and its reveal, and it narrates the work
 * that IS happening: the row being saved, the list coming back with it on, and
 * the day the first read is scheduled for. Same shape, true sentences.
 *
 * ── AND IT CANNOT STICK ─────────────────────────────────────────────────────
 * The middle state ends when the refreshed list contains one more business than
 * it did at submit, and failing that on a timer. A screen that waits forever for
 * a render that already happened is the ordinary way this pattern breaks, and
 * the person is left looking at an animation with their work apparently lost.
 */

/**
 * One mark per kind of page. `AtSign` for Instagram rather than a brand glyph:
 * this lucide build ships no brand icons, and a handle is what the reader
 * actually typed in.
 */
const KIND_ICON: Record<CompetitorKind, typeof Building2> = {
  website: Building2,
  instagram: AtSign,
  google_business: MapPin,
}

/** Longest the reveal may hold, if the refreshed list never arrives. */
const SETTLE_CEILING_MS = 6000
/** Shortest, so a fast refresh reads as a transition rather than a flicker. */
const SETTLE_FLOOR_MS = 900

type Filter = 'all' | 'watching' | 'changed'

export function WatchBoard({
  cards,
  nextScan,
  scanArmed,
  perScan,
  scanning,
}: {
  cards: readonly WatchCard[]
  /** The next weekly pass, `YYYY-MM-DD`, computed on the server in UTC. */
  nextScan: string
  /** Whether the weekly pass is switched on in this environment. */
  scanArmed: boolean
  perScan: number
  /** Whether Radar is collecting at all. Freezes the sweep when false. */
  scanning: boolean
}) {
  const router = useRouter()
  const [settling, setSettling] = useState(false)
  const [landed, setLanded] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const countAtSubmit = useRef<number | null>(null)

  const changed = cards.filter((card) => card.status.claim === 'changed')

  // ── THE REVEAL ENDS ON THE DATA, WITH A CLOCK AS THE BACKSTOP ─────────────
  useEffect(() => {
    if (!settling) return
    const arrived = countAtSubmit.current !== null && cards.length > countAtSubmit.current
    if (arrived) setLanded(true)

    const done = window.setTimeout(
      () => {
        setSettling(false)
        setLanded(false)
        countAtSubmit.current = null
      },
      arrived ? SETTLE_FLOOR_MS : SETTLE_CEILING_MS,
    )
    return () => window.clearTimeout(done)
  }, [settling, cards.length])

  function added() {
    countAtSubmit.current = cards.length
    setLanded(false)
    setSettling(true)
    setFormOpen(false)
    router.refresh()
  }

  if (settling) {
    return <Settling landed={landed} nextScan={nextScan} scanning={scanning} marks={cards.length} />
  }

  // ── ADD: THE INTRODUCTION AND THE FORM, AND NO RADAR ──────────────────────
  // A radar face above an empty watch list is a picture of somebody else's
  // competitors. `RadarScope` already refuses to draw marks nobody added; this
  // goes one further and does not draw the instrument at all until there is
  // something on it, which is what makes its arrival mean something.
  if (cards.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <WatchForm onAdded={added} perScan={perScan} />
      </div>
    )
  }

  const shown =
    filter === 'all'
      ? cards
      : filter === 'changed'
        ? changed
        : cards.filter((c) => c.status.claim !== 'changed')

  return (
    <section id="radar-watch-list" aria-labelledby="radar-list" className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 id="radar-list" className="type-h1 text-ink">
            Your watch list, at a glance.
          </h2>
          <p className="type-sm mt-1.5 max-w-[60ch] text-muted">
            {/* The COUNT, and not a second copy of the price. The price is on
                the form, which is the control that commits it; repeating it
                beside a list of businesses somebody is already paying for is
                the sentence arriving after the decision it was for. */}
            Sahoda is reading <span className="num">{cards.length}</span>{' '}
            {cards.length === 1 ? 'business' : 'businesses'} for you, once a week. A page that will
            not load is skipped and not charged.
          </p>
        </div>

        <Button onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen}>
          <Plus size={15} aria-hidden />
          Add another
        </Button>
      </div>

      {formOpen ? <WatchForm onAdded={added} perScan={perScan} /> : null}

      {/* Only where the third count can be anything but zero. A filter row whose
          last tab always reads nothing is chrome that teaches a reader the
          feature is broken. */}
      {scanning && changed.length > 0 ? (
        <div role="group" aria-label="Filter the watch list" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'All', n: cards.length },
              { id: 'watching' as const, label: 'Watching', n: cards.length - changed.length },
              { id: 'changed' as const, label: 'Changed', n: changed.length },
            ] satisfies { id: Filter; label: string; n: number }[]
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              aria-pressed={filter === tab.id}
              className={`rounded-pill px-3 py-1.5 type-sm font-[550] transition-micro focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                filter === tab.id
                  ? 'bg-primary text-primary-foreground'
                  : 'surface-ring text-muted hover:text-ink'
              }`}
            >
              {tab.label} <span className="num">{tab.n}</span>
            </button>
          ))}
        </div>
      ) : null}

      <WatchCards cards={shown} nextScan={nextScan} scanArmed={scanArmed} />
    </section>
  )
}

/**
 * THE MIDDLE STATE. Every line of it is something that is actually happening.
 */
function Settling({
  landed,
  nextScan,
  scanning,
  marks,
}: {
  landed: boolean
  nextScan: string
  scanning: boolean
  marks: number
}) {
  return (
    <section
      aria-labelledby="radar-settling"
      className="grid items-center gap-8 wide:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"
    >
      <div className="mx-auto w-full max-w-[360px] max-narrow:max-w-[240px]">
        <RadarScope marks={Math.max(marks, 1)} scanning={scanning} />
      </div>

      <div role="status" aria-live="polite" className="min-w-0">
        <p className="type-eyebrow flex items-center gap-2 text-accent">
          <RadarIcon size={15} strokeWidth={1.9} aria-hidden />
          Radar
        </p>
        <h2 id="radar-settling" className="mt-2 type-display text-ink">
          Adding to your radar
        </h2>

        <ol className="mt-6 flex flex-col gap-4">
          <Step done label="Saved" body="The address is stored against your workspace." />
          <Step
            done={landed}
            label="On your watch list"
            body="It appears below the moment the list comes back."
          />
          {/* NOT a step, and drawn as a clock rather than a tick. Nothing here
              is waiting on it: it is when the weekly pass next runs, which is a
              schedule and not progress. */}
          <Step
            done={false}
            pending
            label="First read"
            body={
              <>
                The weekly pass runs on <span className="num">{nextScan}</span>, and what it finds
                appears on the card.
              </>
            }
          />
        </ol>
      </div>
    </section>
  )
}

function Step({
  done,
  pending,
  label,
  body,
}: {
  done: boolean
  pending?: boolean
  label: string
  body: React.ReactNode
}) {
  return (
    <li className="flex items-start gap-3">
      <span
        aria-hidden
        className={`mt-0.5 flex size-[22px] shrink-0 items-center justify-center rounded-full transition-micro ${
          done ? 'bg-primary text-primary-foreground' : 'surface-ring text-muted'
        }`}
      >
        {done ? <Check size={13} strokeWidth={2.4} /> : <Timer size={12} strokeWidth={1.9} />}
      </span>
      <span className="min-w-0">
        <span className={`type-sm block font-[550] ${done || pending ? 'text-ink' : 'text-muted'}`}>
          {label}
        </span>
        <span className="type-sm block text-muted">{body}</span>
      </span>
    </li>
  )
}

/**
 * The cards. Its own error, so a refused removal is reported beside the rows
 * rather than under a form somewhere else on the screen.
 */
function WatchCards({
  cards,
  nextScan,
  scanArmed,
}: {
  cards: readonly WatchCard[]
  nextScan: string
  scanArmed: boolean
}) {
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)
  const router = useRouter()

  async function drop(id: string) {
    setError(null)
    setPending(id)
    // The result is READ. Discarding it left a refused delete looking like a
    // successful one: the row stayed on screen, nothing was said, and the
    // obvious next move for the reader is to press it again.
    const result = await removeCompetitor(id)
    setPending(null)
    if (!result.ok) {
      setError(result.message)
      return
    }
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-3">
      {error ? <InlineError>{error}</InlineError> : null}
      <ul className="grid gap-3 wide:grid-cols-2">
        {cards.map(({ competitor, status }) => {
          const Icon = KIND_ICON[competitor.kind]
          const moved = status.claim === 'changed'
          return (
            <li
              key={competitor.id}
              // `min-w-0` IS LOAD-BEARING, not tidying. These are GRID items,
              // and a grid item's default `min-width: auto` refuses to shrink
              // below its content's min-content width — so the `truncate` on
              // the name never gets a chance to act and the row pushes the whole
              // page wider than the viewport.
              className="surface-ring flex min-w-0 flex-col gap-3 rounded-card bg-surface p-4 transition-micro hover:bg-surface-2"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="surface-ring flex size-[36px] shrink-0 items-center justify-center rounded-card text-muted">
                  <Icon size={16} strokeWidth={1.8} aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="type-sm block truncate font-[550] text-ink">
                    {competitor.name}
                  </span>
                  <span className="type-meta block truncate text-muted">
                    {COMPETITOR_KIND_LABELS[competitor.kind]}
                    {competitor.lastObservedAt ? (
                      <>
                        {' · last read '}
                        <span className="num">{competitor.lastObservedAt.slice(0, 10)}</span>
                      </>
                    ) : (
                      // NOT a dash. "Never read" is a fact about our collector,
                      // and a dash here would read as "nothing has happened at
                      // that business" — the exact confusion this screen exists
                      // to prevent.
                      ' · not read yet'
                    )}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-pill px-2.5 py-1 type-chip ${
                    moved ? 'bg-tint-100 text-accent dark:bg-s2' : 'surface-ring text-muted'
                  }`}
                >
                  {moved ? 'Changed' : 'Watching'}
                </span>
              </div>

              <p className="surface-ring rounded-card px-3 py-2 type-sm text-muted">
                {status.claim === 'changed' ? (
                  <>
                    <span className="num">{status.count}</span>{' '}
                    {status.count === 1 ? 'change' : 'changes'} Radar can show you evidence for.
                  </>
                ) : status.claim === 'quiet' ? (
                  'Read, and nothing moved.'
                ) : status.claim === 'not-read' ? (
                  'On the list. Nothing has been read yet, which is not the same as a quiet week.'
                ) : (
                  'Stored and being read. The readings are not on this screen yet, so Radar cannot tell you either way.'
                )}
              </p>

              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="type-meta flex items-center gap-1.5 text-muted">
                  {scanArmed ? (
                    <>
                      <Timer size={13} strokeWidth={1.8} aria-hidden />
                      Next check <span className="num">{nextScan}</span>
                    </>
                  ) : (
                    <>
                      <Timer size={13} strokeWidth={1.8} aria-hidden />
                      The weekly pass is switched off, so no read is scheduled.
                    </>
                  )}
                </span>
                <span className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => drop(competitor.id)}
                    disabled={pending !== null}
                  >
                    <Trash2 size={14} aria-hidden />
                    <span className="sr-only">Stop watching {competitor.name}</span>
                    <span aria-hidden>Remove</span>
                  </Button>
                  <Link
                    href={`/radar/${competitor.id}`}
                    className="card-link inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                  >
                    View details
                    <ArrowRight size={14} aria-hidden />
                  </Link>
                </span>
              </div>
            </li>
          )
        })}
      </ul>

      {cards.length === 0 ? (
        <p className="surface-ring flex items-center gap-2 rounded-card bg-surface p-4 type-sm text-muted">
          <CheckCheck size={14} strokeWidth={1.8} aria-hidden />
          Nothing on this filter.
        </p>
      ) : null}
    </div>
  )
}
