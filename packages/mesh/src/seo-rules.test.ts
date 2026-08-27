import { describe, expect, it } from 'vitest'
import { ChannelSchema } from '@sahoda/shared'
import type { MeshContext } from '@sahoda/shared'

import { captionRewriteTask } from './tasks/caption-rewrite'
import { contentVariantsTask, ContentVariantsInputSchema } from './tasks/content-variants'
import { SEARCH_SURFACE_RULE, SEO_RULES } from './seo-rules'

const ctx: MeshContext = {
  workspaceId: 'w1',
  traceId: 't1',
  userId: 'u1',
  actionType: 'post_variants',
  creditsCharged: 3,
}

function variantsSystem(): string {
  const input = ContentVariantsInputSchema.parse({
    body: 'Fresh bread every morning at the Koregaon Park shop.',
    channels: [...ChannelSchema.options],
  })
  return contentVariantsTask.buildMessages(input, ctx)[0]!.content
}

/**
 * SEARCH TERMS IN A GENERATED CAPTION.
 *
 * These guard the PROMPT, which is all that can be guarded here. No test in this
 * file can assert that a returned caption front-loads a search term or that it
 * did not quietly add a claim — the output schema models no keywords, so there
 * is no field to check and no validator that could tell an author's own word
 * from an invented one without the original beside it. `seo-rules.ts` says the
 * same thing in its own header rather than letting a green suite imply coverage
 * that does not exist.
 */

describe('caption generation asks for search terms', () => {
  it('carries the rules in the system prompt', () => {
    const system = variantsSystem()

    expect(system).toContain(SEO_RULES)
    expect(system).toContain(SEARCH_SURFACE_RULE)
  })

  /**
   * THE CLAUSE THAT MATTERS MORE THAN THE FEATURE.
   *
   * "Best bakery in Pune" is a claim about a real business. A model that adds it
   * because it reads well has put a sentence nobody said in front of that
   * business's customers, under their name, on their account. Optimising is
   * rearranging and choosing among the author's own words; the moment it adds
   * something they did not write it has stopped optimising.
   *
   * Each kind is asserted by name, because the failure this guards against is a
   * later edit trimming the list to something shorter and friendlier.
   */
  it('forbids inventing anything the author did not write, kind by kind', () => {
    const system = variantsSystem()

    for (const kind of ['service', 'location', 'superlative', 'price', 'claim']) {
      expect(system, `the do-not-invent rule no longer names a ${kind}`).toMatch(
        new RegExp(`NEVER invent[^.]*${kind}`),
      )
    }
  })

  /**
   * IT MUST NOT PROMISE RESEARCH THIS PRODUCT DOES NOT DO.
   *
   * `docs/50` established that Sahoda has no keyword-volume source, no trend
   * feed and no competitor data, and nothing since has changed it. A prompt that
   * told the model to pick "trending" or "high-volume" terms would be asking it
   * to invent a figure nobody measured — the same defect as printing a number no
   * query produced, on the surface that goes out in public.
   */
  it('claims no volume, no trend and no ranking, because none exists', () => {
    for (const forbidden of [/trending/i, /search volume/i, /high[- ]volume/i, /rank(ing|s)?\b/i]) {
      expect(SEO_RULES, `${forbidden} promises research this product cannot do`).not.toMatch(
        forbidden,
      )
    }
  })

  /**
   * SCOPE, AND IT IS DELIBERATE.
   *
   * The ask was "in caption GENERATION". `caption_rewrite` is the other thing,
   * and its four tone modes must stay what they say they are: a Polish that
   * quietly restructured a sentence for search would be doing something the
   * writer did not ask for, to words the writer wrote themselves, on a screen
   * whose whole premise is that their words are theirs.
   */
  it('does NOT reach the rewrite task, whose modes mean what they say', () => {
    const input = { text: 'Fresh bread every morning.', instruction: 'polish' as const }
    const system = captionRewriteTask.buildMessages(input, ctx)[0]!.content

    expect(system).not.toContain(SEO_RULES)
  })
})
