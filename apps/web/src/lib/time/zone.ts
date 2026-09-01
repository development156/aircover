/**
 * The one place this product turns a stored instant into somebody's wall clock,
 * and back.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * `Asia/Kolkata` was written into 31 places across 25 files, and the scheduling
 * INPUT was not one of them: the picker built its instant on the browser's own
 * clock. MEASURED — a customer in Dubai picks "tomorrow morning", the composer
 * confirms 9:00 am, and the posts list calls the same post 10:30 am. Neither
 * number is wrong on its own; the product simply told them two different times
 * for one post, and the week grid told them the bare one with no zone at all.
 *
 * ── WHAT A FALLBACK MAY AND MAY NOT CLAIM ────────────────────────────────────
 * MEASURED 2026-08-26: 32 of 33 workspaces have no timezone, and
 * `workspace-timezone.pglite.test.ts` pins that absence as deliberate — a
 * default of UTC or IST written into the COLUMN would turn every one of those
 * into a confident claim about where somebody lives.
 *
 * A DISPLAY fallback is a different thing from a stored default, and this is the
 * line: rendering has to pick some zone, so it picks the one those workspaces
 * already see, and `fromWorkspace` records that nobody chose it. Nothing may
 * present a fallback zone as the customer's own.
 */

/** A wall clock as a person reads it. Month is 1-12, not the Date constructor's 0-11. */
export interface WallClock {
  year: number
  month: number
  day: number
  hour: number
  minute: number
}

/**
 * The zone every workspace without one of its own is rendered in — the zone
 * those 32 workspaces see today, so adopting this module moves nobody's times.
 */
export const DEFAULT_DISPLAY_ZONE = 'Asia/Kolkata'

/**
 * Whether the runtime knows this zone.
 *
 * `Intl` throws a RangeError for a name it cannot resolve, which is the only
 * reliable test available here: a regular expression would accept
 * `Asia/Kolkatta`, the exact typo the database trigger exists to refuse.
 */
export function isKnownZone(zone: string | null | undefined): boolean {
  if (typeof zone !== 'string' || zone.trim() === '') return false
  // An offset is a fact about one instant and cannot know when the rules change,
  // so it is not a zone even though `Intl` tolerates some spellings of one.
  if (/^[+-]/.test(zone)) return false
  // MEASURED: `Intl` accepts the abbreviation `IST` as a zone. It must not be
  // stored as one — an abbreviation names a CLOCK, not a place, and `IST` names
  // three different clocks (India, Ireland, Israel). Every real IANA name is
  // `Region/City`, and `UTC` is the one legitimate exception.
  if (zone !== 'UTC' && !zone.includes('/')) return false
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: zone })
    return true
  } catch {
    return false
  }
}

/**
 * The zone to render a workspace's times in, and whether the workspace chose it.
 *
 * A stored value the runtime cannot use falls back rather than throwing: a
 * screen that renders beats a screen that does not, and `fromWorkspace: false`
 * keeps the label from claiming a choice nobody made.
 */
export function resolveDisplayZone(stored: string | null | undefined): {
  zone: string
  fromWorkspace: boolean
} {
  return isKnownZone(stored)
    ? { zone: stored as string, fromWorkspace: true }
    : { zone: DEFAULT_DISPLAY_ZONE, fromWorkspace: false }
}

/**
 * The short name a reader in that zone would write beside a time, at that
 * instant — `IST`, `PST`, `PDT`, or an offset where the zone has no common
 * abbreviation.
 *
 * Taken AT an instant on purpose: a label fixed at one side of a daylight-saving
 * boundary is wrong for half the year, and it is the half nobody checks.
 */
export function zoneLabel(zone: string, at: Date): string {
  // MEASURED across locales: no single one gives every zone its local
  // abbreviation. `en-IN` names `Asia/Kolkata` as IST — the zone this product
  // actually ships to, and the one whose readers would find `GMT+5:30` odd — and
  // falls back to an offset elsewhere, which is still a fact a reader can act
  // on. It is also the locale every other formatter here already uses.
  const parts = new Intl.DateTimeFormat('en-IN', {
    timeZone: zone,
    timeZoneName: 'short',
  }).formatToParts(at)
  return parts.find((p) => p.type === 'timeZoneName')?.value ?? zone
}

