'use client'

import { useState, useTransition } from 'react'
import { AtSign, Building2, MapPin, Trash2 } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { addCompetitor, removeCompetitor } from '@/app/actions/radar'
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

export function WatchList({ competitors }: { competitors: readonly Competitor[] }) {
  const [name, setName] = useState('')
  const [url, setUrl] = useState('')
  const [kind, setKind] = useState<CompetitorKind>('website')
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const perScan = creditCost('radar_scan')

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

  function drop(id: string) {
    setError(null)
    startTransition(async () => {
      // The result is READ. Discarding it left a refused delete looking like a
      // successful one: the row stayed on screen, nothing was said, and the
      // obvious next move for the reader is to press it again.
      const result = await removeCompetitor(id)
      if (!result.ok) setError(result.message)
    })
  }

  return (
    <section aria-labelledby="radar-watchlist" className="flex flex-col gap-3">
      <div>
        <h2 id="radar-watchlist" className="type-h2">
          Who you are watching
        </h2>
        <p className="type-body mt-1 max-w-[68ch] text-muted">
          A public website, Instagram page or Google listing. Each one is read once a week at{' '}
          <span data-credit-price="radar_scan" className="num">
            {perScan}
          </span>{' '}
          {perScan === 1 ? 'credit' : 'credits'} a scan. A page that will not load is skipped and
          not charged.
        </p>
      </div>

      {competitors.length > 0 ? (
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
      ) : null}

      <form
        onSubmit={submit}
        className="surface-ring flex flex-col gap-3 rounded-card bg-surface p-4"
      >
        <div className="grid gap-3 narrow:grid-cols-2">
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
              onChange={(e) => setKind(e.target.value as CompetitorKind)}
            >
              {(Object.keys(COMPETITOR_KIND_LABELS) as CompetitorKind[]).map((k) => (
                <option key={k} value={k}>
                  {COMPETITOR_KIND_LABELS[k]}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <Label htmlFor="radar-url">Their public address</Label>
          <Input
            id="radar-url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            inputMode="url"
            autoComplete="off"
          />
        </div>
        {error ? <InlineError>{error}</InlineError> : null}
        <div>
          <Button type="submit" loading={pending}>
            Add to the watch list
          </Button>
        </div>
      </form>
    </section>
  )
}
