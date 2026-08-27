import { z } from 'zod'
import { SiteGenerateOutputSchema } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef, SiteGenerateOutput } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'
import { PROSE_RULES } from '../prose-rules'

/**
 * 8192. Telemetry shows 4,980 output tokens against the old 4,096 ceiling — a
 * repaired SUM, i.e. proof this task was already truncating. It is `premium`
 * tier, the most expensive model we route to, so the ceiling change has real
 * cost consequences: a run that needs the room now gets it in ONE call instead
 * of paying for a truncation plus a repair that truncates again.
 */
const MAX_TOKENS = 8192

/** Site brief. Local input (the page/section tree output is the frozen seam). */
export const SiteGenerateInputSchema = z.object({
  name: z.string().min(1),
  goal: z.string().default(''),
  pages: z.int().min(1).max(5).default(1),
  prompt: z.string().default(''),
})
export type SiteGenerateInput = z.infer<typeof SiteGenerateInputSchema>

/**
 * `testimonials` is absent from the permitted kinds ON PURPOSE, and its absence is a cost
 * saving rather than the safeguard.
 *
 * A brand has a voice; it does not have customers we can quote. Asked for a testimonials
 * section, a model writes five-star quotes and attributes them to people who do not exist,
 * and that goes out under a real business's name (docs/22, F3). The refusal that actually
 * holds is `UNATTESTABLE_KINDS` in `packages/sites/src/normalize/attested.ts`, on the one
 * path model output takes into the database — because `SectionKind` is a frozen enum that
 * still contains `testimonials`, so a model emitting one anyway parses fine and no prompt
 * line can stop it.
 *
 * Removing it here means we stop paying premium-tier output tokens to generate a section
 * that is thrown away on arrival. Restoring the word to this list would not restore the
 * behaviour; it would only restore the waste.
 */
const SYSTEM = `You generate a small marketing website for Sahoda, section by section.
Output ONLY a JSON object matching:
{ "pages": [ { "path": string, "title": string, "seo"?: { "description": string },
  "sections": [ { "kind": "hero"|"features"|"offer"|"faq"|"contact",
                  "content": object } ] } ] }
Rules: use ONLY those five section kinds; never invent a customer quote, a review, a
rating, a testimonial or any words attributed to a named person — you have no source for
one and a section containing one is discarded; the homepage ("/") always leads with a hero;
each section's "content" holds its copy (e.g. headline, subhead, body, items); the hero
and offer sections MUST each carry a short "ctaLabel" (2-4 words, e.g. "Shop the roast")
— it is the page's call to action and the only element that wears the brand colour; ground
every line in the brand and the goal. No markdown, no commentary.`

const def: MeshTaskDef<SiteGenerateInput, SiteGenerateOutput> = {
  name: 'site_generate',
  tier: 'premium',
  inputSchema: SiteGenerateInputSchema,
  outputSchema: SiteGenerateOutputSchema,
  maxTokens: MAX_TOKENS,
  cachePrefix: 'brand_context',
}

function buildMessages(
  input: SiteGenerateInput,
  _ctx: MeshContext,
  brand?: ChatMessage,
): ChatMessage[] {
  const user = [
    `Site name: ${input.name}`,
    `Goal: ${input.goal || '(infer from the brand)'}`,
    `Pages: up to ${input.pages}`,
    `Brief: ${input.prompt || '(none — infer from the brand)'}`,
  ].join('\n')
  return [
    { role: 'system', content: `${SYSTEM}\n${PROSE_RULES}` },
    ...(brand ? [brand] : []),
    { role: 'user', content: user },
  ]
}

// No demo-fallback: a double JSON failure returns a typed PROVIDER_ERROR.
export const siteGenerateTask: MeshTaskSpec<SiteGenerateInput, SiteGenerateOutput> = {
  def,
  buildMessages,
}
