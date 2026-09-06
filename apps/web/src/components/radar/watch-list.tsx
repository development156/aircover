'use client'

import { useState, useTransition } from 'react'
import {
  ArrowRight,
  AtSign,
  Building2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
} from 'lucide-react'
import { addCompetitor, readCompetitorNow, removeCompetitor } from '@/app/actions/radar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { InlineError } from '@/components/posts/inline-error'
import { COMPETITOR_KIND_LABELS, type Competitor, type CompetitorKind } from '@/lib/radar/types'

/**
 * THE WATCH LIST — who is being read, and what that costs.
 *
 * ── THERE IS NO SLOT CAP HERE, AND THAT IS A DECISION, NOT AN OMISSION ──────
 * `PlanLimits` in packages/shared — the entitlement surface this app actually
 * reads — has no competitor dimension: `channels`, `sites`, `seats`, `loopLevel`
 * and `twinSize`, and nothing else. The docs that mention a cap disagree with
 * each other: PRD §7.1's plan table says "Growth: Radar (3 comps)" while PRD M9
 * and FSD M9 both say "1–5 competitors". Picking one would be inventing an
 * entitlement, and picking the smaller would silently refuse work a customer may
 * be entitled to.
 *
 * So the list is uncapped and the COST IS STATED INSTEAD. Each business is one
 * scan a week at `radar_scan` credits — a published price out of
 * pricing.config.json, not a claim about anyone — which is what turns an
 * uncapped list into an informed decision rather than an unbounded one.
 *
 * OWNER RULING OWED: is the cap 3, 5, or per-plan? When it is settled it belongs
 * in `PlanLimits` as a dimension, and `cheapestPlanWithAtLeast('competitors', n)`
 * will then derive the upgrade sentence the way every other limit's does.
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

/**
 * ── ONE COMPONENT BECAME TWO, AND THE SPLIT IS THE LAYOUT'S ────────────────
 * `WatchList` was a heading, an explanatory paragraph, the list and the form in
 * one column. The redesign puts the explanation and the counts beside the radar
 * (`watch-summary.tsx`) and the form a row below it, so the two halves now sit
 * in different grid cells and cannot be one component.
 *
 * They keep separate error state on purpose. A refused delete and a refused add
 * are different sentences about different rows, and sharing one string meant
 * removing a competitor could clear the message explaining why the last add
 * failed — with the half-filled form still on screen.
 */
