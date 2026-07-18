import { z } from 'zod'
import { ChannelSchema, PlanWeekOutputSchema } from '@sahoda/shared'
import type { Channel, MeshContext, MeshTaskDef, PlanWeekOutput } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

const MAX_TOKENS = 2048

/** Goals + channels for the week. Local input (the output contract is the frozen seam). */
export const PlanWeekInputSchema = z.object({
  goals: z.string().default(''),
  channels: z.array(ChannelSchema).min(1),
})
export type PlanWeekInput = z.infer<typeof PlanWeekInputSchema>

const SYSTEM = `You plan one week of social content for Sahoda — the seed of the weekly Loop.
Output ONLY a JSON object matching:
{ "briefs": [ { "title": string, "body": string, "channels": string[],
  "suggestedSlot": string /* ISO-8601 datetime */, "rationale"?: string } ] }
Rules: EXACTLY 5 briefs; spread them across the given channels and sensible times this
week; ground every idea in the brand and the stated goals; "body" is a short brief of the
post idea, not the final caption. No markdown, no commentary.`

const def: MeshTaskDef<PlanWeekInput, PlanWeekOutput> = {
  name: 'plan_week',
  tier: 'standard',
  inputSchema: PlanWeekInputSchema,
  outputSchema: PlanWeekOutputSchema,
  maxTokens: MAX_TOKENS,
  cachePrefix: 'brand_context',
}

function buildMessages(
  input: PlanWeekInput,
  _ctx: MeshContext,
  brand?: ChatMessage,
): ChatMessage[] {
  const channels: Channel[] = input.channels
  const user = [
    `Goals: ${input.goals || '(none given — infer from the brand)'}`,
    `Channels: ${channels.join(', ')}`,
    'Plan exactly 5 briefs for the coming week.',
  ].join('\n')
  return [
    { role: 'system', content: SYSTEM },
    ...(brand ? [brand] : []),
    { role: 'user', content: user },
  ]
}

// No demo-fallback: a double JSON failure returns a typed PROVIDER_ERROR.
export const planWeekTask: MeshTaskSpec<PlanWeekInput, PlanWeekOutput> = {
  def,
  buildMessages,
}
