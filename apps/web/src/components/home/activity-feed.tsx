import { Check, Minus, Sparkles } from 'lucide-react'
import type { LedgerEntry } from '@sahoda/shared'

import { describeEntry } from '@/lib/wallet/entry-copy'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * The activity feed (reference `.act`), for the right rail.
 *
 * ── WHY NOT THE LEDGER TABLE ─────────────────────────────────────────────────
 * Home used to render `<LedgerTable>` full-width at the bottom of the page.
 * Moved into a 380px rail it overflowed and grew a horizontal scrollbar, which
 * is the honest signal that a table is the wrong component here: a table is for
 * comparing rows across columns, and nobody scans "when / activity / credits"
 * columns in a sidebar. The reference uses a three-part ROW — glyph, what
 * happened, how long ago — and that is what a feed is.
 *
 * The full table still exists, unchanged, on /wallet, which is where you go to
 * compare entries. The "View all" link goes there.
 *
 * ── THE NUMBER STAYS ─────────────────────────────────────────────────────────
 * Credits are shown per row. This is a ledger surface, and dropping the amount
 * to make the row fit would leave a feed that says something happened without
 * saying what it cost — the one thing a credit entry is for.
 *
 * ── THE POSITIVE PILL IS ACHROMATIC, AND THAT IS NOT AN OVERSIGHT ────────────
 * The design this was rebuilt from codes the two directions orange-down and
 * GREEN-up. There is no green in this product and its absence is argued, not
 * accidental — `tokens.css` says it in the palette itself: "THERE IS NO RED,
 * GREEN OR AMBER IN THIS PALETTE ... --ok and --info are achromatic, because
 * 'it worked' and 'here is some context' are the two states that never need to
 * shout." docs/37 §1 adds the reason: severity and certainty are carried by fill
 * weight, glyph and label so they survive greyscale, a tenant's Brand Skin and a
 * colour-blind reader, and §2.4 makes "never use hue to carry severity" a Never.
 *
 * So the direction is carried FOUR ways here, none of them hue alone: the glyph
 * (spark, tick or dash), the tile fill, the pill fill, and the sign printed in
 * the number itself. `--ok` / `--ok-bg` are the tokens that exist for exactly
 * this and they resolve to ink-on-a-4%-wash in light and the inverse in dark.
 * Introducing green would mean a new token pair, a new Brand Skin contract, and
 * a rule in the greyscale guard that this system deliberately refuses.
 */

/** IST, the zone every other date on this product is rendered in. */
const TIME = new Intl.DateTimeFormat('en-IN', {
  timeZone: DEFAULT_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hour12: true,
})
const DAY = new Intl.DateTimeFormat('en-IN', {
  timeZone: DEFAULT_ZONE,
  day: 'numeric',
  month: 'short',
})
/** The calendar day in IST, so "Today" means today where the reader is. */
const DAY_KEY = new Intl.DateTimeFormat('en-IN', {
  timeZone: DEFAULT_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/**
 * "Today, 10:24 am" · "Yesterday, 07:45 pm" · "12 Aug, 10:24 am".
 *
 * Returns null for a timestamp that does not parse rather than printing
 * "Invalid Date", which is the shape of a figure no query produced.
 */
function whenLabel(iso: string, now: Date): string | null {
  const at = new Date(iso)
  if (Number.isNaN(at.getTime())) return null

  const key = DAY_KEY.format(at)
  const today = DAY_KEY.format(now)
  const yesterday = DAY_KEY.format(new Date(now.getTime() - 86_400_000))
  const time = TIME.format(at)

  if (key === today) return `Today, ${time}`
  if (key === yesterday) return `Yesterday, ${time}`
  return `${DAY.format(at)}, ${time}`
}

export function ActivityFeed({
  entries,
  unreadable = false,
}: {
  entries: LedgerEntry[]
  /**
   * The read FAILED, rather than coming back empty. Both carry zero entries, so
   * without this the card below states that nothing has ever happened to this
   * person's credits on the strength of a question that got no answer.
   */
  unreadable?: boolean
}) {
  if (unreadable) {
    return (
      <p role="alert" className="px-4 py-6 text-center type-sm text-danger">
        Sahoda could not load this just now. Reload to try again. Nothing was charged.
      </p>
    )
  }

  if (entries.length === 0) {
    return (
      <p className="px-4 py-6 text-center type-sm text-muted">
        Nothing yet. Credits you use or get show up here.
      </p>
    )
  }

  const now = new Date()

  return (
    <ul className="divide-y divide-line-soft px-4">
      {entries.map((entry) => {
        // A grant is something that arrived; a spend is something Sahoda did.
        // `describeEntry` is the ONE place a ledger row gets its words. A
        // second label written here is a second chance to describe money
        // differently from the table that shows the same row.
        const display = describeEntry(entry)
        // ⚠ THE SIGN IS NOT IN `amount`, AND READING IT THERE INVERTED EVERY
        // SPEND ON THIS CARD.
        //
        // `credit_ledger` carries a CHECK constraint:
        //   (entry_type = 'ADJUST' and amount <> 0)
        //   or (entry_type <> 'ADJUST' and amount > 0)
        // so a DEBIT's amount is POSITIVE by definition and the direction lives
        // in `entry_type`. `entry.amount > 0` was therefore true for every row
        // in the table, and Home rendered a 100-credit SPEND as "+100" with a
        // tick — directly above a balance of 0. MEASURED on the zero-balance
        // journey: "Ux probe +100" and "Welcome credits +100" read as +200
        // arriving, while /wallet showed the same first row as -100.
        //
        // `describeEntry` already answers this, and this component was already
        // calling it — for the label only, then re-deriving the sign itself.
        // A second derivation is a second chance to describe money differently
        // from the table showing the same row, which is exactly what happened.
        // ⚠ THREE DIRECTIONS, NOT TWO. `Direction` is credit | debit | NEUTRAL,
        // and a HOLD or a RELEASE is neutral because it does not move the wallet
        // total — `signedAmount` prints a bare magnitude for exactly that reason
        // ("'3' (reserved)", in its own doc comment). A binary spent/not-spent
        // split paints a reservation as money arriving, which is the same defect
        // as the inverted-sign bug above, one rung quieter. The previous version
        // of this file gave neutral a TICK for the same reason.
        const tone =
          display.direction === 'debit'
            ? { pill: 'bg-brand-wash text-accent', Glyph: Sparkles }
            : display.direction === 'credit'
              ? { pill: 'bg-ok-bg text-ok', Glyph: Check }
              : { pill: 'bg-s2 text-muted', Glyph: Minus }
        const when = whenLabel(entry.created_at, now)

        return (
          <li key={entry.seq} className="flex items-center gap-3 py-3">
            <span
              aria-hidden
              className={`grid size-9 shrink-0 place-items-center rounded-pill ${tone.pill}`}
            >
              <tone.Glyph size={15} strokeWidth={1.8} />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate type-sm font-[550] text-ink">{display.label}</span>
              {/* Absent, not "Invalid Date", when the stamp does not parse. */}
              {when ? <span className="block truncate type-meta text-muted">{when}</span> : null}
            </span>

            {/* The sign is in the number too. The pill is a fourth encoding of
                a direction the glyph, the tile and the sign already carry. */}
            <span
              className={`shrink-0 rounded-pill px-2 py-0.5 type-meta font-[550] tabular-nums ${tone.pill}`}
            >
              {display.signedAmount}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
