import 'server-only'

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
 * ── THE GATE IS NOT CALLED HERE, AND THAT IS A GAP THIS FILE OWNS ────────────
 * `runWorkspaceAutopilotTick` takes `gateFor` as a dependency because the
 * refusal gate's third layer is a model call. This wiring passes a function
 * that REFUSES rather than one that approves: until a real gate is wired in,
 * every candidate is treated as flagged, so a tick that somehow ran against an
 * armed workspace would announce nothing.
 *
 * That is a deliberate fail-closed placeholder, not an oversight, and it is the
 * one piece between here and a working autopilot. Wiring a real gate is a
 * change somebody makes on purpose; leaving `pass` here would have made this
 * commit the one that quietly enabled unattended publishing.
 */

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

  for (const workspaceId of ids) {
    try {
      const one: AutopilotTickReport = await runWorkspaceAutopilotTick({
        workspaceId,
        now,
        // FAIL CLOSED. See the header: no real gate is wired yet, and a `pass`
        // here would be the line that turned this branch into a product that
        // posts unattended.
        gateFor: async () => ({
          decision: 'hold',
          findings: [],
          ruleSet: { rules: [], version: 0 } as never,
          brandVersion: null,
          checks: { hard: 'ran', classifier: 'skipped-no-rules' },
          holdReason: 'Sahoda has not checked this post against your lines yet.',
        }),
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
