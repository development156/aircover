import type { Compared } from './model'
import type { CountRead, WeeklyRead } from './read'
import { REPORT } from './strings'
import { percentMove } from './verdict'

/**
 * TURNING A READING INTO A SENTENCE, AND REFUSING TO WHEN IT CANNOT.
 *
 * Pure on purpose. The rule the acceptance criteria state — "no section ever
 * displays a comparison it cannot support with real data" — is a property of
 * these four functions, and it is provable here without a database.
 */

/** Rounded, and grouped the way a person in India reads a number. */
export function readable(value: number): string {
  return Math.round(value).toLocaleString('en-IN')
}

export function comparedReach(read: WeeklyRead): Compared {
  if (read.status === 'unreadable') return { status: 'unreadable' }
  if (read.baseline === null) return { status: 'learning', value: read.value }
  const pct = percentMove(read.value, read.baseline)
  if (pct === null || pct < 10) {
    return { status: 'ok', value: read.value, comparison: REPORT.numbers.sameAsNormal }
  }
  return {
    status: 'ok',
    value: read.value,
    comparison:
      read.value > read.baseline
        ? REPORT.numbers.upOnNormal(pct)
        : REPORT.numbers.downOnNormal(pct),
  }
}

export function comparedReplies(read: CountRead): Compared {
  if (read.status === 'unreadable') return { status: 'unreadable' }
  if (read.previous === null) return { status: 'learning', value: read.value }
  const pct = percentMove(read.value, read.previous)
  if (pct === null || pct < 10) {
    return { status: 'ok', value: read.value, comparison: REPORT.numbers.sameAsLastWeek }
  }
  return {
    status: 'ok',
    value: read.value,
    comparison:
      read.value > read.previous
        ? REPORT.numbers.upOnLastWeek(pct)
        : REPORT.numbers.downOnLastWeek(pct),
  }
}

/**
 * Enquiries carry a different second line from the other two: how many are still
 * waiting on the reader. That is an instruction, not a comparison, and it is the
 * more useful of the two for a number this small.
 */
export function comparedEnquiries(
  read: { status: 'ok'; value: number; unanswered: number } | { status: 'unreadable' },
): Compared {
  if (read.status === 'unreadable') return { status: 'unreadable' }
  return {
    status: 'ok',
    value: read.value,
    comparison: REPORT.numbers.unanswered(read.unanswered),
  }
}

/** The second line under a number, whatever state it is in. */
export function comparisonLine(compared: Compared): string {
  if (compared.status === 'unreadable') return REPORT.numbers.unreadable
  if (compared.status === 'learning') return REPORT.numbers.stillLearning
  return compared.comparison
}
