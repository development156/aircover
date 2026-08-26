import { z } from 'zod'
import { ChannelSchema, ContentVariantsOutputSchema, CONSTRAINTS } from '@sahoda/shared'
import type { Channel, ContentVariantsOutput, MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

/** 2048: measured 925 x 1.4 (token-budget.ts). 1024 left 10% headroom. */
const MAX_TOKENS = 2048

/** Canonical body + the channels to adapt it for. Local input (not a cross-worktree seam). */
export const ContentVariantsInputSchema = z.object({
  body: z.string().min(1),
  channels: z.array(ChannelSchema).min(1),
})
export type ContentVariantsInput = z.infer<typeof ContentVariantsInputSchema>

const SYSTEM = `You adapt one canonical social post into native per-channel variants for Sahoda.
Output ONLY a JSON object matching:
{ "variants": [ { "channel": <one of the requested channels>, "body": string,
  "extras": { "hashtags"?: string[], "gbpCta"?: string } } ] }
Rules: exactly one variant per requested channel; stay within each channel's character
limit; follow each platform's norms for hashtags, links, and (GBP) call-to-action; keep
the core message and the brand voice. No markdown, no commentary.`

/** One-line limit brief per channel, sourced from the shared Constraint Engine (one source of truth). */
function channelBrief(channel: Channel): string {
  const spec = CONSTRAINTS[channel]
  const parts = [`max ${spec.maxChars} chars`, `links ${spec.linkPolicy}`]
  if (spec.maxHashtags !== undefined) parts.push(`≤${spec.maxHashtags} hashtags`)
  if (spec.gbp) parts.push(`CTA one of: ${spec.gbp.ctaTypes.join('/')}`)
  return `- ${channel}: ${parts.join('; ')}`
}

const def: MeshTaskDef<ContentVariantsInput, ContentVariantsOutput> = {
  name: 'content_variants',
  tier: 'economy',
  inputSchema: ContentVariantsInputSchema,
  outputSchema: ContentVariantsOutputSchema,
  maxTokens: MAX_TOKENS,
  cachePrefix: 'brand_context',
}

function buildMessages(
  input: ContentVariantsInput,
  _ctx: MeshContext,
  brand?: ChatMessage,
  knowledge?: ChatMessage,
): ChatMessage[] {
  const user = [
    'Canonical post:',
    input.body,
    '',
    'Channels + limits:',
    input.channels.map(channelBrief).join('\n'),
    '',
    `Produce a variant for exactly these channels: ${input.channels.join(', ')}.`,
  ].join('\n')
  return [
    { role: 'system', content: SYSTEM },
    ...(brand ? [brand] : []),
    ...(knowledge ? [knowledge] : []),
    { role: 'user', content: user },
  ]
}

// No demo-fallback: a double JSON failure returns a typed PROVIDER_ERROR (no mock-success).
export const contentVariantsTask: MeshTaskSpec<ContentVariantsInput, ContentVariantsOutput> = {
  def,
  buildMessages,
  // The canonical body only. The channel limits are our own framing and would
  // just widen the query with words like "hashtags" that match every passage.
  knowledgeQuery: (input) => input.body,
}
