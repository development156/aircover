import type { OpsChangelogEntry } from '@sahoda/shared'

import { formatIst } from './session-pulse'
import { DEFAULT_ZONE } from '@/lib/time/zone'

/**
 * Changelog formatting and grouping (doc 13 §8). Pure — no clipboard, no clock.
 *
 * The copy output is the product here, not a convenience: these entries get
 * pasted straight into WhatsApp and investor notes, so what leaves the clipboard
 * has to read as finished prose to someone who has never seen this dashboard.
 */

/** `2026-07-25` in IST — the day an entry belongs to for grouping. */
export function istDayKey(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return 'unknown'

  // en-CA gives ISO-shaped `YYYY-MM-DD`, which sorts lexicographically.
  return new Intl.DateTimeFormat('en-CA', { timeZone: DEFAULT_ZONE }).format(date)
}

/** `Saturday, 25 July 2026` — the heading above a day's entries. */
export function istDayLabel(at: string): string {
  const date = new Date(at)
  if (Number.isNaN(date.getTime())) return 'Unknown date'

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DEFAULT_ZONE,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

export interface ChangelogDay {
  key: string
  label: string
  entries: OpsChangelogEntry[]
}

/** Newest day first, and newest entry first within a day. */
export function groupByDay(entries: readonly OpsChangelogEntry[]): ChangelogDay[] {
  const days = new Map<string, ChangelogDay>()

  for (const entry of [...entries].sort((a, b) => b.seq - a.seq)) {
    const key = istDayKey(entry.happened_at)
    const day = days.get(key)
    if (day) day.entries.push(entry)
    else days.set(key, { key, label: istDayLabel(entry.happened_at), entries: [entry] })
  }

  return [...days.values()].sort((a, b) => (a.key < b.key ? 1 : -1))
}

/**
 * What lands in the clipboard as plain text.
 *
 * DELIBERATELY OMITS `details_tech`. The plain copy is the one that gets pasted
 * to a non-technical reader, and doc 13 §8 puts the technical detail behind a
 * disclosure precisely so it does not travel by default. The markdown copy
 * carries it, because that one is for a changelog file or a PR.
 */
export function toPlainText(entry: OpsChangelogEntry): string {
  const when = formatIst(entry.happened_at)
  return [entry.title, '', entry.summary_plain, '', `by ${entry.author}${when ? ` · ${when}` : ''}`]
    .join('\n')
    .trim()
}

export function toMarkdown(entry: OpsChangelogEntry): string {
  const when = formatIst(entry.happened_at)
  const codes = entry.task_codes.length > 0 ? ` (${entry.task_codes.join(', ')})` : ''

  return [
    `### ${entry.title}`,
    '',
    entry.summary_plain,
    ...(entry.details_tech ? ['', '<details><summary>Technical details</summary>', ''] : []),
    ...(entry.details_tech ? [entry.details_tech, '', '</details>'] : []),
    '',
    `*${entry.kind}${codes} · ${entry.author}${when ? ` · ${when}` : ''}*`,
  ]
    .join('\n')
    .trim()
}

/** One day's worth, plain text, for the "Copy day" button. */
export function dayToPlainText(day: ChangelogDay): string {
  return [day.label, '', ...day.entries.map(toPlainText)].join('\n\n').trim()
}
