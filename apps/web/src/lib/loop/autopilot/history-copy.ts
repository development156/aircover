import { AUTOPILOT_REFUSAL_COPY, type AutopilotRefusal } from '@/lib/loop/autopilot-refusals'

/**
 * WHAT AUTOPILOT DID, IN A SENTENCE THAT CLAIMS ONLY WHAT WE OBSERVED.
 *
 * ── THE ONE THAT MATTERS: `dispatched` IS NOT `published` ────────────────────
 * The migration's own header says it: "'dispatched' does NOT mean published.
 * The publish path has its own log (`post_publish_logs`) and its own failures,
 * and claiming a platform outcome this table never observed is the kind of
 * confident wrong answer this codebase keeps finding."
 *
 * A screen is the likeliest place for that to go wrong, because "Published" is
 * the obvious word and it is a claim about somebody else's server. Autopilot
 * handed the post to the publishing queue; whether X accepted it is a fact this
 * table has never seen. So the sentence says what happened here and stops.
 *
 * ── AND THE ONE UNDERNEATH IT: A WINDOW THAT CLOSED IS NOT A POST THAT WENT ──
 * An announcement whose `dispatch_after` is in the past and which has no
 * `dispatched` row has NOT gone out — the sweep has not reached it. Rendering
 * that as "sent" would be a lie the customer can act on: they would stop
 * looking for the stop button that still works.
 *
 * ── WHY A ROW SET AND NOT A ROW ──────────────────────────────────────────────
 * The table is append-only, so the truth about one post is its whole history:
 * an announcement plus a cancellation is a stopped post, and the announcement
 * alone is a pending one. Reading only the latest row would be right most of
 * the time, which is the worst kind of wrong for an audit trail.
 */

export type AutopilotDecisionKind = 'announced' | 'dispatched' | 'refused' | 'cancelled'

/** One `loop_autopilot_log` row, as much of it as a sentence needs. */
export interface AutopilotHistoryRow {
  decision: AutopilotDecisionKind
  refusalReason: string | null
  dispatchAfter: Date | null
  createdAt: Date
  /** `'autopilot'` or `'person'`. Who wrote the row. */
  actor: string
}

export interface AutopilotStatus {
  /**
   * What a person is told. Never claims a platform outcome and never claims a
   * post went out that this table did not see go out.
   */
  sentence: string
  /** TRUE while the stop button would still do something. */
  stoppable: boolean
  /**
   * A machine-readable state, so a screen branches on this rather than on the
   * sentence. A screen matching on prose is a screen that breaks when the prose
   * improves.
   */
  state: 'waiting' | 'due' | 'handed-over' | 'stopped' | 'refused' | 'nothing'
}

/** Newest last. Empty means autopilot has never decided anything about this post. */
export function autopilotStatus(rows: readonly AutopilotHistoryRow[], now: Date): AutopilotStatus {
  if (rows.length === 0) {
    return {
      sentence: 'Autopilot has not looked at this post.',
      stoppable: false,
      state: 'nothing',
    }
  }

  const ordered = [...rows].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const latest = ordered[ordered.length - 1]!

  if (latest.decision === 'dispatched') {
    return {
      // Not "Published", and not even "sent to be published": this table
      // watched the post leave the room, it did not watch it arrive, and the
      // word invites a reader to assume the second. The guard in
      // history-copy.test.ts bans the word outright for this state rather than
      // trusting a careful phrasing to stay careful through the next edit.
      sentence: 'Sahoda has handed this over to go out. Check the post to see whether it did.',
      stoppable: false,
      state: 'handed-over',
    }
  }

  if (latest.decision === 'cancelled') {
    return {
      sentence:
        latest.actor === 'person'
          ? 'You stopped this. Nothing went out.'
          : 'Sahoda stopped this. Nothing went out.',
      stoppable: false,
      state: 'stopped',
    }
  }

  if (latest.decision === 'refused') {
    const reason = latest.refusalReason as AutopilotRefusal | null
    return {
      // The named reason's own sentence when we recognise it. An unknown name
      // gets a sentence that does not guess: a refusal we cannot explain is
      // still a refusal, and inventing a cause is worse than admitting one.
      sentence:
        (reason && AUTOPILOT_REFUSAL_COPY[reason]) ??
        'Sahoda did not send this, and the reason is not one this screen knows.',
      stoppable: false,
      state: 'refused',
    }
  }

  // Announced, with nothing terminal after it.
  const closesAt = latest.dispatchAfter
  if (closesAt && closesAt.getTime() > now.getTime()) {
    return {
      sentence: 'Going out shortly. You can stop it until then.',
      stoppable: true,
      state: 'waiting',
    }
  }

  return {
    // The window has closed and the sweep has not reached it. It has NOT gone
    // out, and the stop still works — saying otherwise would send somebody away
    // from a button that would have worked.
    sentence: 'Due to go out. Sahoda has not sent it yet, so you can still stop it.',
    stoppable: true,
    state: 'due',
  }
}
