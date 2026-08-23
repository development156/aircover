import type { AccountAnalytics } from '@/lib/analytics/account-insights'

/**
 * ONE REASON, STATED ONCE, FOR THE WHOLE OF /analytics.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 * docs/27 §1 found five empty treatments in five visual languages on this screen
 * and the 2026-08-20 fix collapsed them — for a workspace with NOTHING. MEASURED
 * on 2026-08-23 one step further along (four posts, two channels published,
 * nothing connected, which is where a beta account sits after its first hour),
 * the screen says "nothing" SIX times again, in six treatments, across 1237px at
 * 1440 and 1652px at 390, without rendering a single number.
 *
 * The containers are not the problem and deleting them is not the fix — a reader
 * who cannot see that this product measures reach at all is worse off than one
 * looking at an empty reach slot (docs/37 §15). The problem is that each
 * container independently DIAGNOSES the page's single shared cause and prints its
 * own prose about it. `Performance` says "connect a channel", `Instagram account`
 * says "connect Instagram", `Best performing` says nothing has been measured —
 * three sentences, one fact, and none of them knows about the other two.
 *
 * So the cause is computed HERE, once, from the page's own data, and rendered
 * once at the top. Every section below keeps its container and falls back to its
 * SLOT-LEVEL absence mark (docs/37 §9) instead of re-diagnosing.
 *
 * ── WHY A MODULE AND NOT A BRANCH IN THE PAGE ────────────────────────────────
 * The same reason `lib/inbox/emptiness.ts` is a module: these are CLAIMS, and a
 * claim belongs somewhere a test can assert it without rendering a route. The
 * tests here assert the claim and the forbidden claim, never the wording — so the
 * sentences can be rewritten freely and the guarantees survive.
 */

export interface Remedy {
  label: string
  href: '/connections' | '/posts/new'
}

export type AnalyticsReadiness =
  /** Something on this page has a real number. The page says nothing extra. */
  | { kind: 'measuring' }
  /**
   * Every source that could report is in place and no reading has arrived.
   *
   * Deliberately carries NO remedy. Waiting is the correct behaviour and offering
   * a button here would invite someone to fix a thing that is not broken.
   */
  | { kind: 'waiting'; headline: string; detail: string }
  /**
   * Nothing on this page can have a value from any source yet.
   *
   * `remedy` is `null` when no action the reader can take would help — a missing
   * publishing key is the deployment's problem, not theirs, and a button there
   * would be an impossible remedy (`e2e/no-impossible-remedy.spec.ts`).
   */
  | {
      kind: 'blocked'
      headline: string
      detail: string
      remedy: Remedy | null
      /** The hairline second door, when there genuinely are two. */
      second: Remedy | null
    }

const CONNECT: Remedy = { label: 'Connect a channel', href: '/connections' }
const RECONNECT: Remedy = { label: 'Reconnect the account', href: '/connections' }
const WRITE: Remedy = { label: 'Write a post', href: '/posts/new' }

export interface ReadinessInput {
  account: AccountAnalytics
  /** At least one channel of at least one post has published. */
  hasPublished: boolean
  /** Rows carrying a real number right now. The only thing that proves measurement. */
  measuredRows: number
}

export function analyticsReadiness({
  account,
  hasPublished,
  measuredRows,
}: ReadinessInput): AnalyticsReadiness {
  // A number on the page outranks every diagnosis. Once anything has reported,
  // the page's job is to show it and stop explaining itself.
  const accountReported = account.kind === 'ready' && account.insights.length > 0
  if (measuredRows > 0 || accountReported) return { kind: 'measuring' }

  // ── WHAT DO WE KNOW ABOUT THE QUESTION, BEFORE WHAT CAME BACK ──────────────
  // Same ordering `classifyInboxResult` uses, and for the same reason: "we never
  // asked" and "we asked and got nothing" are different sentences, and only one
  // of them is the reader's to act on.

  if (account.kind === 'not-configured') {
    return {
      kind: 'blocked',
      headline: 'Sahoda can’t read metrics in this environment',
      // No remedy, and that is the point. Connecting more accounts cannot add a
      // key to a deployment, so a button here would be a promise nothing can keep.
      detail:
        'No request went out, so this is not a reading of your accounts. Nothing is wrong with them.',
      remedy: null,
      second: null,
    }
  }

  if (account.kind === 'unreadable') {
    return {
      kind: 'blocked',
      headline: 'Sahoda couldn’t read your numbers just now',
      // A refresh genuinely can fix this one, which is exactly why it is said
      // here and nowhere else on the page.
      detail: 'The request went out and came back without an answer. Refresh to try again.',
      remedy: null,
      second: null,
    }
  }

  if (account.kind === 'reconnect') {
    return {
      kind: 'blocked',
      headline: 'Reconnect your account to start measuring',
      detail:
        'The connection expired, so Sahoda can’t read reach or followers until it’s renewed. Your posts are unaffected.',
      remedy: RECONNECT,
      second: null,
    }
  }

  if (account.kind === 'not-connected') {
    return {
      kind: 'blocked',
      headline: 'Nothing can be measured yet',
      // Both doors named, and connecting leads: a post that goes out on no
      // channel is still never measured, so sending someone to the composer
      // alone routes them the long way round to this same page.
      detail: hasPublished
        ? 'Your posts went out, but reach and followers come from a connected account, so there is nothing to read them from.'
        : 'Reach and followers come from the channel itself, so one connection starts them even before you post.',
      remedy: CONNECT,
      second: hasPublished ? null : WRITE,
    }
  }

  // Connected, and nothing has come back. Two genuinely different situations.
  if (!hasPublished) {
    return {
      kind: 'blocked',
      headline: 'Nothing published yet',
      detail:
        'Per-post numbers start once a post goes out on a channel. Your account’s own figures arrive here as Instagram reports them.',
      remedy: WRITE,
      second: null,
    }
  }

  return {
    kind: 'waiting',
    headline: 'Measuring: nothing has reported yet',
    detail:
      'Your posts are out and the channels have not returned figures for them yet. This fills in on the platform’s own schedule; there is nothing to do.',
  }
}
