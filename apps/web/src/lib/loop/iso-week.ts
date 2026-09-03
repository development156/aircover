/**
 * ISO week arithmetic, for the one key a cycle is stored under.
 *
 * ── WHY ISO AND NOT "THE WEEK STARTING SUNDAY" ───────────────────────────────
 * `loop_cycles` is unique on `(workspace_id, iso_year, iso_week)` for live
 * cycles, so this function decides whether two runs are the same cycle attempted
 * twice or two different weeks. ISO weeks start on Monday, always have seven
 * days, and never split across a year boundary in a way that leaves a day in no
 * week — which is exactly what a hand-rolled "day of year over seven" does at
 * the turn of a year, and it fails in the last week of December, once a year,
 * silently.
 *
 * ── NO CLOCK IS READ IN THIS FILE ────────────────────────────────────────────
 * Every function takes the instant it should work from. A stage that read the
 * clock itself would produce a different answer on a Sunday night than on a
 * Monday morning for the same cycle, and its tests would pass or fail depending
 * on the day they ran. The caller passes `now` once, at the top, exactly as
 * `planMyWeek` passes `nowIso` into the model.
 */

const DAY_MS = 86_400_000

export interface IsoWeek {
  isoYear: number
  isoWeek: number
}

/**
 * The ISO-8601 year and week of an instant, in UTC.
 *
 * The algorithm is the standard one: move to the Thursday of the same week —
 * ISO defines a week's year as the year containing its Thursday — then count
 * weeks from the first Thursday of that year.
 */
export function isoWeekOf(at: Date): IsoWeek {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  // getUTCDay: Sunday 0 … Saturday 6. ISO counts Monday as 1 and Sunday as 7.
  const isoDay = d.getUTCDay() === 0 ? 7 : d.getUTCDay()
  // Step to this week's Thursday. That date's calendar year IS the ISO year.
  d.setUTCDate(d.getUTCDate() + 4 - isoDay)
  const isoYear = d.getUTCFullYear()
  const jan1 = Date.UTC(isoYear, 0, 1)
  const isoWeek = Math.ceil(((d.getTime() - jan1) / DAY_MS + 1) / 7)
  return { isoYear, isoWeek }
}

/**
 * The week a cycle running now is PLANNING FOR.
 *
 * A cycle runs on the Sunday before the week it plans, so the ISO week it is
 * stored under is next week's, not the week the job happened to execute in.
 * Getting this wrong would file Sunday's plan under the week that just ended and
 * collide with the cycle already there.
 *
 * Any other day is treated as planning the week that contains it — a person
 * pressing "Plan my week now" on a Wednesday means this week, not next.
 */
export function planningWeekFor(at: Date): IsoWeek {
  const isSunday = at.getUTCDay() === 0
  return isoWeekOf(isSunday ? new Date(at.getTime() + DAY_MS) : at)
}

/** The seven days a cycle reflects on: the week BEFORE the one it plans. */
export function reflectionWindow(at: Date, days = 7): { fromIso: string; toIso: string } {
  const to = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate()))
  const from = new Date(to.getTime() - days * DAY_MS)
  return { fromIso: from.toISOString().slice(0, 10), toIso: to.toISOString().slice(0, 10) }
}

/**
 * The Monday an ISO week starts on, in UTC.
 *
 * The inverse of `isoWeekOf`, and it exists for the same reason that function
 * does: a week has to be turned back into two dates before it can be shown to a
 * person, and "week 35" is not a thing anybody outside a calendar library says.
 *
 * Built from 4 January, which ISO guarantees falls in week 1 of its own year —
 * the property that makes this correct in the last days of December, where
 * counting weeks forward from 1 January is off by one about a fifth of the time.
 */
export function isoWeekStart(isoYear: number, isoWeek: number): Date {
  const jan4 = new Date(Date.UTC(isoYear, 0, 4))
  const isoDay = jan4.getUTCDay() === 0 ? 7 : jan4.getUTCDay()
  const week1Monday = jan4.getTime() - (isoDay - 1) * DAY_MS
  return new Date(week1Monday + (isoWeek - 1) * 7 * DAY_MS)
}
