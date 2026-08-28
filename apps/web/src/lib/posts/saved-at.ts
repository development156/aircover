/**
 * When a post was last saved, as the posts list says it.
 *
 * ── WHY THIS IS NOT `relativeAge` ────────────────────────────────────────────
 * The card used `relativeAge` from `lib/ops/session-pulse`, which keeps counting
 * in days forever: "Saved 20 days ago", "Saved 35 days ago". Past a day that is
 * a number the reader has to convert back into a date to do anything with, and
 * on this screen it sat directly under a scheduled date written out in full —
 * two time facts in two different vocabularies, one of them unusable.
 *
 * `relativeAge` is NOT changed, because the admin strips render it too and a
 * pulse chip genuinely wants the loose form. This is the posts list's own rule.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 *
 *   under a minute      just now
 *   under an hour       Saved 43 minutes ago
 *   up to 24 hours      Saved 5 hours ago  ·  Saved 24 hours ago
 *   over 24 hours       Saved 26/07/2026, 6:30 pm IST
 *
 * Minutes are kept below the hour deliberately. The brief said hours, and hours
 * alone would render a post saved four minutes ago as "Saved 0 hours ago" — a
 * true statement that answers nothing, on the freshest post on the screen and
 * the one most likely to be looked at. The hour form starts where it is useful.
 *
 * 24 hours is inside the relative form, not the boundary past it: "Saved 24
 * hours ago" was given as an example of the relative wording, so the switch is
 * at MORE than 24 hours.
 *
 * ── THE ZONE IS NAMED, ALWAYS ────────────────────────────────────────────────
 * `IST` is printed for the same reason `formatScheduledAt` prints it: an
 * unlabelled wall-clock time is a wrong number to anyone outside that zone, and
 * this codebase already carries a known contradiction there (India time is
 * hardcoded while the scheduling input runs on the browser's own zone). Naming
 * the zone does not fix that, but it stops this line from hiding it.
 */

/** `26/07/2026, 6:30 pm` — day first, then month, then the four-digit year. */
const SAVED_FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
  timeZone: 'Asia/Kolkata',
})

/**
 * Above this, the line stops counting and starts naming the moment.
 *
 * In MINUTES, not hours, and that is the whole of it. The first version tested
 * the ROUNDED hour count — `Math.round(minutes / 60) <= 24` — which is not the
 * rule it claims to be: a post saved 24 hours and 29 minutes ago rounds to 24
 * and reads "Saved 24 hours ago", twenty-nine minutes past the boundary the
 * comment above it states. Computed, not guessed: 23h40m, 24h00m and 24h29m all
 * land on 24. The comparison is now on the elapsed time itself, so 24h00m is
 * relative and 24h01m is a date, exactly as written.
 */
const RELATIVE_MINUTES_MAX = 24 * 60

/**
 * The words after "Saved", or null when there is no usable timestamp.
 *
 * Null rather than a placeholder: a card with an unparseable `updated_at`
 * renders no saved line at all, which is the honest "we cannot say". Printing
 * "Invalid Date" or falling back to now would both be worse than silence.
 */
export function formatSavedAt(at: string | null, now: Date): string | null {
  if (!at) return null
  const then = Date.parse(at)
  if (Number.isNaN(then)) return null

  // ── NO `Math.max(0, …)` HERE, AND THAT IS DELIBERATE ──────────────────────
  // The first version clamped at zero against a row written by a clock running
  // ahead of this one. Mutating the clamp away changed no output and no test
  // went red, which is the definition of a guard that is not one — so the clamp
  // went instead of being decorated with a test that cannot fail. The `< 60`
  // below already absorbs every negative: a future timestamp is "just now", not
  // "saved in -1 minutes". The behaviour is pinned by a test; the dead defence
  // is gone.
  const seconds = Math.round((now.getTime() - then) / 1000)
  if (seconds < 60) return 'just now'

  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${minutes} ${minutes === 1 ? 'minute' : 'minutes'} ago`

  if (minutes <= RELATIVE_MINUTES_MAX) {
    const hours = Math.round(minutes / 60)
    return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`
  }

  // `formatToParts` rather than `format`: en-GB renders "26/07/2026, 6:30 pm"
  // on some runtimes and "26/07/2026, 6:30 PM" on others, and the app's copy is
  // lower case. Reassembling makes the casing ours rather than the runtime's.
  //
  // ── AND THE NORMALISATION BELOW IS UNPROVABLE HERE, ON PURPOSE ────────────
  // MEASURED on this repo's runtime (Node 22.22.2, ICU 78.2): `dayPeriod` is
  // already `am`/`pm`, lower case, no periods — so `.toLowerCase()` and the
  // period strip are no-ops, and deleting either leaves every test green. That
  // normally means dead code, and dead defences were removed from this file
  // once already (the clock-skew clamp above).
  //
  // This one stays, and the distinction is real rather than a preference: the
  // clamp was dead for EVERY possible input on ANY runtime, because a negative
  // always falls under the `< 60` threshold. This is dead only on THIS ICU
  // build. `p.m.` and `PM` are both things ICU emits elsewhere, and the cost of
  // being wrong is a date line reading "6:30 P.M." in production while every
  // test here says otherwise. Unprovable is not the same as unnecessary.
  const parts = SAVED_FORMAT.formatToParts(new Date(then))
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? ''
  const day = value('day')
  const month = value('month')
  const year = value('year')
  const hour = value('hour')
  const minute = value('minute')
  const period = value('dayPeriod').toLowerCase().replace(/\./g, '')

  return `${day}/${month}/${year}, ${hour}:${minute} ${period} IST`
}