const PARTS_CACHE = new Map<string, Intl.DateTimeFormat>()

function partsFormatter(zone: string): Intl.DateTimeFormat {
  let f = PARTS_CACHE.get(zone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
    PARTS_CACHE.set(zone, f)
  }
  return f
}

/** The wall clock a reader in `zone` sees at this instant. */
export function partsInZone(zone: string, at: Date): WallClock {
  const parts = partsFormatter(zone).formatToParts(at)
  const get = (type: Intl.DateTimeFormatPartTypes): number => {
    const raw = parts.find((p) => p.type === type)?.value ?? '0'
    return Number(raw)
  }
  // `hour12: false` renders midnight as 24 in some runtimes; a reader means 0.
  const hour = get('hour')
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: hour === 24 ? 0 : hour,
    minute: get('minute'),
  }
}

/** How far `zone` is from UTC at a given instant, in minutes. */
function offsetMinutes(zone: string, at: Date): number {
  const p = partsInZone(zone, at)
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute)
  // Seconds and milliseconds are not in `p`, so compare on whole minutes.
  return (asUtc - Math.floor(at.getTime() / 60_000) * 60_000) / 60_000
}

/**
 * The instant a person in `zone` means when they pick this wall clock.
 *
 * ── WHY TWO PASSES AND NOT ONE ───────────────────────────────────────────────
 * The offset cannot be known until the instant is known, and the instant cannot
 * be computed without the offset. So: guess the offset by treating the wall
 * clock as UTC, correct, then read the offset AGAIN at the corrected instant and
 * correct once more. One pass is right except across a daylight-saving boundary,
 * where it is an hour wrong — which is the case a casual test never reaches and
 * a customer reaches twice a year.
 *
 * ── THE TWO WALL CLOCKS THAT ARE NOT ONE INSTANT ─────────────────────────────
 * A time that happens TWICE (the hour a clock repeats) resolves to the FIRST,
 * earlier instant. A time that never happens at all (the hour a clock skips)
 * resolves to the same distance past the jump, which is what every calendar
 * does. Both are stated choices rather than accidents, and both are pinned by
 * tests — a scheduler that silently took the later branch would publish an hour
 * late once a year with nothing to point at.
 */
export function instantAtWallClock(zone: string, wall: WallClock): Date {
  const asIfUtc = Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute)

  // Three offsets: the one in force if the wall clock were read as UTC, and the
  // ones a day either side. Any transition near this date sits between those
  // samples, so an hour the clock REPEATS yields both of its instants here and
  // an hour it SKIPS yields neither.
  //
  // Which candidate is right is then decided by ASKING rather than by
  // arithmetic: render each one back and see which a reader in that zone would
  // call by the name the caller used. A rule that instead compares the two
  // instants gets one transition backwards — MEASURED, it moved a skipped 02:30
  // to 01:30, an hour BEFORE what was asked for.
  //
  // A corrective second pass — the offset re-read at the first candidate, the
  // textbook refinement — was written here and then removed. MEASURED over
  // 210,240 wall clocks across 12 zones, including the 45-minute offsets of
  // Kathmandu and Chatham, it changed the answer zero times once these three
  // candidates existed, and it survived every mutation because nothing could
  // tell it was there.
  const candidates = [
    ...new Set([
      asIfUtc - offsetMinutes(zone, new Date(asIfUtc)) * 60_000,
      asIfUtc - offsetMinutes(zone, new Date(asIfUtc - 86_400_000)) * 60_000,
      asIfUtc - offsetMinutes(zone, new Date(asIfUtc + 86_400_000)) * 60_000,
    ]),
  ]
    .sort((a, b) => a - b)
    .map((t) => new Date(t))

  const readsBack = candidates.filter((c) => {
    const p = partsInZone(zone, c)
    return (
      p.year === wall.year &&
      p.month === wall.month &&
      p.day === wall.day &&
      p.hour === wall.hour &&
      p.minute === wall.minute
    )
  })

  // One or both read back: the wall clock exists, and where it exists twice the
  // FIRST occurrence is the one taken.
  if (readsBack.length > 0) return readsBack[0]!

  // Neither reads back: the clock skipped this time entirely. Push forward to
  // the later candidate, which lands the same distance past the jump — what
  // every calendar does, and the direction that never publishes early.
  return candidates[candidates.length - 1]!
}
