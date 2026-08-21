import 'server-only'

import { isRunnable, playbookRecipe, type AutonomyLevel, type Channel } from '@sahoda/shared'

import { previewRunCost } from '@/lib/playbooks/cost'
import { proposeFestivals } from '@/lib/playbooks/propose'
import * as store from '@/lib/playbooks/store'
import { reportServerError } from '@/lib/observability/report'

/**
 * ONE DAILY TICK — open a run for every scheduled playbook that is due, propose
 * what it would make, and STOP AT THE COST PREVIEW.
 *
 * ── IT SPENDS NOTHING, WHICH IS A STRONGER STATEMENT THAN THE LOOP'S ────────
 * The Loop's cron spends twenty credits per workspace to think about the week,
 * because thinking about a week is a model call. A Playbook's proposal step reads
 * a calendar, so this tick's whole job is deterministic and free — it opens a
 * run, prices what it found and halts. Every credit this feature ever charges is
 * downstream of a person pressing Approve.
 *
 * ── ELIGIBILITY IS OPT-IN, NOT OPT-OUT ───────────────────────────────────────
 * A playbook is due only if a row exists, is `enabled`, has `trigger_kind =
 * 'schedule'`, and has not run inside its cadence. A workspace that has never
 * opened this screen has NO SUCH ROW and is skipped, so deploying this does not
 * start opening runs for every workspace in the database.
 *
 * ── WHY THE WORK IS BOUNDED PER TICK ─────────────────────────────────────────
 * Vercel gives a serverless function a wall clock. Whatever does not fit is left
 * for the next tick — which for a daily job is a day away, so the cap is set high
 * enough to be a backstop and not a schedule. If it ever binds, the count is
 * RETURNED rather than swallowed: a silent truncation reads as "everyone was
 * covered" when they were not.
 */

/** Enough for every workspace this product has, several times over. */
const MAX_PLAYBOOKS_PER_TICK = 60

export interface PlaybooksCronResult {
  due: number
  /** Runs opened and halted at the cost preview. */
  proposed: number
  /** Due playbooks whose window held nothing. Not a failure. */
  nothingToDo: number
  /** Skipped because a run was already live for that playbook. */
  alreadyRunning: number
  failed: number
  /** Playbooks that did not fit in this tick. Reported, never hidden. */
  deferred: number
}

/**
 * The dial, read over the owner connection.
 *
 * The screen reads it through the RLS-scoped Supabase client, which needs a
 * Clerk session. This runs on a schedule and has none, so it reads the same rows
 * the same way `lib/playbooks/store` reads everything else — and the workspace id
 * comes from the playbook row, not from a request.
 */
async function readDial(workspaceId: string): Promise<Map<Channel, AutonomyLevel>> {
  const rows = await store.readChannelAutonomy(workspaceId)
  const dial = new Map<Channel, AutonomyLevel>()
  for (const row of rows) dial.set(row.channel as Channel, row.level as AutonomyLevel)
  return dial
}

export async function runScheduledPlaybooks(now = new Date()): Promise<PlaybooksCronResult> {
  const rows = await store.dueScheduledPlaybooks(MAX_PLAYBOOKS_PER_TICK + 1)
  const due = rows.slice(0, MAX_PLAYBOOKS_PER_TICK)
  const deferred = rows.length > MAX_PLAYBOOKS_PER_TICK ? rows.length - MAX_PLAYBOOKS_PER_TICK : 0

  let proposed = 0
  let nothingToDo = 0
  let alreadyRunning = 0
  let failed = 0

  for (const playbook of due) {
    try {
      const recipe = playbookRecipe(playbook.recipe_key)
      // A blocked recipe cannot be enabled — the database refuses it — so this is
      // a backstop against a recipe that was retired after being switched on.
      if (!recipe || !isRunnable(recipe)) continue

      const runId = await store.openRun({
        workspaceId: playbook.workspace_id,
        playbookId: playbook.id,
        recipeKey: recipe.key,
        triggerSource: 'schedule',
        userId: null,
      })
      if (!runId) {
        // The partial unique index refused: one is already live. Normal, and not
        // a failure — the customer has a preview waiting that nobody has looked
        // at, and opening a second would charge twice for the same festival.
        alreadyRunning += 1
        continue
      }

      const dial = await readDial(playbook.workspace_id)
      const proposal = proposeFestivals(playbook.params, dial, recipe.outputAction, now)

      // Marked BEFORE the outcome is known. A tick that proposed and then failed
      // to record that it ran would re-open the same run on the next tick, and
      // the one-live-run index would turn that into a permanent no-op.
      await store.markRan(playbook.id, playbook.workspace_id)

      if (proposal.items.length === 0) {
        await store.finishNothingToDo(runId, playbook.workspace_id)
        nothingToDo += 1
        continue
      }

      await store.writeItems(runId, playbook.workspace_id, proposal.items)
      const preview = previewRunCost(
        proposal.items.map((item, index) => ({
          id: String(index),
          position: index + 1,
          estimated_credits: item.estimatedCredits,
          included: true,
        })),
        null,
      )
      await store.haltForCostApproval(
        runId,
        playbook.workspace_id,
        preview.totalCredits,
        proposal.triggerDetail,
      )
      proposed += 1
    } catch (error) {
      failed += 1
      reportServerError(error, {
        action: 'cron.playbooks',
        workspaceId: playbook.workspace_id,
      })
    }
  }

  return { due: due.length, proposed, nothingToDo, alreadyRunning, failed, deferred }
}
