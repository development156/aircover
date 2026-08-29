import { AUTOPILOT_REFUSALS } from '@/lib/loop/autopilot-refusals'
import { decideAutopilotBatch, type AutopilotCandidate, type AutopilotWorld } from './decide'
import { decideDue, type AnnouncedPost, type DueWorld } from './dispatch-due'
import type { DecisionRow } from './store'

/**
 * ONE AUTOPILOT TICK — announce what may go out, then send what is due.
 *
 * ── WHY THE ROW IS WRITTEN BEFORE THE PUBLISH, NEVER AFTER ───────────────────
 * `20260828130000_loop_autopilot_log.sql` says it in its own header and this is
 * the code that has to honour it: a row written after a successful publish
 * records the successes and loses exactly the events worth having — the crash
 * mid-dispatch, the attempt that timed out somewhere unknown, the adapter that
 * hung. The decision is the thing being logged and the decision happens first.
 *
 * So `dispatched` is written, and THEN the publish is attempted. If the publish
 * throws, the row stands and says an attempt was made. It does not say the post
 * reached the platform, and nothing in this file ever claims that:
 * `post_publish_logs` owns the platform outcome and has its own failures.
 *
 * ── ONE POST'S FAILURE NEVER ABORTS THE TICK ─────────────────────────────────
 * The same rule the dispatch and hold sweeps follow. A poison row would
 * otherwise strand every later post in the workspace until somebody noticed,
 * and nobody is watching — that is the premise of the whole feature.
 */

export interface AutopilotTickDeps {
  workspaceId: string
  /** Everything phase one needs, already read. */
  world: AutopilotWorld
  /** Posts the Loop produced that are eligible to be considered. */
  candidates: readonly AutopilotCandidate[]
  /** Announcements from earlier ticks with no terminal row after them. */
  pending: readonly AnnouncedPost[]
  /** The dial and the kill switch, as they stand NOW. */
  due: Omit<DueWorld, 'alreadyDispatched' | 'isCancelled'>
  write(row: DecisionRow): Promise<string>
  /** Hand one post to the publish path. Throwing is expected and is caught. */
  publish(post: AnnouncedPost): Promise<void>
}

export interface AutopilotTickReport {
  announced: number
  refused: number
  refusalsByReason: Partial<Record<string, number>>
  dispatched: number
  waiting: number
  /** A publish that threw AFTER its row was written. The row stands. */
  publishFailed: number
}

export async function runAutopilotTick(deps: AutopilotTickDeps): Promise<AutopilotTickReport> {
  const report: AutopilotTickReport = {
    announced: 0,
    refused: 0,
    refusalsByReason: {},
    dispatched: 0,
    waiting: 0,
    publishFailed: 0,
  }

  const countRefusal = (reason: string) => {
    report.refused += 1
    report.refusalsByReason[reason] = (report.refusalsByReason[reason] ?? 0) + 1
  }

  // ── PHASE ONE · announce, or refuse by name ────────────────────────────────
  for (const decision of decideAutopilotBatch(deps.candidates, deps.world)) {
    const c = decision.candidate
    const base = {
      workspaceId: deps.workspaceId,
      postId: c.postId,
      variantId: c.variantId,
      channel: c.channel,
      accountId: c.accountId,
      briefId: c.briefId,
      cycleId: c.cycleId,
    }
    if (decision.kind === 'announce') {
      await deps.write({ ...base, decision: 'announced', dispatchAfter: decision.dispatchAfter })
      report.announced += 1
    } else {
      await deps.write({ ...base, decision: 'refused', refusalReason: decision.reason })
      countRefusal(decision.reason)
    }
  }

  // ── PHASE TWO · send what is due ───────────────────────────────────────────
  //
  // `dispatchedThisTick` is not belt and braces. The pending scan already
  // excludes anything with a terminal row, so the only way the same post can
  // appear twice here is inside ONE tick — a duplicate announcement, or a scan
  // that read the same row under two variants. Marking as we go is what stops
  // the second copy publishing, and a test forces it.
  const dispatchedThisTick = new Set<string>()
  const key = (postId: string, variantId: string) => `${postId}:${variantId}`

  const dueWorld: DueWorld = {
    ...deps.due,
    alreadyDispatched: (postId, variantId) => dispatchedThisTick.has(key(postId, variantId)),
    isCancelled: () => false,
  }

  // Decided one at a time, NOT as a batch. `decideDueBatch` resolves every row
  // before the loop dispatches any, so `dispatchedThisTick` would still be
  // empty when the duplicate was judged and the same post would publish twice.
  // MEASURED: the duplicate-announcement test caught exactly that. The clock
  // stays fixed at `deps.due.now`, which was the batch's own reason to exist.
  for (const post of deps.pending) {
    const decision = decideDue(post, dueWorld)
    if (decision.kind === 'wait') {
      report.waiting += 1
      continue
    }
    const base = {
      workspaceId: deps.workspaceId,
      postId: post.postId,
      variantId: post.variantId,
      channel: post.channel,
      accountId: post.accountId,
    }
    if (decision.kind === 'refuse') {
      await deps.write({ ...base, decision: 'refused', refusalReason: decision.reason })
      countRefusal(decision.reason)
      continue
    }

    // The row first, then the attempt. See the header.
    await deps.write({ ...base, decision: 'dispatched' })
    dispatchedThisTick.add(key(post.postId, post.variantId))
    report.dispatched += 1
    try {
      await deps.publish(post)
    } catch {
      // Deliberately swallowed, and deliberately counted. The row already says
      // an attempt was made; re-raising would strand every later post in this
      // workspace, and no error message from a publish path is safe to put in
      // an append-only audit row without reading it first.
      report.publishFailed += 1
    }
  }

  return report
}

/** The refusal names this tick can produce, for a caller that wants to assert on them. */
export const TICK_REFUSALS = AUTOPILOT_REFUSALS
