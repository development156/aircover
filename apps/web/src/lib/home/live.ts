import type { LedgerEntry, PostStatus } from '@sahoda/shared'

import { CRON_SCHEDULES } from '@/lib/cron/heartbeat'
import { actionLabel } from '@/lib/wallet/entry-copy'

/**
 * WHAT SAHODA IS DOING RIGHT NOW, IN PLAIN WORDS.
 *
 * ── THE RULE ─────────────────────────────────────────────────────────────────
 * Every line here is a row that exists: a post that changed, a ledger entry
 * that landed, a cron run that was recorded. Nothing is narrated from a plan or
 * a timer. If nothing happened, the console says so and says when Sahoda next
 * looks, which is a fact about the schedule and not a promise about output.
 *
 * ── THE WORDS ────────────────────────────────────────────────────────────────
 * Written for a shop owner reading between customers. No status names, no
 * table names, no "variant", no "ledger". A post is "ready to go out", not
 * "approved"; credits are "used", not "debited". The founder's brief on
 * 2026-09-06 was one sentence: everyone should understand every line.
 */

export type LiveKind = 'you' | 'sahoda' | 'credits' | 'check'

export interface LiveLine {
  /** ISO time the thing happened. */
  at: string
  /** One plain sentence. */
  text: string
  kind: LiveKind
}

export interface LivePost {
  id: string
  title: string | null
  intent: PostStatus
  updated_at: string
  scheduled_at: string | null
  origin: string
}

export interface LiveInput {
  posts: readonly LivePost[]
  ledger: readonly LedgerEntry[]
  /** When the publishing sweep last ran, or null when nothing was recorded. */
  sweepRanAt: number | null
  now: Date
}

const MINUTE = 60_000

/** "just now", "4 minutes ago", "3 hours ago", "yesterday", "5 days ago". */
export function agoWords(iso: string, now: Date): string {
  const ms = now.getTime() - new Date(iso).getTime()
  if (!Number.isFinite(ms) || ms < MINUTE) return 'just now'
  const minutes = Math.floor(ms / MINUTE)
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days} days ago`
}

const quote = (title: string | null): string => {
  const t = title?.trim()
  return t ? `“${t}”` : 'a post with no name yet'
}

function postLine(post: LivePost): LiveLine | null {
  const madeBySahoda = post.origin !== 'manual'
  const who = madeBySahoda ? 'Sahoda' : 'You'
  const t = quote(post.title)
  switch (post.intent) {
    case 'idea':
    case 'draft':
      return {
        at: post.updated_at,
        kind: madeBySahoda ? 'sahoda' : 'you',
        text: madeBySahoda ? `Sahoda wrote a draft: ${t}` : `You saved a draft: ${t}`,
      }
    case 'review':
      return { at: post.updated_at, kind: 'sahoda', text: `${t} is waiting for your OK` }
    case 'approved':
    case 'scheduled':
      return { at: post.updated_at, kind: 'you', text: `${who} set ${t} to go out` }
    case 'publishing':
      return { at: post.updated_at, kind: 'sahoda', text: `Sahoda is posting ${t} now` }
    case 'published':
      return { at: post.updated_at, kind: 'sahoda', text: `${t} went out` }
    case 'partial':
      return {
        at: post.updated_at,
        kind: 'sahoda',
        text: `${t} went out to some accounts, not all`,
      }
    case 'failed':
      return {
        at: post.updated_at,
        kind: 'sahoda',
        text: `${t} could not go out. Open it to see why`,
      }
    case 'expired':
      return null
  }
}

/** The plain-words version of a credit action. "Caption rewrite" → "a caption rewrite". */
function actionWords(actionType: string): string {
  const label = actionLabel(actionType)
  const lower = label.charAt(0).toLowerCase() + label.slice(1)
  return /^[aeiou]/.test(lower) ? `an ${lower}` : `a ${lower}`
}

function ledgerLine(entry: LedgerEntry): LiveLine | null {
  const n = entry.amount
  const credits = `${n} credit${n === 1 ? '' : 's'}`
  switch (entry.entry_type) {
    case 'DEBIT':
      return {
        at: entry.created_at,
        kind: 'credits',
        text: `Sahoda used ${credits} on ${entry.action_type ? actionWords(entry.action_type) : 'something it did for you'}`,
      }
    case 'GRANT':
      return { at: entry.created_at, kind: 'credits', text: `${credits} arrived in your wallet` }
    case 'TOPUP':
      return { at: entry.created_at, kind: 'credits', text: `You added ${credits}` }
    case 'RELEASE':
      return { at: entry.created_at, kind: 'credits', text: `${credits} came back to you` }
    case 'PERF_REWARD':
      return {
        at: entry.created_at,
        kind: 'credits',
        text: `You earned ${credits} for a post that did well`,
      }
    case 'EXPIRE':
      return { at: entry.created_at, kind: 'credits', text: `${credits} expired` }
    case 'HOLD':
    case 'ADJUST':
      return null
  }
}

export const LIVE_LINES = 6

/**
 * The console's lines, newest first, plus the one sentence about the sweep.
 * The sweep line is pinned last so the reader always sees when Sahoda last
 * looked, however busy the day was.
 */
export function liveLines(input: LiveInput): LiveLine[] {
  const events: LiveLine[] = []
  for (const post of input.posts) {
    const line = postLine(post)
    if (line) events.push(line)
  }
  for (const entry of input.ledger) {
    const line = ledgerLine(entry)
    if (line) events.push(line)
  }
  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())

  const minutes = Math.round(CRON_SCHEDULES.sweeps.periodMs / MINUTE)
  const check: LiveLine =
    input.sweepRanAt === null
      ? {
          at: input.now.toISOString(),
          kind: 'check',
          text: `Sahoda looks for posts to send every ${minutes} minutes`,
        }
      : {
          at: new Date(input.sweepRanAt).toISOString(),
          kind: 'check',
          text: `Sahoda last checked for posts to send ${agoWords(new Date(input.sweepRanAt).toISOString(), input.now)}`,
        }

  return [...events.slice(0, LIVE_LINES - 1), check]
}
