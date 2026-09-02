import 'server-only'

import type { Channel, GateVerdict } from '@sahoda/shared'

import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import type { AutopilotCandidate } from './decide'
import type { AnnouncedPost } from './dispatch-due'
import { runAutopilotTick, type AutopilotTickReport } from './run'
import {
  armForPublish,
  cancelAnnouncement,
  readActiveBrain,
  readCandidateRows,
  readDial,
  readPendingAnnouncements,
  readPublishedToday,
  readSettings,
  writeDecision,
} from './store'
import { toAutopilotCandidate } from './verdicts'

/**
 * ONE WORKSPACE'S TICK — the composition, and the only file here that does I/O
 * and decides in the same breath.
 *
 * ── WHY THE GATE IS AN INJECTED FUNCTION ─────────────────────────────────────
 * The refusal gate's third layer is a model call. Passing it in keeps this
 * module's shape honest: the composition is testable against a stub, the caller
 * decides what a gate check costs and how it is batched, and no part of the
 * decision path reaches for a model on its own.
 *
 * ── WHAT MAKES A WORKSPACE INELIGIBLE, AND WHY IT IS SILENT ──────────────────
 * A workspace with no `loop_settings` row never opened the Loop. There is
 * nothing to refuse and nobody to tell, so this returns a zeroed report rather
 * than writing a refusal row per candidate — and it cannot have candidates
 * anyway, because the scan joins the dial. Writing rows for a workspace that
 * never asked for autopilot would fill the log with the fact that nothing
 * happened, which is the `ops_audit_log` defect in a new column.
 *
 * ── TWO KILL SWITCHES, READ EVERY TICK, AND BOTH STOP THE ANNOUNCING TOO ─────
 * `killed` is the OR of the deploy-wide flag (`SAHODA_LOOP_CRON_MODE`) and the
 * customer's own Stop (`loop_settings.paused`). MEASURED 2026-09-02, two
 * defects in one line. The env flag was consulted only at dispatch time, so
 * with autopilot on and the Loop flag off every eligible post was ANNOUNCED
 * ("going out at 10:15") and cancelled by Sahoda one window later, for every
 * post, for ever. And `paused` was never read at all, so a person who pressed
 * Stop inside a window saw the post reverted to draft and the next tick
 * re-armed it. Now a killed tick announces NOTHING (phase one gets no
 * candidates) and still runs phase two so an announcement made before the
 * switch flipped gets its cancellation row instead of going out when the
 * switch flips back. A cancellation caused by `paused` is written as the
 * person's, because it was.
 */

export interface WorkspaceTickDeps {
  workspaceId: string
  now?: Date
  /** The refusal gate's verdict for one candidate body. */
  gateFor(row: {
    postId: string
    variantId: string
    channel: Channel
    body: string
  }): Promise<GateVerdict>
}

/** A tick that decided nothing, for a workspace that has not opened the Loop. */
const EMPTY: AutopilotTickReport = {
  announced: 0,
  refused: 0,
  refusalsByReason: {},
  dispatched: 0,
  cancelled: 0,
  waiting: 0,
  publishFailed: 0,
}

export async function runWorkspaceAutopilotTick(
  deps: WorkspaceTickDeps,
): Promise<AutopilotTickReport> {
  const { workspaceId } = deps
  const now = deps.now ?? new Date()

  const [settings, dial, brainPayload, publishedToday, rows, pending] = await Promise.all([
    readSettings(workspaceId),
    readDial(workspaceId),
    readActiveBrain(workspaceId),
    readPublishedToday(workspaceId),
    readCandidateRows(workspaceId),
    readPendingAnnouncements(workspaceId),
  ])

  // No settings row means the Loop was never opened here. Nothing to decide.
  if (settings.dailyCap === null || settings.cancelMinutes === null) return EMPTY
  if (rows.length === 0 && pending.length === 0) return EMPTY

  // Both switches, fresh, before anything is announced. A candidate is not
  // even gated while killed: nothing may be announced that cannot be sent, and
  // the gate's third layer is a model call nobody should pay for on a stopped
  // Loop.
  const paused = settings.paused
  const killed = paused || !loopCronEnabled()

  const candidates: AutopilotCandidate[] = []
  if (!killed) {
    for (const row of rows) {
      candidates.push(toAutopilotCandidate(row, await deps.gateFor(row)))
    }
  }

  const announced: AnnouncedPost[] = pending

  return runAutopilotTick({
    workspaceId,
    world: {
      now,
      levelFor: (channel) => dial.get(channel),
      // Re-read every tick, NOT inferred from the dial. The trigger refuses an
      // L3 write unless the four fields are confirmed, so a channel at 3 had a
      // brain that cleared the floor — but that is a fact about the past. A
      // person can unconfirm a field afterwards and the dial does not move, and
      // withdrawing that agreement is exactly how somebody says "stop writing
      // that about us". An absent brain is null, and null refuses by name.
      brainPayload,
      dailyCap: settings.dailyCap,
      publishedToday,
      cancelMinutes: settings.cancelMinutes,
      weeklyBudgetRemaining: settings.weeklyBudgetCredits ?? 0,
    },
    candidates,
    pending: announced,
    due: {
      now,
      levelFor: (channel) => dial.get(channel),
      // Both kill switches, read fresh at dispatch time rather than trusted
      // from the announcement. See the header.
      killed,
    },
    write: writeDecision,
    publish: async (post) => {
      // Not a publish. Autopilot hands the post to the sweep that already
      // publishes, and a refused arming is not an error — see armForPublish.
      await armForPublish(workspaceId, post.postId)
    },
    // The customer's Stop is the customer's cancellation. `cancelAnnouncement`
    // is the same statement the per-post Stop button uses: it copies the
    // identifiers from the announcement and writes actor 'person', inside one
    // statement with the terminal-row check, so a dispatch that lands first
    // wins and no cancellation is recorded over a post that went out.
    ...(paused
      ? {
          cancelAsPerson: async (post: AnnouncedPost) => {
            await cancelAnnouncement(workspaceId, post.postId, post.variantId)
          },
        }
      : {}),
  })
}
