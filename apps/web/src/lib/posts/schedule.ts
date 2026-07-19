import { CONSTRAINTS, type Channel, type PlatformSpec } from '@sahoda/shared'

/**
 * Schedule lead-time validation for the post composer.
 *
 * `scheduleMinLeadMinutes` is declared per channel in the Constraint Engine
 * (@sahoda/shared) but nothing enforced it, so FSD 3.1 "schedule >= 5 min
 * future" was unguarded. This module is the editor-side guard. It reads the
 * lead from CONSTRAINTS and never restates the number — a channel that changes
 * its lead changes this behavior for free.
 *
 * Pure: no I/O, no clock. `now` is always injected so callers and tests are
 * deterministic, and so server and client agree on the same instant.
 */

const MS_PER_MINUTE = 60_000

const isValidDate = (date: Date): boolean => !Number.isNaN(date.getTime())

/**
 * Largest lead required by the selected channels. Unknown channel keys and an
 * empty selection contribute no requirement, so the floor collapses to `now`.
 */
function leadMinutesFor(channels: readonly Channel[]): number {
  let lead = 0
  for (const channel of channels) {
    // Typed as PlatformSpec | undefined, never widened to a partial shape: a
    // rename of scheduleMinLeadMinutes upstream must be a compile error here,
    // not a silent collapse to "no lead" that disables the guard everywhere.
    const spec: PlatformSpec | undefined = CONSTRAINTS[channel]
    const channelLead = spec?.scheduleMinLeadMinutes ?? 0
    if (channelLead > lead) lead = channelLead
  }
  return lead
}

/**
 * Earliest instant the selected channels will accept. Returns an invalid Date
 * when `now` is invalid rather than inventing a time.
 */
export function earliestScheduleAt(channels: readonly Channel[], now: Date): Date {
  return new Date(now.getTime() + leadMinutesFor(channels) * MS_PER_MINUTE)
}

export interface ScheduleCheck {
  ok: boolean
  earliest: Date
  /** User-facing copy, present only when `ok` is false. */
  message?: string
}

function tooSoonMessage(leadMinutes: number): string {
  if (leadMinutes <= 0) return 'Pick a time in the future.'
  const unit = leadMinutes === 1 ? 'minute' : 'minutes'
  return `Pick a time at least ${leadMinutes} ${unit} from now.`
}

/**
 * Checks a requested schedule against the channels' minimum lead.
 *
 * A null `scheduledAt` means "publish now" and passes the lead check — the lead
 * only governs future-dated posts. Anything unparseable is refused with copy
 * that tells the user what to do, never with the underlying reason.
 *
 * An unreadable `now` fails closed even for "publish now": `earliest` would be
 * an Invalid Date, and returning ok:true alongside it would both assert a
 * verdict no clock backed and hand the UI a value that renders "Invalid Date".
 */
export function validateScheduleLead(
  channels: readonly Channel[],
  scheduledAt: Date | null,
  now: Date,
): ScheduleCheck {
  const earliest = earliestScheduleAt(channels, now)

  if (!isValidDate(now)) {
    return { ok: false, earliest, message: 'Pick a valid date and time.' }
  }

  if (scheduledAt === null) return { ok: true, earliest }

  if (!isValidDate(scheduledAt)) {
    return { ok: false, earliest, message: 'Pick a valid date and time.' }
  }

  if (scheduledAt.getTime() >= earliest.getTime()) return { ok: true, earliest }

  return { ok: false, earliest, message: tooSoonMessage(leadMinutesFor(channels)) }
}
