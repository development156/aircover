import Link from 'next/link'
import { ArrowRight, CheckCheck, Timer, Users } from 'lucide-react'
import { creditCost } from '@sahoda/shared'

import { creditWord } from '@/lib/credit-words'
import type { Competitor } from '@/lib/radar/types'

/**
 * WHO YOU ARE WATCHING — three figures, and every one of them is read off the
 * watch list rather than chosen to look good.
 *
 * ── THERE IS NO "PAUSED", AND THAT IS THE INTERESTING PART ──────────────────
 * The brief asked for "Active / Paused / Credits per scan", and a Paused tile
 * reading 0 would have been the easy thing to ship. `Competitor` has `id`,
 * `name`, `url`, `kind`, `addedOn` and `lastObservedAt` — there is no paused
 * flag in the type, none in the store, and no control anywhere that could set
 * one. A tile labelled "Paused 0" advertises a switch that does not exist, and
 * the reader who wants it goes looking for the rest of the afternoon.
 *
 * What the data DOES know, and what the brief's third state was reaching for,
 * is whether the weekly scan has actually happened yet. `lastObservedAt` is null
 * until a read succeeds, so "read at least once" against "waiting for a first
 * read" is a real division of the same list, and it is the one a person checks
 * this card to find out.
 *
 * ── THE PRICE COMES FROM `pricing.config.json`, NEVER FROM A LAYOUT ─────────
 * The reference showed "15 credits / scan". This product charges
 * `creditCost('radar_scan')`, and printing a price a customer is not charged is
 * the one thing a screen about money may never do. `data-credit-price` is the
 * attribute `no-hardcoded-price` looks for.
 */
/*
 * ── EVERY ICON HERE ALREADY SHIPS, AND THAT IS A BUDGET DECISION ────────────
 * The first draft reached for `Eye` and `SendHorizontal`, which no other screen
 * used. MEASURED on Vercel: two lucide glyphs nobody else imports grew the
 * SHARED chunk, and the shared chunk lands on every route — `/layout` went
 * 833.8 kB against 833.6 allowed and `/global-error` 710.0 against 709.9. Two
 * decorative icons, 0.1 and 0.2 kB over, and a red build for the whole app.
 *
 * `CheckCheck` and `ArrowRight` say the same things and are already in the
 * bundle, so they cost nothing. Prefer an icon this app already imports over
 * the perfect one, unless the perfect one is carrying meaning the other cannot.
 */
export function WatchSummary({ competitors }: { competitors: readonly Competitor[] }) {
  const perScan = creditCost('radar_scan')
  const read = competitors.filter((c) => c.lastObservedAt !== null).length
  const waiting = competitors.length - read

  return (
    <section
      aria-labelledby="radar-watchlist"
      className="surface-ring flex flex-col gap-4 rounded-card bg-surface p-5"
    >
      <div>
        <h2 id="radar-watchlist" className="type-h3 flex items-center gap-2 text-ink">
          <Users size={16} strokeWidth={1.8} aria-hidden className="text-accent" />
          Who you are watching
        </h2>
        <p className="type-sm mt-1.5 max-w-[52ch] text-muted">
          A public website, Instagram page or Google listing. Each one is read once a week at{' '}
          <span data-credit-price="radar_scan" className="num">
            {perScan}
          </span>{' '}
          {creditWord(perScan)} a scan. A page that will not load is skipped and not charged.
        </p>
      </div>

      {competitors.length > 0 ? (
        <>
          <dl className="grid grid-cols-3 gap-3 border-t border-line pt-4">
            <Figure icon={Users} label="Watching" value={competitors.length} />
            {/* NOT "Paused". See the header — the flag does not exist, and this
                division is the one the list can actually make. */}
            <Figure icon={CheckCheck} label={read === 1 ? 'Read once' : 'Read'} value={read} />
            <Figure icon={Timer} label="Waiting" value={waiting} />
          </dl>

          {/* An in-page anchor, not a route. The reference's "View all watches"
              implied a screen that does not exist, and a control that goes
              nowhere is the impossible remedy `no-impossible-remedy.spec.ts`
              forbids, wearing navigation chrome. The list is on this page, so
              the link takes you to it. */}
          <Link
            href="#radar-watch-list"
            className="card-link inline-flex w-fit items-center gap-1.5 rounded-pill border border-line px-3 py-1.5 type-sm font-[550] text-ink transition-micro hover:bg-surface-2 max-narrow:min-h-[44px]"
          >
            View all watches
            <ArrowRight size={14} aria-hidden />
          </Link>
        </>
      ) : (
        /* Nobody watched. The figures would all be zero, and three zeroes are a
           worse sentence than the one sentence they replace. */
        <p className="border-t border-line pt-4 type-sm text-muted">
          Nobody yet. Add the first one and this fills with what is being read and when it was last
          seen.
        </p>
      )}
    </section>
  )
}

function Figure({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: number
}) {
  return (
    <div className="min-w-0">
      <dt className="type-meta flex items-center gap-1.5 text-muted">
        <Icon size={13} strokeWidth={1.8} aria-hidden />
        <span className="truncate">{label}</span>
      </dt>
      <dd className="num mt-0.5 type-h2 text-ink">{value}</dd>
    </div>
  )
}
