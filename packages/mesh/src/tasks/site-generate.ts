import { z } from 'zod'
import { SiteGenerateOutputSchema } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef, SiteGenerateOutput } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

const MAX_TOKENS = 4096

/** Site brief. Local input (the page/section tree output is the frozen seam). */
export const SiteGenerateInputSchema = z.object({
  name: z.string().min(1),
  goal: z.string().default(''),
  pages: z.int().min(1).max(5).default(1),
  prompt: z.string().default(''),
})
export type SiteGenerateInput = z.infer<typeof SiteGenerateInputSchema>

const SYSTEM = `You generate a small marketing website for Sahoda, section by section.
Output ONLY a JSON object matching:
{ "pages": [ { "path": string, "title": string, "seo"?: { "description": string },
  "sections": [ { "kind": "hero"|"features"|"offer"|"testimonials"|"faq"|"contact",
                  "content": object } ] } ] }
Rules: use ONLY those six section kinds; the homepage ("/") always leads with a hero;
each section's "content" holds its copy (e.g. headline, subhead, body, items); ground
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
    { role: 'system', content: SYSTEM },
    ...(brand ? [brand] : []),
    { role: 'user', content: user },
  ]
}

// No demo-fallback: a double JSON failure returns a typed PROVIDER_ERROR.
export const siteGenerateTask: MeshTaskSpec<SiteGenerateInput, SiteGenerateOutput> = {
  def,
  buildMessages,
}
