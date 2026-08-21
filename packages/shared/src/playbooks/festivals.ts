/**
 * THE FESTIVAL CALENDAR — fixed-date observances only, and the omission is the
 * feature.
 *
 * ── WHY DIWALI IS NOT IN HERE ────────────────────────────────────────────────
 * Diwali, Holi, Eid, Easter, Chinese New Year, Raksha Bandhan, Ganesh Chaturthi
 * and Navratri all move: they are set by a lunar or lunisolar calendar and their
 * Gregorian date is different every year. A hard-coded list of them would be a
 * list of dates somebody typed from memory, and the first wrong one would put a
 * customer's Diwali post out on the wrong day — the exact failure a festival
 * playbook exists to prevent.
 *
 * So this calendar holds ONLY observances whose Gregorian date does not move,
 * and the screen says out loud which ones are missing and why. An automation
 * that quietly guesses is worse than one that admits its calendar is partial:
 * the second can be worked around, the first cannot even be noticed.
 *
 * Adding the moving festivals is a real piece of work — an ephemeris or a
 * maintained data source, re-checked yearly — and it is named as the blocker on
 * the screen rather than approximated here.
 *
 * ── NO YEAR IS STORED ────────────────────────────────────────────────────────
 * Every entry is a (month, day) pair, so the calendar is correct in every year
 * without being re-authored. `upcomingFestivals` projects them onto whichever
 * year the window crosses, which is what makes the December-to-January wrap work
 * without a special case anywhere else.
 */

/** Which calendar an observance belongs to. A playbook subscribes to one or both. */
export type FestivalCalendar = 'india' | 'global'

export interface Festival {
  /** Stable identifier, used as the run's idempotency detail. Never shown. */
  key: string
  name: string
  calendar: FestivalCalendar
  /** 1–12. */
  month: number
  /** 1–31. Every entry here is a date that exists in every year. */
  day: number
  /**
   * What a business could honestly say about it. Deliberately a PROMPT for the
   * brief, not a caption: it steers the draft towards the customer's own offer
   * rather than towards a stock greeting.
   */
  angle: string
}

/**
 * The curated list. Fixed Gregorian dates, verifiable against any calendar.
 *
 * Kept short on purpose. A list of two hundred international awareness days
 * would make the playbook fire constantly and would train people to ignore it.
 */
export const FESTIVALS: readonly Festival[] = [
  {
    key: 'new-year',
    name: "New Year's Day",
    calendar: 'global',
    month: 1,
    day: 1,
    angle: 'what you are doing differently this year, rather than a greeting',
  },
  {
    key: 'republic-day-in',
    name: 'Republic Day',
    calendar: 'india',
    month: 1,
    day: 26,
    angle: 'restrained and national; no product push',
  },
  {
    key: 'valentines',
    name: "Valentine's Day",
    calendar: 'global',
    month: 2,
    day: 14,
    angle: 'gifting, pairs, or anything you sell that two people share',
  },
  {
    key: 'womens-day',
    name: "International Women's Day",
    calendar: 'global',
    month: 3,
    day: 8,
    angle: 'the women in your own business or your own customers, named specifically',
  },
  {
    key: 'earth-day',
    name: 'Earth Day',
    calendar: 'global',
    month: 4,
    day: 22,
    angle: 'only if you have something real to say about it — otherwise skip',
  },
  {
    key: 'workers-day',
    name: "International Workers' Day",
    calendar: 'global',
    month: 5,
    day: 1,
    angle: 'the people who make the thing you sell',
  },
  {
    key: 'environment-day',
    name: 'World Environment Day',
    calendar: 'global',
    month: 6,
    day: 5,
    angle: 'a concrete change you made, not a pledge',
  },
  {
    key: 'independence-day-in',
    name: 'Independence Day',
    calendar: 'india',
    month: 8,
    day: 15,
    angle: 'restrained and national; no product push',
  },
  {
    key: 'gandhi-jayanti',
    name: 'Gandhi Jayanti',
    calendar: 'india',
    month: 10,
    day: 2,
    angle: 'quiet and non-commercial; a dry day in much of India',
  },
  {
    key: 'halloween',
    name: 'Halloween',
    calendar: 'global',
    month: 10,
    day: 31,
    angle: 'playful; works for anything that can be themed',
  },
  {
    key: 'christmas',
    name: 'Christmas',
    calendar: 'global',
    month: 12,
    day: 25,
    angle: 'gifting, closing hours, and what you are doing over the break',
  },
  {
    key: 'new-years-eve',
    name: "New Year's Eve",
    calendar: 'global',
    month: 12,
    day: 31,
    angle: 'the year you had, in one concrete number you actually know',
  },
] as const

/**
 * THE FESTIVALS THIS CALENDAR CANNOT SEE, named so the screen can say them.
 *
 * A list of what is missing is part of the product, not an internal TODO. A
 * customer who runs this playbook and never gets a Diwali reminder needs to
 * learn that from the screen, on the day they turn it on.
 */
export const MOVING_FESTIVALS_NOT_COVERED = [
  'Diwali',
  'Holi',
  'Eid al-Fitr',
  'Eid al-Adha',
  'Easter',
  'Raksha Bandhan',
  'Ganesh Chaturthi',
  'Navratri and Dussehra',
] as const

export interface UpcomingFestival extends Festival {
  /** The observance's date in the year the window reaches it, at UTC midnight. */
  occursOn: Date
  /** Whole days from `from` to `occursOn`. 0 means today. */
  daysAway: number
}

/** UTC midnight for a calendar date. Used for both ends so the subtraction is exact. */
function utcDay(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day))
}

const MS_PER_DAY = 86_400_000

/**
 * Which observances fall within `leadDays` of `from`, soonest first.
 *
 * ── THE WINDOW IS INCLUSIVE AT BOTH ENDS, AND CROSSES THE YEAR ───────────────
 * Each festival is projected into `from`'s year AND the next one, and whichever
 * projection lands inside the window is the one returned. Without the second
 * projection a playbook with fourteen days of warning would go silent every
 * December — New Year's Day would be 355 days away rather than seven, and the
 * one time of year this feature is most obviously useful is the one time it
 * would do nothing.
 *
 * Comparison is at UTC midnight on both sides, so `daysAway` is a whole number
 * of days and never depends on the hour the job happened to run.
 */
export function upcomingFestivals(
  from: Date,
  leadDays: number,
  calendars: readonly FestivalCalendar[],
): UpcomingFestival[] {
  const wanted = new Set(calendars)
  const start = utcDay(from.getUTCFullYear(), from.getUTCMonth() + 1, from.getUTCDate())
  const found: UpcomingFestival[] = []

  for (const festival of FESTIVALS) {
    if (!wanted.has(festival.calendar)) continue
    for (const year of [start.getUTCFullYear(), start.getUTCFullYear() + 1]) {
      const occursOn = utcDay(year, festival.month, festival.day)
      const daysAway = Math.round((occursOn.getTime() - start.getTime()) / MS_PER_DAY)
      if (daysAway < 0 || daysAway > leadDays) continue
      found.push({ ...festival, occursOn, daysAway })
      break
    }
  }

  return found.sort((a, b) => a.daysAway - b.daysAway)
}
