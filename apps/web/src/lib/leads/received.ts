import { agoWords } from '@/lib/home/ago'
import { resolveDisplayZone } from '@/lib/time/zone'

/**
 * WHEN AN ENQUIRY ARRIVED, IN TWO FORMS, BECAUSE THEY ANSWER TWO QUESTIONS.
 *
 * A shop owner scanning a board wants to know whether somebody has been left
 * waiting — that is "2 days ago". A shop owner ringing that person back wants to
 * know when to say they got in touch — that is "Sun 6 Sept, 3:12 pm". Neither
 * one substitutes for the other, and the card previously carried neither: the
 * expanded card printed no date at all.
 *
 * ── FORMATTED ON THE SERVER, ON PURPOSE ──────────────────────────────────────
 * The board is a client component. A relative age computed during render is a
 * different string on the server and in the browser, which React reports as a
 * hydration mismatch and then silently corrects — and it would put an
 * `Intl.DateTimeFormat` per row into the /leads bundle, on a route whose own
 * card file records a 26.7 kB regression that failed the budget. So `read.ts`
 * calls this once per lead and the card renders two strings.
 *
 * The cost is that the age is as old as the page: a board left open overnight
 * says "3 hours ago" in the morning. It is a rendered document and a reload
 * corrects it, which is the same bargain every other server-rendered time on
 * this product makes.
 *
 * ── AND THE ZONE IS THE WORKSPACE'S, WHEN IT HAS ONE ─────────────────────────
 * `resolveDisplayZone` is the one place that decides this, and it records
 * whether anybody chose the zone. MEASURED 2026-08-26: 32 of 33 workspaces have
 * no timezone, so nearly every reader sees the fallback — which is why nothing
 * here presents the fallback as the customer's own.
 */

const FORMATTERS = new Map<string, Intl.DateTimeFormat>()

/**
 * Cached per zone. `Intl.DateTimeFormat` is costly to construct and a board
 * renders up to 200 of these; building one per row is 200 formatters printing
 * the same shape.
 */
function formatter(zone: string): Intl.DateTimeFormat {
  let found = FORMATTERS.get(zone)
  if (!found) {
    // `en-GB` rather than `en-IN` for one reason: en-IN puts a comma after the
    // weekday ("Sun, 6 Sept"), which reads as a list. Both spell the month the
    // same way and both are 12-hour here.
    found = new Intl.DateTimeFormat('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
      timeZone: zone,
    })
    FORMATTERS.set(zone, found)
  }
  return found
}

export interface Received {
  /** "Sun 6 Sept, 3:12 pm", in the workspace's zone. Null if the row's stamp is unusable. */
  readonly when: string | null
  /** "2 days ago". Null on the same condition, never "just now" as a stand-in. */
  readonly age: string | null
  /** The zone the date was rendered in, and whether the workspace chose it. */
  readonly zone: string
  readonly zoneIsFallback: boolean
}

/**
 * A stamp that will not parse yields NULLS rather than today's date.
 *
 * A wrong "Received" line is worse than none: it is the field a person would use
 * to decide whether somebody has been ignored for a week.
 */
export function received(
  createdAt: string,
  now: Date,
  storedZone: string | null | undefined,
): Received {
  const { zone, fromWorkspace } = resolveDisplayZone(storedZone)
  const at = new Date(createdAt)
  if (Number.isNaN(at.getTime())) {
    return { when: null, age: null, zone, zoneIsFallback: !fromWorkspace }
  }
  return {
    when: formatter(zone).format(at),
    age: agoWords(createdAt, now),
    zone,
    zoneIsFallback: !fromWorkspace,
  }
}
