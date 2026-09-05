import { describe, expect, it } from 'vitest'

import { createMesh } from './mesh'
import { brandGuidelinesTask } from './tasks/brand-guidelines'
import { brandExtractTask } from './tasks/brand-extract'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask } from './tasks/content-variants'
import { planWeekTask } from './tasks/plan-week'
import { siteGenerateTask } from './tasks/site-generate'
import { gateClassifyTask } from './tasks/gate-classify'
import { promptRefineTask } from './tasks/prompt-refine'

/**
 * EVERY TASK THIS PACKAGE EXPORTS CAN ACTUALLY BE RUN.
 *
 * ── THE DEFECT THIS CLOSES, AND WHY NOTHING CAUGHT IT ───────────────────────
 * `gateClassifyTask` was written, exported from `index.ts`, and CALLED by
 * `apps/jobs/src/gate/classifier.ts:113` through `mesh.runTask`. It was never
 * added to `createMesh`'s dispatch map. So the call returned
 * `VALIDATION_ERROR: unknown mesh task: gate_classify` — measured with a probe
 * against a real `createMesh` and a fake transport.
 *
 * That error was not surfaced as an error. `classifier.ts:141` maps
 * VALIDATION_ERROR to the classifier state `unparseable`; `verdict.ts:146`
 * turns any non-ran state into `decision: 'hold'`; and `gateHoldIsTransient`
 * (verdict.ts:219) returns true only for `unavailable` and `timeout`. So the
 * hold was TERMINAL: every post that passed the literal phrase checks was
 * blocked from publishing for ever, and the customer read "The wording check
 * answered in a form we could not read" about a call nobody made.
 *
 * Two green suites hid it. `mesh.test.ts:100` proves an UNKNOWN name errors,
 * which is true whether or not a REAL task is missing. And every publish test
 * in `apps/jobs` mocks the gate rather than wiring the real mesh, so the one
 * seam where the two halves meet was never exercised by anything.
 *
 * ── WHY THIS TEST IS A LIST AND NOT A LOOP OVER `index.ts` ──────────────────
 * A test that derived its own list from the same module it is checking would
 * pass for a task that is neither exported nor registered. Written out by hand,
 * adding a seventh task means adding a line HERE too — and forgetting to is a
 * red test rather than a post nobody can publish.
 */
const EVERY_TASK = [
  brandGuidelinesTask,
  brandExtractTask,
  captionRewriteTask,
  contentVariantsTask,
  planWeekTask,
  siteGenerateTask,
  gateClassifyTask,
  promptRefineTask,
]

const ENV = {
  OPENROUTER_API_KEY_RESEARCH: 'k',
  OPENROUTER_API_KEY_TEXT: 'k',
  OPENROUTER_API_KEY_IMAGE: 'k',
  OPENAI_API_KEY: 'k',
  NEXT_PUBLIC_SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'k',
}

/** Answers anything with a shape the runner can at least parse past dispatch. */
const transport = async () =>
  new Response(JSON.stringify({ model: 'm', choices: [{ message: { content: '{}' } }] }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })

describe('every exported mesh task is reachable through createMesh', () => {
  it.each(EVERY_TASK.map((t) => [t.def.name, t] as const))(
    '%s is registered in the dispatch map',
    async (_name, task) => {
      const mesh = createMesh({ env: ENV as never, fetchImpl: transport })

      const result = await mesh.runTask(
        // A union across seven differently-typed specs, which `runTask`'s
        // generics cannot narrow. The cast is the point rather than a
        // concession: what this asserts is DISPATCH BY NAME, not the input
        // contract, and every task's input is separately typed at its own
        // call site in the product.
        task.def as never,
        {} as never,
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          traceId: 'registered-tasks',
        } as never,
      )

      // The task may still fail on its INPUT — `{}` satisfies almost nothing —
      // and that is fine and expected. What must never happen is dispatch
      // itself refusing the name, because that is the failure that reads as a
      // parse problem downstream and holds a post for ever.
      if (!result.ok) {
        expect(result.error.message, `${task.def.name} is not in the dispatch map`).not.toContain(
          'unknown mesh task',
        )
      }
    },
  )

  it('still refuses a name that genuinely is not a task', () => {
    // The other direction. Without this, registering a catch-all would satisfy
    // every assertion above while making the dispatch map meaningless.
    const mesh = createMesh({ env: ENV as never, fetchImpl: transport })
    return mesh
      .runTask(
        { name: 'not_a_real_task' } as never,
        {} as never,
        {
          workspaceId: '11111111-1111-4111-8111-111111111111',
          traceId: 'registered-tasks',
        } as never,
      )
      .then((result) => {
        expect(result.ok).toBe(false)
        if (!result.ok) expect(result.error.message).toContain('unknown mesh task')
      })
  })
})
