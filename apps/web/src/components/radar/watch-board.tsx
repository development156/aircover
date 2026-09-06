'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Timer } from 'lucide-react'

import { WatchForm } from '@/components/radar/watch-list'
import { Button } from '@/components/ui/button'

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
 *
 * ── WHY THE CARDS AND THE RADAR ARRIVE AS NODES ─────────────────────────────
 * They are rendered by the SERVER and handed in. Both are static markup, and
 * pulling them into this `'use client'` module dragged the radar's geometry, the
 * three kind icons and the four claim sentences into the browser bundle: it put
 * `/radar` 12.6 kB over its byte budget and failed the build. What genuinely
 * needs JavaScript here is which of three states is showing, the filter, and the
 * form — so that is all this file holds.
 */

/** Longest the reveal may hold, if the refreshed list never arrives. */
const SETTLE_CEILING_MS = 6000
/** Shortest, so a fast refresh reads as a transition rather than a flicker. */
const SETTLE_FLOOR_MS = 900

type Filter = 'all' | 'watching' | 'changed'

/** One rendered card, plus the two facts the filter needs to sort it. */
export interface BoardItem {
  id: string
  changed: boolean
  card: React.ReactNode
}

export function WatchBoard({
  items,
  scope,
  nextScan,
  perScan,
}: {
  items: readonly BoardItem[]
  /** The radar face, rendered on the server. */
  scope: React.ReactNode
  /** The next weekly pass, `YYYY-MM-DD`, computed on the server in UTC. */
  nextScan: string
  perScan: number
}) {
  const router = useRouter()
  const [settling, setSettling] = useState(false)
  const [landed, setLanded] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [filter, setFilter] = useState<Filter>('all')
  const countAtSubmit = useRef<number | null>(null)

  const changed = items.filter((item) => item.changed).length

  // ── THE REVEAL ENDS ON THE DATA, WITH A CLOCK AS THE BACKSTOP ─────────────
  useEffect(() => {
    if (!settling) return
    const arrived = countAtSubmit.current !== null && items.length > countAtSubmit.current
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
  }, [settling, items.length])

  function added() {
    countAtSubmit.current = items.length
    setLanded(false)
    setSettling(true)
    setFormOpen(false)
    router.refresh()
  }

  if (settling) return <Settling landed={landed} nextScan={nextScan} scope={scope} />

  // ── ADD: THE INTRODUCTION AND THE FORM, AND NO RADAR ──────────────────────
  // A radar face above an empty watch list is a picture of somebody else's
  // competitors. `RadarScope` already refuses to draw marks nobody added; the
  // page goes one further and does not draw the instrument at all until there is
  // something on it, which is what makes its arrival mean something.
  if (items.length === 0) {
    return (
      <div className="mx-auto w-full max-w-[720px]">
        <WatchForm onAdded={added} perScan={perScan} />
      </div>
    )
  }

  const shown =
    filter === 'all'
      ? items
      : filter === 'changed'
        ? items.filter((item) => item.changed)
        : items.filter((item) => !item.changed)

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
            Sahoda is reading <span className="num">{items.length}</span>{' '}
            {items.length === 1 ? 'business' : 'businesses'} for you, once a week. A page that will
            not load is skipped and not charged.
          </p>
        </div>

        <Button onClick={() => setFormOpen((open) => !open)} aria-expanded={formOpen}>
          {formOpen ? 'Close the form' : 'Add another'}
        </Button>
      </div>

      {formOpen ? <WatchForm onAdded={added} perScan={perScan} /> : null}

      {/* Only where the third count can be anything but zero. A filter row whose
          last tab always reads nothing is chrome that teaches a reader the
          feature is broken. */}
      {changed > 0 ? (
        <div role="group" aria-label="Filter the watch list" className="flex flex-wrap gap-2">
          {(
            [
              { id: 'all' as const, label: 'All', n: items.length },
              { id: 'watching' as const, label: 'Watching', n: items.length - changed },
              { id: 'changed' as const, label: 'Changed', n: changed },
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

      <ul className="grid gap-3 wide:grid-cols-2">
        {shown.map((item) => (
          <li key={item.id} className="min-w-0">
            {item.card}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * THE MIDDLE STATE. Every line of it is something that is actually happening.
 */
function Settling({
  landed,
  nextScan,
  scope,
}: {
  landed: boolean
  nextScan: string
  scope: React.ReactNode
}) {
  return (
    <section
      aria-labelledby="radar-settling"
      className="grid items-center gap-8 wide:grid-cols-[minmax(0,360px)_minmax(0,1fr)]"
    >
      <div className="mx-auto w-full max-w-[360px] max-narrow:max-w-[240px]">{scope}</div>

      <div role="status" aria-live="polite" className="min-w-0">
        <p className="type-eyebrow text-accent">Radar</p>
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
                The weekly pass runs on{' '}
                <span data-scan-date={nextScan} className="num">
                  {nextScan}
                </span>
                , and what it finds appears on the card.
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
