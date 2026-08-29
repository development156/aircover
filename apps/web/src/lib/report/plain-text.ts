import type { ReportView } from './model'
import { comparisonLine, readable } from './compose'
import { REPORT } from './strings'

/**
 * THE REPORT AS ONE MESSAGE, FOR WHATSAPP.
 *
 * ── UNDER A THOUSAND CHARACTERS, AND THE CUT IS FROM THE BOTTOM ──────────────
 * WhatsApp will carry far more than this, but a person reading between customers
 * will not. The budget is enforced rather than hoped for: sections are appended
 * in order of what a shop owner needs first, and the first one that would break
 * the limit ends the message. The verdict and the three numbers are therefore
 * never the part that gets dropped.
 *
 * ── NO MARKDOWN ──────────────────────────────────────────────────────────────
 * WhatsApp does not render it, so an asterisk reaches the reader as an asterisk.
 */

export const PLAIN_TEXT_LIMIT = 1000

export function toPlainText(report: ReportView): string {
  const parts: string[] = []

  parts.push(`${REPORT.title}, ${report.week.label}`)

  if (report.verdict.kind !== 'none') {
    parts.push(`${report.verdict.headline} ${report.verdict.support}`)
  } else if (report.verdict.reason === 'too-few-posts') {
    parts.push(REPORT.verdict.tooFewPosts)
  } else {
    parts.push(REPORT.verdict.noBaseline)
  }

  const numbers = [
    [REPORT.numbers.reach.label, report.numbers.reach],
    [REPORT.numbers.replies.label, report.numbers.replies],
    [REPORT.numbers.enquiries.label, report.numbers.enquiries],
  ] as const
  parts.push(
    numbers
      .map(([label, value]) =>
        value.status === 'unreadable'
          ? `${label}: ${REPORT.numbers.unreadable}`
          : `${label}: ${readable(value.value)} (${comparisonLine(value)})`,
      )
      .join('\n'),
  )

  parts.push(
    report.changed.length === 0
      ? `${REPORT.changed.title}: ${REPORT.changed.nothing}`
      : `${REPORT.changed.title}:\n${report.changed.map((c) => `- ${c}`).join('\n')}`,
  )

  parts.push(
    report.oneThing === null
      ? `${REPORT.oneThing.title}: ${REPORT.oneThing.nothing}`
      : `${REPORT.oneThing.title}: ${report.oneThing.body}`,
  )

  let text = ''
  for (const part of parts) {
    const next = text.length === 0 ? part : `${text}\n\n${part}`
    if (next.length > PLAIN_TEXT_LIMIT) break
    text = next
  }
  return text
}
