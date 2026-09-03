import { REPORT } from './strings'
import type { Verdict } from './verdict'

/**
 * WHY THERE IS NO VERDICT, IN THE WORDS THAT FIT THE REASON THERE IS NOT ONE.
 *
 * Three reasons, three sentences, never merged. "I could not read last week" is
 * about us; "still learning your normal" is about a young workspace; "nothing
 * has come back with numbers" is about a week in flight. Collapsing them would
 * tell a two-year-old customer they are new because a request timed out.
 */
export function withheldSentence(verdict: Extract<Verdict, { kind: 'none' }>): string {
  if (verdict.reason === 'unreadable') return REPORT.verdict.unreadable
  if (verdict.reason === 'too-few-posts') return REPORT.verdict.tooFewPosts(verdict.measured ?? 0)
  return REPORT.verdict.noBaseline
}
