/**
 * THE PER-CHANNEL CONTROLS A VERSION CAN CARRY, AND WHAT MAKES EACH ONE VALID.
 *
 * ── WHY THESE ARE OPTIONS AND NOT FORMATS ────────────────────────────────────
 * A poll is not a kind of post — it is a text post WITH a poll. Google's event
 * and offer are variations on a standard post, not different shapes of one. None
 * of them belongs in `POST_FORMATS`, and putting them there would have meant a
 * migration widening a CHECK constraint for something that is not a format.
 *
 * They ride `post_variants.extras`, the same untyped jsonb the Google button
 * already uses, and are parsed HERE — once — into a shape the builder can trust.
 *
 * ── AND WHY THE RULES LIVE BESIDE THE PARSE ──────────────────────────────────
 * Because for most of these, NOBODY ELSE CHECKS. MEASURED 2026-08-20 against
 * Zernio's own dry-run validator (docs/32 §4.3):
 *
 *   · Google Business `platformSpecificData` is validated NOT AT ALL.
 *     `topicType: 'BANANA'` passes. `callToAction` with a bogus type passes.
 *     `callToAction` with no `url` passes — although their OpenAPI document marks
 *     it `required: ['type','url']`. There is no safety net whatsoever.
 *   · Polls, by contrast, are the ONE block they fully enforce, and every bound
 *     below was measured one step either side of its limit.
 *
 * So the poll bounds are the vendor's, quoted from their own refusals, and the
 * Google rules are ours because the alternative is nobody's.
 *
 * Pure: no I/O, no clock, no imports outside this package's types.
 */

import type { FormatRefusal } from '../format-refusal'

/** A poll, on whichever channel is carrying it. */
export interface PollOption {
  /** LinkedIn requires a question; X's poll has none — the body IS the question. */
  question?: string
  options: string[]
  /** X: minutes, 5–10080. */
  durationMinutes?: number
  /** LinkedIn: one of four codes. */
  durationCode?: string
}

export interface GbpEventOption {
  title: string
  /** `YYYY-MM-DD`. Converted to Google's `{year,month,day}` by the builder. */
  startDate: string
  endDate?: string
}

export interface GbpOfferOption {
  couponCode?: string
  redeemUrl?: string
  terms?: string
}

export interface VariantOptions {
  poll?: PollOption
  /** Posted as a reply the moment the post lands. The hashtag-in-first-comment habit. */
  firstComment?: string
  /** Instagram usernames invited to co-author. */
  collaborators?: string[]
  /** The post's image was made by a model, and the platform is told so. */
  aiGenerated?: boolean
  gbpTopic?: 'EVENT' | 'OFFER'
  gbpEvent?: GbpEventOption
  gbpOffer?: GbpOfferOption
}

// ── THE BOUNDS, EVERY ONE MEASURED ──────────────────────────────────────────
/** X: *"Poll must have 2-4 options"*. LinkedIn: identical wording. */
export const POLL_MIN_OPTIONS = 2
export const POLL_MAX_OPTIONS = 4
/** X: *"Each poll option must be a non-empty string of 1-25 characters"*. */
export const X_POLL_OPTION_MAX = 25
/** LinkedIn: *"poll \"question\" must be 140 characters or fewer"*. */
export const LINKEDIN_POLL_QUESTION_MAX = 140
/** X: *"Poll duration must be an integer between 5 and 10080 minutes (7 days)"*. */
export const X_POLL_MIN_MINUTES = 5
export const X_POLL_MAX_MINUTES = 10080
/** LinkedIn: *"duration must be one of: ONE_DAY, THREE_DAYS, SEVEN_DAYS, FOURTEEN_DAYS"*. */
export const LINKEDIN_POLL_DURATIONS = [
  'ONE_DAY',
  'THREE_DAYS',
  'SEVEN_DAYS',
  'FOURTEEN_DAYS',
] as const
/** `[DOC]` only — the validator accepts four without complaint (docs/32 §4.3). */
export const INSTAGRAM_MAX_COLLABORATORS = 3

/** `YYYY-MM-DD`, and a real date. `2026-02-30` parses and is not a day. */
export function parseIsoDate(value: string): { year: number; month: number; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (match === null) return null
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  // Round-tripped through Date rather than range-checked per month, so February
  // and leap years are right without a table. `Date.UTC` avoids the local
  // timezone shifting the day across a boundary.
  const stamp = new Date(Date.UTC(year, month - 1, day))
  if (
    stamp.getUTCFullYear() !== year ||
    stamp.getUTCMonth() !== month - 1 ||
    stamp.getUTCDate() !== day
  ) {
    return null
  }
  return { year, month, day }
}

/**
 * Why this poll cannot be published on this channel, or null.
 *
 * Every message quotes a bound Zernio's validator was actually seen enforcing, so
 * a writer who fixes what this says gets a poll their validator accepts.
 */
