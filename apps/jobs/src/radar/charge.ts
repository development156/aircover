import type { WithCreditsFn } from '@sahoda/shared'

/**
 * THE CREDIT CHARGE FOR ONE RADAR SCAN.
 *
 * ── WHAT /radar PROMISES, AND WHAT THIS FILE MAKES TRUE ──────────────────────
 * "One scan per business per week, at 5 credits each. A page that will not
 * load is skipped and not charged." Until this file existed the weekly pass
 * tracked Sahoda's own provider cash in `radar_fetch_log` and never wrote a
 * `radar_scan` ledger row, so the price on the screen was a number nobody was
 * ever debited. This is the charge.
 *
 * ── THE SHAPE, AND WHY IT IS THIS SHAPE ──────────────────────────────────────
 * A source is fetched ONCE however many workspaces watch it (that is the whole
 * point of the shared registry), but the price is per business per workspace.
 * So the fetch is memoised and every subscriber goes through `withCredits` in
 * turn: HOLD, then the shared read, then DEBIT on a page that was seen or
 * RELEASE on one that was not. The first payer triggers the fetch; the rest
 * settle against its result.
 *
 * A workspace that cannot pay is skipped, and the others still get their read:
 * refusing the fetch because a NEIGHBOUR's wallet is empty would charge one
 * customer for another's balance. When nobody can pay, the page is never
 * fetched at all, and the caller records the source as refused.
 *
 * ── IDEMPOTENT PER (WORKSPACE, COMPETITOR, WEEK) ─────────────────────────────
 * The objectRef is the competitor id, the ISO week and the workspace (see
 * `scanObjectRef` for why the last one is not redundant). `withCredits` derives
 * its attempt from the ledger's latest hold for that ref, and a hold already
 * settled by a DEBIT reuses its attempt, so a re-run of the same week replays
 * the same HOLD and DEBIT keys and moves no money. The next week is a new ref
 * and a new charge, which is exactly what "per week" means.
 */

export type ScanSeen = 'seen' | 'not_seen'

export interface ChargeSubscribersInput {
  withCredits: WithCreditsFn
  /** Every workspace subscribed to the competitor this source belongs to. */
  workspaces: readonly string[]
  competitorId: string
  /** From `scanWeekKey`. */
  week: string
  /** The read itself. Runs at most once, whatever the number of subscribers. */
  scan: () => Promise<ScanSeen>
}

export interface ChargeOutcome {
  /**
   * What became of the read. `not_run` means no workspace could be held for,
   * so the page was never fetched; `threw` means the read itself failed with
   * an error rather than a recorded gap.
   */
  scan: ScanSeen | 'threw' | 'not_run'
  /** Workspaces whose DEBIT landed. */
  debited: string[]
  /** Workspaces refused for an insufficient balance. Never charged, never held. */
  unpaid: string[]
  /** Workspaces the ledger could not answer for at all. */
  ledgerFailed: string[]
}

/** Thrown inside the wrapper so a read that saw nothing RELEASES the hold. */
class ScanNotSeen extends Error {
  constructor() {
    super('radar: the page was not read, so the hold is released')
    this.name = 'ScanNotSeen'
  }
}

export async function chargeSubscribers(input: ChargeSubscribersInput): Promise<ChargeOutcome> {
  const outcome: ChargeOutcome = { scan: 'not_run', debited: [], unpaid: [], ledgerFailed: [] }

  // One read, shared. A rejection is memoised too, so every later subscriber's
  // hold is released against the same failure rather than fetching again.
  let started: Promise<ScanSeen> | null = null
  const scanOnce = (): Promise<ScanSeen> => {
    if (started === null) {
      started = input.scan().then(
        (seen) => {
          outcome.scan = seen
          return seen
        },
        (error: unknown) => {
          outcome.scan = 'threw'
          throw error
        },
      )
    }
    return started
  }

  if (input.workspaces.length === 0) {
    // Nothing to charge. The read still runs so the spending gate can record
    // its own NO_SUBSCRIBERS refusal, which is a different fact from "skipped".
    await scanOnce().catch(() => undefined)
    return outcome
  }

  for (const workspaceId of input.workspaces) {
    let reachedTheRead = false
    const charged = await input.withCredits(
      { workspaceId, action: 'radar_scan', objectRef: scanObjectRef(input, workspaceId) },
      async () => {
        reachedTheRead = true
        const seen = await scanOnce()
        if (seen !== 'seen') throw new ScanNotSeen()
        return seen
      },
    )

    if (charged.ok) {
      outcome.debited.push(workspaceId)
    } else if (charged.error.code === 'CREDIT_INSUFFICIENT') {
      outcome.unpaid.push(workspaceId)
    } else if (!reachedTheRead) {
      outcome.ledgerFailed.push(workspaceId)
    }
    // Otherwise the read itself was not seen or threw: the hold is already
    // released and `outcome.scan` already says which.
  }

  return outcome
}

/**
 * (competitor, week, workspace) — and the workspace is NOT redundant.
 *
 * `credit_ledger.idempotency_key` is UNIQUE across the whole table, and
 * `holdKey` is `${action}:${objectRef}:${attempt}` with no workspace in it. A
 * ref of competitor and week alone gave every subscriber of one competitor the
 * SAME key: the second workspace's HOLD replayed the first workspace's row,
 * its DEBIT replayed likewise, and it was never charged while the wrapper
 * reported success. `charge.test.ts` fails without this segment.
 */
function scanObjectRef(input: ChargeSubscribersInput, workspaceId: string): string {
  return `${input.competitorId}:${input.week}:${workspaceId}`
}

const DAY_MS = 86_400_000

/**
 * The ISO-8601 week a scan belongs to, as `YYYY-Www`.
 *
 * ISO weeks start on Monday, which is the day the pass runs, so a Monday pass
 * and its retry later the same week share one key. The year is the ISO year:
 * 1 January 2027 is `2026-W53`, and it is a defect for two dates in one ISO
 * week to produce two keys.
 */
export function scanWeekKey(date: Date): string {
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const weekday = utc.getUTCDay() || 7
  // Move to the Thursday of this week: the ISO year is the year that Thursday is in.
  utc.setUTCDate(utc.getUTCDate() + 4 - weekday)
  const yearStart = Date.UTC(utc.getUTCFullYear(), 0, 1)
  const week = Math.ceil(((utc.getTime() - yearStart) / DAY_MS + 1) / 7)
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`
}
