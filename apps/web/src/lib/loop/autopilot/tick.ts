import 'server-only'

import type { Channel, GateVerdict } from '@sahoda/shared'

import { loopCronEnabled } from '@/lib/cron/loop-enabled'
import type { AutopilotCandidate } from './decide'
import type { AnnouncedPost } from './dispatch-due'
import { runAutopilotTick, type AutopilotTickReport } from './run'
import {
  armForPublish,
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

  const candidates: AutopilotCandidate[] = []
  for (const row of rows) {
    candidates.push(toAutopilotCandidate(row, await deps.gateFor(row)))
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
      // The Loop's own kill switch, read fresh at dispatch time rather than
      // trusted from the announcement.
      killed: !loopCronEnabled(),
    },
    write: writeDecision,
    publish: async (post) => {
      // Not a publish. Autopilot hands the post to the sweep that already
      // publishes, and a refused arming is not an error — see armForPublish.
      await armForPublish(workspaceId, post.postId)
    },
  })
}