export function refusePoll(channel: string, poll: PollOption): FormatRefusal | null {
  const options = poll.options.map((option) => option.trim()).filter((option) => option !== '')

  if (options.length < POLL_MIN_OPTIONS || options.length > POLL_MAX_OPTIONS) {
    return {
      code: 'POLL_OPTION_COUNT',
      message: `A poll needs between ${POLL_MIN_OPTIONS} and ${POLL_MAX_OPTIONS} answers — this one has ${options.length}.`,
    }
  }

  if (channel === 'x') {
    const tooLong = options.find((option) => Array.from(option).length > X_POLL_OPTION_MAX)
    if (tooLong !== undefined) {
      return {
        code: 'POLL_OPTION_TOO_LONG',
        message: `A poll answer on X holds ${X_POLL_OPTION_MAX} characters — “${tooLong.slice(0, 30)}…” is longer.`,
      }
    }
    const minutes = poll.durationMinutes
    if (
      minutes === undefined ||
      !Number.isInteger(minutes) ||
      minutes < X_POLL_MIN_MINUTES ||
      minutes > X_POLL_MAX_MINUTES
    ) {
      return {
        code: 'POLL_DURATION',
        message: `A poll on X runs between ${X_POLL_MIN_MINUTES} minutes and 7 days.`,
      }
    }
    return null
  }

  if (channel === 'linkedin') {
    const question = poll.question?.trim() ?? ''
    if (question === '') {
      return {
        code: 'POLL_NEEDS_QUESTION',
        message: 'A poll on LinkedIn needs a question of its own.',
      }
    }
    if (Array.from(question).length > LINKEDIN_POLL_QUESTION_MAX) {
      return {
        code: 'POLL_QUESTION_TOO_LONG',
        message: `A poll question on LinkedIn holds ${LINKEDIN_POLL_QUESTION_MAX} characters — this one has ${Array.from(question).length}.`,
      }
    }
    if (!(LINKEDIN_POLL_DURATIONS as readonly string[]).includes(poll.durationCode ?? '')) {
      return {
        code: 'POLL_DURATION',
        message: 'A poll on LinkedIn runs for one, three, seven or fourteen days.',
      }
    }
    return null
  }

  return {
    code: 'POLL_UNSUPPORTED',
    message: 'Polls are for X and LinkedIn.',
  }
}

/**
 * Why this Google post cannot be published as the topic it declares, or null.
 *
 * ── EVERY RULE HERE IS OURS, AND THAT IS THE FINDING ────────────────────────
 * Zernio validates none of it (docs/32 §4.3). Google itself returns a 400 for an
 * `EVENT` with no `event.schedule.startDate` (docs/31 §2.4) — which is a refusal
 * arriving after the credit is spent and the writer has gone home. So it is
 * caught here, in the editor and again before any adapter is reached.
 */
export function refuseGbpTopic(options: VariantOptions): FormatRefusal | null {
  if (options.gbpTopic === 'EVENT') {
    const event = options.gbpEvent
    const title = event?.title?.trim() ?? ''
    if (title === '') {
      return {
        code: 'GBP_EVENT_NEEDS_TITLE',
        message: 'An event needs a name — it is the heading Google shows.',
      }
    }
    if (event === undefined || parseIsoDate(event.startDate ?? '') === null) {
      return {
        code: 'GBP_EVENT_NEEDS_DATE',
        message: 'An event needs a start date. Google refuses the post without one.',
      }
    }
    if (event.endDate !== undefined && event.endDate.trim() !== '') {
      const end = parseIsoDate(event.endDate)
      if (end === null) {
        return {
          code: 'GBP_EVENT_BAD_DATE',
          message: 'That end date is not a date Google can read.',
        }
      }
      const start = parseIsoDate(event.startDate)!
      const asNumber = (d: { year: number; month: number; day: number }) =>
        d.year * 10000 + d.month * 100 + d.day
      if (asNumber(end) < asNumber(start)) {
        return {
          code: 'GBP_EVENT_ENDS_FIRST',
          message: 'This event ends before it starts.',
        }
      }
    }
    return null
  }

  if (options.gbpTopic === 'OFFER') {
    const offer = options.gbpOffer
    const hasSomething =
      (offer?.couponCode?.trim() ?? '') !== '' ||
      (offer?.redeemUrl?.trim() ?? '') !== '' ||
      (offer?.terms?.trim() ?? '') !== ''
    if (!hasSomething) {
      // Google accepts an offer with none of the three, and it publishes as an
      // ordinary update wearing an offer's label — which is a post that is not
      // what it says it is. Refusing is the same rule the format column enforces.
      return {
        code: 'GBP_OFFER_EMPTY',
        message:
          'An offer needs at least one of a coupon code, a link to redeem it, or its terms.',
      }
    }
    return null
  }

  return null
}
