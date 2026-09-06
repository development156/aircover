'use client'

import { useState, useTransition } from 'react'
import { ArrowRight, ShieldCheck, Target } from 'lucide-react'
import { addCompetitor } from '@/app/actions/radar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select } from '@/components/ui/select'
import { InlineError } from '@/components/posts/inline-error'
import { creditWord } from '@/lib/credit-words'
import { COMPETITOR_KIND_LABELS, type CompetitorKind } from '@/lib/radar/types'

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
 * ── THIS FILE IS THE FORM AND NOTHING ELSE NOW ─────────────────────────────
 * It used to carry the rows as well, and a summary card sat beside them holding
 * three counts and the price. The 2026-09-06 redesign gives the rows to
 * `watch-board.tsx`, which is the only component that knows which of the three
 * screen states is showing, and moves the price onto this form, which is the
 * control that actually commits the charge.
 *
 * The form keeps its OWN error and does not share one with the rows. A refused
 * delete and a refused add are different sentences about different things, and
 * sharing one string meant removing a business could clear the message
 * explaining why the last add failed, with the half-filled form still on screen.
 */
export function WatchForm({ onAdded, perScan }: { onAdded?: () => void; perScan: number }) {
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
      // The board owns what happens next: it holds the reveal open until the
      // refreshed list actually carries the new row, so the form does not get to
      // decide the screen has moved on.
      onAdded?.()
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
            promise about judgement; this is a statement about a schedule.

            THE PRICE LIVES HERE NOW, and `data-credit-price` with it. It used to
            sit in a summary card beside the list, which meant it was on the
            screen only once somebody was already watching somebody — after the
            spend rather than before it. This is the control that commits the
            charge, so this is where the charge is stated. */}
        <p className="type-meta flex items-start gap-1.5 text-muted">
          <ShieldCheck size={13} strokeWidth={1.8} aria-hidden className="mt-icon-nudge shrink-0" />
          Read once a week, at{' '}
          <span data-credit-price="radar_scan" className="num">
            {perScan}
          </span>{' '}
          {creditWord(perScan)} a scan. You will see what moved, and a page that will not load is
          skipped and not charged.
        </p>
      </form>
    </section>
  )
}
