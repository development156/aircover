'use client'

import { ChevronLeft, ChevronRight, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import type { LedgerEntry } from '@sahoda/shared'

import { Select } from '@/components/ui/select'
import { settledHoldIds } from '@/lib/wallet/hold-settlement'
import { groupCorrections } from '@/lib/wallet/group-entries'
import {
  ACTIVITY_KINDS,
  GAP,
  PER_PAGE_OPTIONS,
  clampPage,
  filterEntries,
  pageCount,
  pageSlots,
  showingRange,
  totalsFor,
  type ActivityKind,
} from '@/lib/wallet/activity-view'
import { cn } from '@/lib/utils'
import { LedgerTable, SkippedNote } from './ledger-table'

/**
 * Credit activity: a summary, two filters, a rows-per-page control, the ledger
 * table, and a pager.
 *
 * ── THE SUMMARY IS SCOPED, AND THAT IS NOT A HEDGE ──────────────────────────
 * The brief asks for "Total spent", "Total earned" and "Net usage". MEASURED
 * 2026-08-29: none of the three can be stated truthfully today.
 *
 *   · `readLedger` is windowed to `HISTORY_LIMIT` rows, so a sum over what is
 *     loaded is a sum over the newest slice, not a lifetime.
 *   · `credit_balances` holds `balance_total` and `balance_held` only — a
 *     CURRENT snapshot, overwritten on every entry. There is no
 *     `lifetime_granted` or `lifetime_spent` column anywhere.
 *   · No Postgres function or view aggregates `credit_ledger.amount`, and
 *     PostgREST does not expose raw aggregates, so the client cannot ask for
 *     one.
 *
 * A tile reading "Total spent 12,450" over a workspace with two hundred entries
 * would therefore be a wrong number about somebody's money — the one thing this
 * product may never print. So the tiles say what they are: the spend inside the
 * entries listed, with the scope stated underneath in the same breath. When the
 * whole history fits inside the window, which is most workspaces, the sentence
 * says so and the numbers ARE the lifetime ones.
 *
 * A true lifetime total needs an aggregate function on the ledger. That is a
 * migration, and it is not this change.
 *
 * ── THE COUNT, HOWEVER, IS EXACT ────────────────────────────────────────────
 * `countLedger` asks the database how many entries exist rather than counting
 * what was fetched, so "43 entries" is the real number even when only fifty of
 * two hundred were read. `null` means the count could not be taken and the
 * sentence stands down rather than printing a zero.
 */

const CONTROL =
  'h-9 rounded-sm border-0 bg-surface-2 px-3 type-sm text-ink transition-micro placeholder:text-muted focus-visible:bg-surface'

function Tile({ label, value, tone }: { label: string; value: string; tone?: 'ink' | 'muted' }) {
  return (
    <div className="rounded-sm bg-surface-2 px-3 py-2.5">
      <p className="type-meta text-muted">{label}</p>
      <p className={cn('num mt-0.5 type-h3', tone === 'muted' ? 'text-muted' : 'text-ink')}>
        {value}
      </p>
    </div>
  )
}

export function CreditActivity({
  entries,
  skipped,
  limit,
  total,
}: {
  entries: readonly LedgerEntry[]
  skipped: number
  /** The row cap the read was made with. */
  limit: number
  /** Entries in the ledger, from the database. `null` = the count failed. */
  total: number | null
}) {
  const [kind, setKind] = useState<ActivityKind>('all')
  const [query, setQuery] = useState('')
  const [perPage, setPerPage] = useState<number>(10)
  const [page, setPage] = useState(1)

  /* Session-scoped, and hydrated in an effect rather than in a lazy initial
     value: the initialiser runs on the server too, where `sessionStorage` does
     not exist, and a guarded one returns a different first render on the client
     than the server sent. Reading it after mount costs one extra paint and
     cannot mismatch. Wrapped, because a browser set to block site data throws
     on access rather than returning null. */
  useEffect(() => {
    try {
      const saved = Number(window.sessionStorage.getItem('sahoda.wallet.perPage'))
      if (PER_PAGE_OPTIONS.includes(saved as (typeof PER_PAGE_OPTIONS)[number])) setPerPage(saved)
    } catch {
      /* no session storage — the default stands */
    }
  }, [])

  /**
   * Computed over EVERY entry read, not over the page.
   *
   * A hold on page two whose settling DEBIT sits on page one would otherwise be
   * marked "Reserved" — telling somebody credits are frozen that were spent
   * days ago. `LedgerTable`'s own derivation is correct for an unpaginated
   * caller and wrong for this one, which is why it takes the set as a prop.
   */
  const settled = useMemo(() => settledHoldIds(entries), [entries])

  /**
   * Computed over EVERY entry read, for the same reason and by the same rule.
   *
   * This is the sibling `settled` left open. A correction's re-issue points at an
   * entry far down the list, so in any workspace with more than one page the
   * original and its correction sit on DIFFERENT pages: `LedgerTable`'s own
   * derivation, given ten rows, finds no correction and renders the superseded
   * row with no note, which reads as though it still stands. Only the SET is
   * hoisted; the rows on screen stay the page's own.
   */
  const correctedSeqs = useMemo(() => groupCorrections(entries).correctedSeqs, [entries])

  const filtered = useMemo(() => filterEntries(entries, { kind, query }), [entries, kind, query])
  const totals = useMemo(() => totalsFor(filtered), [filtered])

  // The clamp is applied on READ rather than only in the setters, so a page
  // that stops existing — the filter narrowed, or rows-per-page grew — can
  // never be rendered even for one frame.
  const safePage = clampPage(page, filtered.length, perPage)
  const pages = pageCount(filtered.length, perPage)
  const range = showingRange(safePage, perPage, filtered.length)
  const visible = filtered.slice(range.from - 1, range.to)

  const filtering = kind !== 'all' || query.trim() !== ''
  // The window notice is about the READ, so it is true regardless of filtering:
  // a full page back from the query means older activity exists and is not here.
  const windowed = entries.length + skipped >= limit
  const scope =
    total !== null && total > entries.length + skipped
      ? `the ${limit} most recent of ${total.toLocaleString('en-IN')} entries`
      : `all ${(total ?? entries.length).toLocaleString('en-IN')} entries`

  function change(next: () => void) {
    next()
    setPage(1)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="type-h3 text-ink">Credit activity</h2>
          {/* The founder's own sentence, asked for three times and used
              verbatim. An earlier draft substituted "Every grant, hold, charge
              and refund, newest first, with what caused it" — more specific,
              and a substitution nobody requested. Specificity is worth having
              where a vaguer line would hide something; here it hid nothing,
              because the table below states every one of those words in its own
              rows. The instruction wins. */}
          <p className="type-sm mt-0.5 max-w-[70ch] text-muted">
            Track how your credits are being used across your account.
          </p>
        </div>
        <label className="flex shrink-0 items-center gap-2 type-sm text-muted">
          Rows per page
          <Select
            aria-label="Rows per page"
            value={perPage}
            wrapperClassName="w-[84px]"
            className="h-9"
            onChange={(event) => {
              const next = Number(event.target.value)
              change(() => setPerPage(next))
              try {
                window.sessionStorage.setItem('sahoda.wallet.perPage', String(next))
              } catch {
                /* nothing to remember it with; the choice still applies now */
              }
            }}
          >
            {PER_PAGE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </Select>
        </label>
      </div>

      {/* THE SUMMARY. Scoped in the sentence below it, never in a tile label
          that a reader skims past. */}
      {filtered.length > 0 ? (
        <>
          <div className="grid gap-2 narrow:grid-cols-3">
            <Tile label="Spent" value={`-${totals.spent.toLocaleString('en-IN')}`} />
            <Tile label="Added" value={`+${totals.added.toLocaleString('en-IN')}`} />
            <Tile
              label="Net"
              value={`${totals.net > 0 ? '+' : totals.net < 0 ? '-' : ''}${Math.abs(totals.net).toLocaleString('en-IN')}`}
              tone={totals.net === 0 ? 'muted' : 'ink'}
            />
          </div>
          <p className="type-meta text-muted">
            Credits counted across{' '}
            {filtering ? (
              <>
                the <span className="num">{filtered.length.toLocaleString('en-IN')}</span> entries
                below
              </>
            ) : (
              scope
            )}
            . Holds and returns count as nothing here, because neither changes your total. The
            balance column shows what was spendable after each entry, so a hold lowers it until the
            action settles or returns.
            {!filtering && windowed ? ' Older activity is not counted here.' : ''}
          </p>
        </>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="relative w-full min-w-0 narrow:max-w-[280px] narrow:flex-1">
          <Search
            aria-hidden
            className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted"
          />
          <input
            type="search"
            value={query}
            onChange={(event) => change(() => setQuery(event.target.value))}
            placeholder="Search activity"
            aria-label="Search credit activity"
            className={cn(CONTROL, 'w-full pl-8')}
          />
        </span>
        <Select
          aria-label="Activity type"
          value={kind}
          wrapperClassName="w-auto max-w-none shrink-0"
          className="h-9"
          onChange={(event) => change(() => setKind(event.target.value as ActivityKind))}
        >
          {ACTIVITY_KINDS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
      </div>

      {visible.length > 0 ? (
        <LedgerTable
          entries={visible}
          skipped={skipped}
          limit={limit}
          settled={settled}
          correctedSeqs={correctedSeqs}
          showBalance
          notes={false}
        />
      ) : (
        // NOT the empty state. "You have no credit activity" and "nothing here
        // matches what you typed" are different claims, and only the second one
        // has a remedy the reader can act on.
        <p className="rounded-sm bg-surface-2 px-3 py-6 text-center type-sm text-muted">
          Nothing here matches that.{' '}
          <button
            type="button"
            className="card-link font-semibold text-ink underline underline-offset-2"
            onClick={() =>
              change(() => {
                setKind('all')
                setQuery('')
              })
            }
          >
            Clear the filters
          </button>{' '}
          to see everything again.
        </p>
      )}

      {filtered.length > 0 ? (
        <div className="flex flex-col items-center gap-3">
          <p className="type-meta text-muted">
            Showing <span className="num">{range.from.toLocaleString('en-IN')}</span> to{' '}
            <span className="num">{range.to.toLocaleString('en-IN')}</span> of{' '}
            <span className="num">{filtered.length.toLocaleString('en-IN')}</span>{' '}
            {filtered.length === 1 ? 'entry' : 'entries'}
            {filtering ? ' that match' : ''}.
          </p>
          {pages > 1 ? <Pager page={safePage} pages={pages} onGo={setPage} /> : null}
        </div>
      ) : null}

      {/* Owned here rather than by the table, because both sentences are about
          the whole history and not about the ten rows on screen. */}
      {!filtering && windowed && total !== null ? (
        <p className="type-meta text-muted">
          Your ledger holds <span className="num">{total.toLocaleString('en-IN')}</span> entries.
          This page lists the <span className="num">{limit}</span> most recent.
        </p>
      ) : null}
      <SkippedNote skipped={skipped} />
    </div>
  )
}

const PAGE_BUTTON =
  'grid h-8 min-w-8 place-items-center rounded-sm px-2 type-sm tabular-nums transition-micro'

function Pager({
  page,
  pages,
  onGo,
}: {
  page: number
  pages: number
  onGo: (page: number) => void
}) {
  const slots = pageSlots(page, pages)

  return (
    <nav aria-label="Credit activity pages" className="flex flex-wrap items-center gap-1">
      <button
        type="button"
        onClick={() => onGo(page - 1)}
        disabled={page <= 1}
        aria-label="Previous page"
        className={cn(
          PAGE_BUTTON,
          'text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        <ChevronLeft aria-hidden className="size-4" />
      </button>

      {slots.map((slot, i) =>
        slot === GAP ? (
          // Not a control: it goes nowhere, so it is not a button and it is not
          // in the tab order.
          <span key={`gap-${i}`} aria-hidden className={cn(PAGE_BUTTON, 'text-muted')}>
            …
          </span>
        ) : (
          <button
            key={slot}
            type="button"
            onClick={() => onGo(slot)}
            aria-label={`Page ${slot}`}
            aria-current={slot === page ? 'page' : undefined}
            className={cn(
              PAGE_BUTTON,
              slot === page
                ? // The one place this pager takes the accent. A solid brand
                  // fill on a 32px square is well inside the ration, and it is
                  // the only way "where am I" survives a glance.
                  'bg-brand font-semibold text-primary-foreground'
                : 'text-muted hover:bg-surface-3 hover:text-ink',
            )}
          >
            {slot}
          </button>
        ),
      )}

      <button
        type="button"
        onClick={() => onGo(page + 1)}
        disabled={page >= pages}
        aria-label="Next page"
        className={cn(
          PAGE_BUTTON,
          'text-muted hover:bg-surface-3 hover:text-ink disabled:opacity-40 disabled:hover:bg-transparent',
        )}
      >
        <ChevronRight aria-hidden className="size-4" />
      </button>
    </nav>
  )
}