export function WatchForm() {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<CompetitorKind>('website')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await addCompetitor(name, url, kind)
      if (!result.ok) {
        setError(result.message)
        return
      }
      setName('')
      setUrl('')
    })
  }

  return (
    <section
      aria-labelledby="radar-add"
      className="surface-ring flex h-full flex-col gap-4 rounded-card bg-surface p-5"
    >
      <div>
        <h2 id="radar-add" className="type-h3 flex items-center gap-2 text-ink">
          <Target size={16} strokeWidth={1.8} aria-hidden className="text-accent" />
          Add something to watch
        </h2>
        <p className="type-sm mt-1.5 max-w-[52ch] text-muted">
          A competitor, a marketplace listing, a website or a public profile.
        </p>
      </div>

      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Label htmlFor="radar-name">What do you call them?</Label>
          <Input
            id="radar-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Sunrise Bakery"
            autoComplete="off"
          />
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="radar-kind">What kind of page is it?</Label>
          <Select
            id="radar-kind"
            value={kind}
            wrapperClassName="max-w-none"
            onChange={(e) => setKind(e.target.value as CompetitorKind)}
          >
            {(Object.keys(COMPETITOR_KIND_LABELS) as CompetitorKind[]).map((k) => (
              <option key={k} value={k}>
                {COMPETITOR_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="radar-url">Their public address</Label>
          <Input
            id="radar-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            inputMode="url"
            autoComplete="off"
          />
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <Button type="submit" loading={pending} className="mt-1 w-full">
          Add to the watch list
          <ArrowRight size={14} aria-hidden />
        </Button>
        {/* The reassurance says the CADENCE and the CHARGE, because those are
            the two things a person hesitates over before naming somebody else's
            business. "We'll alert you to meaningful changes" on its own is a
            promise about judgement; this is a statement about a schedule. */}
        <p className="type-meta flex items-start gap-1.5 text-muted">
          <ShieldCheck size={13} strokeWidth={1.8} aria-hidden className="mt-icon-nudge shrink-0" />
          Read once a week. You will see what moved, and a page that will not load is skipped and
          not charged.
        </p>
      </form>
    </section>
  )
}

/**
 * The businesses already on the list. Its own component and its own error, so a
 * refused removal is reported next to the rows rather than under the add form.
 */
export function WatchRows({
  competitors,
  readCost,
}: {
  competitors: readonly Competitor[]
  /** What one "Read now" costs, as a sentence: "1 credit". Shown before the spend. */
  readCost: string
}) {
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  // WHICH row is busy, not whether any row is. Two buttons per row and a
  // single boolean would grey the whole list for one read.
  const [busy, setBusy] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  /**
   * "Read now": the weekly pass, for this one business, now. The result is a
   * sentence on both arms, and the failure arm keeps the wallet honest: a
   * refused read says nothing was charged, because `readCompetitorNow` charges
   * only after a page came back.
   */
  function readNow(id: string) {
    setError(null)
    setStatus(null)
    setBusy(id)
    startTransition(async () => {
      const result = await readCompetitorNow(id)
      setBusy(null)
      if (result.ok) setStatus(result.message)
      else setError(result.message)
    })
  }

  function drop(id: string) {
    setError(null)
    setStatus(null)
    setBusy(id)
    startTransition(async () => {
      // The result is READ. Discarding it left a refused delete looking like a
      // successful one: the row stayed on screen, nothing was said, and the
      // obvious next move for the reader is to press it again.
      const result = await removeCompetitor(id)
      setBusy(null)
      if (!result.ok) setError(result.message)
    })
  }

  if (competitors.length === 0) return null

  return (
    <section
      id="radar-watch-list"
      aria-label="Businesses you are watching"
      className="flex flex-col gap-2"
    >
      {error ? <InlineError>{error}</InlineError> : null}
      <p role="status" aria-live="polite" className="type-meta text-muted empty:hidden">
        {status}
      </p>
      <ul className="grid gap-2 wide:grid-cols-2">
        {competitors.map((competitor) => {
          const Icon = KIND_ICON[competitor.kind]
          return (
            <li
              key={competitor.id}
              // `min-w-0` IS LOAD-BEARING, not tidying. These are GRID items,
              // and a grid item's default `min-width: auto` refuses to shrink
              // below its content's min-content width — so the `truncate` on
              // the name never got a chance to act and the row pushed the
              // whole page to 464px at a 390 viewport. MEASURED, not guessed:
              // the three offenders in the overflow probe were all this `li`.
              className="surface-ring flex min-w-0 items-center gap-3 rounded-card bg-surface px-3 py-3"
            >
              <Icon size={15} strokeWidth={1.8} aria-hidden className="shrink-0 text-muted" />
              <span className="min-w-0 flex-1">
                <span className="type-sm block truncate text-ink">{competitor.name}</span>
                <span className="type-eyebrow block truncate text-muted">
                  {COMPETITOR_KIND_LABELS[competitor.kind]}
                  {competitor.lastObservedAt ? (
                    <>
                      {' · read '}
                      <span className="num">{competitor.lastObservedAt.slice(0, 10)}</span>
                    </>
                  ) : (
                    // NOT a dash. "Never read" is a fact about our collector,
                    // and a dash here would read as "nothing has happened at
                    // that business" — the exact confusion this screen exists
                    // to prevent, one component down.
                    ' · not read yet'
                  )}
                </span>
              </span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => readNow(competitor.id)}
                loading={pending && busy === competitor.id}
                disabled={pending}
                title={`Read ${competitor.name} now for ${readCost}`}
              >
                <RefreshCw size={14} aria-hidden />
                <span className="sr-only">
                  Read {competitor.name} now, {readCost}
                </span>
                <span aria-hidden>Read now</span>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => drop(competitor.id)}
                disabled={pending}
              >
                <Trash2 size={14} aria-hidden />
                <span className="sr-only">Stop watching {competitor.name}</span>
                <span aria-hidden>Remove</span>
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
