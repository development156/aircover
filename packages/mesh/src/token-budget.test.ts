import { describe, expect, it } from 'vitest'
import { REQUIRED_HEADROOM, TOKEN_EVIDENCE } from './token-budget'
import { brandExtractTask } from './tasks/brand-extract'
import { brandGuidelinesTask } from './tasks/brand-guidelines'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask } from './tasks/content-variants'
import { gateClassifyTask } from './tasks/gate-classify'
import { planWeekTask } from './tasks/plan-week'
import { siteGenerateTask } from './tasks/site-generate'

/**
 * THE CEILING IS CHECKED, NOT HAND-SET.
 *
 * `MAX_TOKENS = 2048` on brand_extract cost 45% of every extraction for weeks,
 * silently, because nothing ever compared the number to what the task actually
 * emits. This test is that comparison.
 */
const TASKS = [
  brandExtractTask,
  brandGuidelinesTask,
  captionRewriteTask,
  contentVariantsTask,
  gateClassifyTask,
  planWeekTask,
  siteGenerateTask,
]

describe('token ceilings clear their measured need', () => {
  it.each(TASKS.map((t) => [t.def.name, t.def.maxTokens] as const))(
    '%s has headroom over what it actually emits',
    (name, maxTokens) => {
      const evidence = TOKEN_EVIDENCE[name as keyof typeof TOKEN_EVIDENCE]
      expect(
        evidence,
        `${name} has no recorded evidence — measure it before shipping`,
      ).toBeDefined()
      const required = Math.ceil(evidence.observedMax * REQUIRED_HEADROOM)
      expect(
        maxTokens,
        `${name}: ceiling ${maxTokens} < ${required} (observed ${evidence.observedMax} x ${REQUIRED_HEADROOM}). ${evidence.source}`,
      ).toBeGreaterThanOrEqual(required)
    },
  )

  it('every wired task carries evidence — a new task cannot skip the check', () => {
    for (const t of TASKS) {
      expect(Object.keys(TOKEN_EVIDENCE), t.def.name).toContain(t.def.name)
    }
  })
})
