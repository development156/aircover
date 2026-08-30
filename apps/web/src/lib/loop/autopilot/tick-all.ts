import 'server-only'

import { publishPostDeps } from '@sahoda/jobs/publish'
import type { GateCheckInput, GateVerdict } from '@sahoda/shared'

import { AUTOPILOT_WORKSPACES_SQL } from './sql'
import { runWorkspaceAutopilotTick } from './tick'
import { readWorkspaceIds } from './store'
import type { AutopilotTickReport } from './run'

/**
 * EVERY ARMED WORKSPACE, ONE TICK EACH.
 *
 * ── ONE WORKSPACE'S FAILURE NEVER STRANDS THE REST ───────────────────────────
 * The rule the dispatch and hold sweeps already follow. A poison workspace
 * would otherwise stop every later one being visited, and nobody is watching —
 * that is the premise of the whole feature. Each failure is caught, counted and
 * NAMED by workspace, because "one tick failed" is the ops_audit_log shape and
 * "workspace 6473b616 failed" is something somebody can act on.
 *
 * ── THE REAL GATE IS CALLED HERE, AND A GATE WE CANNOT BUILD STILL REFUSES ───
 * `runWorkspaceAutopilotTick` takes `gateFor` as a dependency because the
 * refusal gate's third layer is a model call. This wiring hands it the SAME
 * gate the publish path uses, `publishPostDeps().gate`, which apps/web already
 * builds for the sweeps route and the publish-now route.
 *
 * It is built ONCE per fleet tick, not once per workspace: `publishPostDeps`
 * opens a Zernio client and a pool, and one per workspace would be a connection
 * per armed customer for a check that reads one row and writes one.
 *
 * `publishPostDeps()` THROWS on missing configuration, by design, and that
 * throw is the interesting case. It resolves to `FAIL_CLOSED` — every candidate
 * treated as flagged, nothing announced — rather than to an exception that
 * takes the tick down or, worse, to a `pass`. A gate we could not build is not
 * a gate that approves.
 *
 * ── THE GATE RUNS TWICE, AND BOTH TIMES ARE TRUE ─────────────────────────────
 * Autopilot does not publish; it schedules, and the existing sweep publishes
 * through `runPublishPost`, which gates again. So a post autopilot announces is
 * checked at announce time and again at send time, and `gate_audit` records
 * both. That is not duplication to remove: the two checks answer different
 * questions at different moments, the body can change between them, and the
 * publish-time one remains the real boundary. This one exists so the autopilot
 * log can say REFUSAL_GATE and mean it, instead of announcing something the
 * publish path was always going to refuse.
 *
 * `jobRunId` is `autopilot:<postId>`, alongside the existing `web:<uuid>` and
 * `cron:<postId>`. It names the RUN, not an approver — the port's own warning,
 * and nothing here records who approved anything.
 */

/**
 * The verdict used when no gate could be built.
 *
 * A `hold` refuses exactly as a `block` does (`gateFlagged`), so this stops
 * every candidate. It reports `classifier: 'unavailable'` rather than
 * 'skipped-no-rules' because nothing was skipped: the check could not be made
 * at all, and the two are different facts about the same absent verdict.
 */
const FAIL_CLOSED: GateVerdict = {
  decision: 'hold',
  findings: [],
  ruleSet: { rules: [], version: 0 } as never,
  brandVersion: null,
  checks: { hard: 'ran', classifier: 'unavailable' },
  holdReason: 'Sahoda could not check this post against your lines.',
}

export interface AllTicksReport {
  workspaces: number
  announced: number
  refused: number
  dispatched: number
  cancelled: number
  waiting: number
  publishFailed: number
  /** Workspaces whose tick threw, by id. Empty is the normal case. */
  failed: string[]
  /**
   * True when no gate could be built, so every candidate was refused.
   *
   * Reported rather than inferred from `refused`, because "the gate said no"
   * and "there was no gate to ask" are different facts and only one of them is
   * about the customer's posts.
   */
  gateUnavailable?: boolean
}

export async function runAllAutopilotTicks(now: Date, limit = 200): Promise<AllTicksReport> {
  const report: AllTicksReport = {
    workspaces: 0,
    announced: 0,
    refused: 0,
    dispatched: 0,
    cancelled: 0,
    waiting: 0,
    publishFailed: 0,
    failed: [],
  }

  const ids = await readWorkspaceIds(AUTOPILOT_WORKSPACES_SQL, limit)
  report.workspaces = ids.length

  // Built once for the whole tick, and its failure is a refusal rather than an
  // exception. `publishPostDeps` throws on missing configuration by design.
  let gate: { check(input: GateCheckInput): Promise<GateVerdict> } | null = null
  try {
    gate = publishPostDeps().gate
  } catch {
    report.gateUnavailable = true
  }

  for (const workspaceId of ids) {
    try {
      const one: AutopilotTickReport = await runWorkspaceAutopilotTick({
        workspaceId,
        now,
        gateFor: async (row) => {
          if (gate === null) return FAIL_CLOSED
          try {
            return await gate.check({
              workspaceId,
              postId: row.postId,
              variantId: row.variantId,
              channel: row.channel,
              text: row.body,
              jobRunId: `autopilot:${row.postId}`,
            })
          } catch {
            // The port says a gate MUST NOT THROW. This is the belt for the day
            // one does, and it refuses rather than letting the exception reach
            // the workspace catch, where a whole tick would be lost over one
            // post and the reason would read as "the workspace failed".
            return FAIL_CLOSED
          }
        },
      })
      report.announced += one.announced
      report.refused += one.refused
      report.dispatched += one.dispatched
      report.cancelled += one.cancelled
      report.waiting += one.waiting
      report.publishFailed += one.publishFailed
    } catch {
      // Named, not swallowed. The id is the only thing that makes this
      // actionable, and no error text is copied: a database message can carry a
      // connection string.
      report.failed.push(workspaceId)
    }
  }

  return report
}
