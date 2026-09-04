'use server'

import { auth } from '@clerk/nextjs/server'
import { createMesh, promptRefineTask, type Mesh } from '@sahoda/mesh'
import type { BrandSignal } from '@sahoda/shared'
import { z } from 'zod'
import { randomUUID } from 'node:crypto'

import { reportServerError } from '@/lib/observability/report'
import {
  describeRefineContext,
  resolveRefineContext,
  type BrainState,
} from '@/lib/studio/prompt-refine'
import { workspaceForWrite } from '@/lib/workspaces'

/**
 * REFINE WHAT A PERSON TYPED, WITHOUT TOUCHING WHAT THEY TYPED.
 *
 * ── REVERSIBLE, BY CONSTRUCTION ──────────────────────────────────────────────
 * This action writes NOTHING. It reads the workspace's Brand Brain, asks the
 * mesh for a refined version of `wanted`, and hands back BOTH the original and
 * the refinement in the same response. There is no field this action could
 * overwrite even by accident — the person's typed words live in the screen's
 * own state until THEY decide to keep the refinement, which is a separate,
 * later action this file does not perform.
 *
 * ── THREE STATES, NEVER TWO ──────────────────────────────────────────────────
 * `resolveRefineContext` keeps "nothing in the Brand Brain" and "could not
 * read the Brand Brain" apart all the way through, and `describeRefineContext`
 * turns that into the sentence a person reads before they accept a
 * refinement. Both ride on the response so the screen never has to guess.
 *
 * ── PRICING: THERE IS NONE, AND NONE IS INVENTED HERE ────────────────────────
 * `pricing.config.json` has no `actions` entry for a prompt-refine task, and
 * that file is read-only from code — CLAUDE.md is explicit that only
 * `creditCost()` reads it, and this file does not add a key to it. So this
 * action runs WITHOUT a credit hold: no `withCredits`, no charge, no line in
 * the ledger. That is a deliberate absence, not an oversight, and it needs a
 * founder decision before this ships wide:
 *
 *   Every call still reaches `economy`-tier chat model (`studio_prompt_refine`,
 *   `packages/mesh/src/tasks/prompt-refine.ts`) and writes a real
 *   `ai_provider_logs` row with a real `cost_usd`. At economy-tier rates that
 *   is a small number per call, and it is UNBOUNDED per call today: nothing
 *   in this file limits how many times one workspace can press the refine
 *   control. `caption_rewrite` — a same-shape, same-tier text task — costs 1
 *   credit. Until this is priced (or otherwise bounded), it is a real,
 *   uncapped cost with no revenue attached, and that is the thing this
 *   comment exists to flag rather than to quietly ship past.
 */

const RefineInputSchema = z.object({
  /** Same bound the image-conditioning prompt box already carries. */
  wanted: z.string().trim().min(3).max(1000),
})

export type RefinePromptState =
  | {
      ok: true
      /** Exactly what was typed. The screen keeps this so a rejected refinement is a no-op. */
      original: string
      refined: string
      headline: string
      body: string
      brainState: BrainState
      usedSignals: BrandSignal[]
    }
  | { ok: false; message: string }

const REFUSALS = {
  signedOut: 'Sign in to refine a prompt.',
  malformed: 'Describe the picture you want, in a few words at least.',
  failed: 'Sahoda could not refine that prompt. Nothing was changed.',
} as const

let meshSingleton: Mesh | undefined
function getMesh(): Mesh {
  return (meshSingleton ??= createMesh())
}

export async function refineStudioPrompt(input: unknown): Promise<RefinePromptState> {
  let workspaceId: string | undefined

  try {
    const { userId } = await auth()
    if (!userId) return { ok: false, message: REFUSALS.signedOut }

    const ws = await workspaceForWrite()
    if (!ws.ok) return { ok: false, message: ws.message }
    workspaceId = ws.workspace.id

    const parsed = RefineInputSchema.safeParse(input)
    if (!parsed.success) return { ok: false, message: REFUSALS.malformed }

    // Read before anything is spent: a brain that cannot be read produces an
    // unconditioned refinement, which is a worse result and not a failure, and
    // the response says which happened.
    const refineContext = await resolveRefineContext(ws.workspace.id)
    const { headline, body } = describeRefineContext(refineContext)

    const result = await getMesh().runTask(
      promptRefineTask.def,
      { wanted: parsed.data.wanted, signals: refineContext.signals },
      { workspaceId: ws.workspace.id, traceId: randomUUID(), userId },
    )

    // Our own copy, never `result.error.message`: that can carry provider text.
    if (!result.ok) return { ok: false, message: REFUSALS.failed }

    return {
      ok: true,
      original: parsed.data.wanted,
      refined: result.data.refined,
      headline,
      body,
      brainState: refineContext.brainState,
      usedSignals: refineContext.signals,
    }
  } catch (error) {
    reportServerError(error, { action: 'refineStudioPrompt', workspaceId })
    return { ok: false, message: REFUSALS.failed }
  }
}
