import { describe, it, expect } from 'vitest'

import { brandExtractTask } from './tasks/brand-extract'
import { brandGuidelinesTask } from './tasks/brand-guidelines'
import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask } from './tasks/content-variants'
import { gateClassifyTask } from './tasks/gate-classify'
import { imageGenerateDef } from './tasks/image-generate'
import { planWeekTask } from './tasks/plan-week'
import { siteGenerateTask } from './tasks/site-generate'

/**
 * WHICH TASKS READ THE BRAND BRAIN — the list the /brain screen's copy rests on.
 *
 * ── WHY A SENTENCE ON A SCREEN NEEDS AN ASSERTION IN THIS PACKAGE ────────────
 * Four surfaces on /brain told the reader what these fields are written into,
 * and for months the list was wrong in both directions of the same sentence:
 * it promised a REPLY (no mesh task writes one; the inbox inserts what a person
 * typed) and a CAMPAIGN (a folder of posts, with no generation step of its own).
 * Nothing could have caught it, because the copy named product surfaces and the
 * truth lives here, in eight `cachePrefix` fields nobody was counting.
 *
 * `brain-claim.test.ts` in apps/web holds the copy. This holds the fact the copy
 * describes. The pair is the guard: widen the brain's reach and this fails,
 * which is the moment somebody has to decide whether the sentence on the screen
 * should widen with it. Narrow it and this fails too — copy that still promises
 * a surface the brain no longer reaches is the same defect wearing the other
 * face.
 *
 * This deliberately lists all EIGHT tasks rather than the readers alone.
 * `market-injection.test.ts`'s equivalent names only its three, so a fourth task
 * quietly setting the flag would not disturb it. A list of every task cannot
 * have that hole.
 */
describe('the Brand Brain’s readers', () => {
  it('names every task, and which of them the brain reaches', () => {
    // `cachePrefix: 'brand_context'` is the whole mechanism — `engine.ts` fetches
    // and injects the brand message for exactly the tasks that declare it.
    const tasks = [
      ['brand_guidelines', brandGuidelinesTask.def],
      ['brand_extract', brandExtractTask.def],
      ['gate_classify', gateClassifyTask.def],
      ['image_generate', imageGenerateDef],
      ['caption_rewrite', captionRewriteTask.def],
      ['content_variants', contentVariantsTask.def],
      ['plan_week', planWeekTask.def],
      ['site_generate', siteGenerateTask.def],
    ] as const

    const readers = tasks
      .filter(([, def]) => def.cachePrefix === 'brand_context')
      .map(([name]) => name)

    // The four, and the customer-facing names they carry on /brain: the captions
    // Sahoda writes (caption_rewrite rewrites one, content_variants writes the
    // per-channel versions), the weekly plan, and the website it builds.
    expect(readers).toEqual(['caption_rewrite', 'content_variants', 'plan_week', 'site_generate'])

    // And the four it does not reach, each for a stated reason in its own file:
    // brand_extract would let a wrong guess confirm itself, brand_guidelines
    // PRODUCES the brain, gate_classify must not let brand voice argue a
    // borderline post's case, and image_generate sends no chat messages at all.
    expect(tasks.length - readers.length).toBe(4)
  })
})
