import { z } from 'zod'
import { ChannelSchema, PlanWeekOutputSchema } from '@sahoda/shared'
import type { Channel, MeshContext, MeshTaskDef, PlanWeekOutput } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

/** 3072: measured 1,855 x 1.4 (token-budget.ts). 2048 left 9% headroom — one cliff away. */
const MAX_TOKENS = 3072

/**
 * How far ahead a slot may be placed. Mirrors the caller's `SLOT_HORIZON_DAYS`
 * (apps/web `lib/planner/slots.ts`), which clamps anything beyond it. The model
 * is told this boundary so "sensible times" is an instruction it can actually
 * satisfy rather than one it is silently judged against.
 */
const SLOT_HORIZON_DAYS = 14

const DAY_MS = 86_400_000

/** Goals + channels for the week. Local input (the output contract is the frozen seam). */
export const PlanWeekInputSchema = z.object({
  goals: z.string().default(''),
  channels: z.array(ChannelSchema).min(1),
  /**
   * Caller's clock as ISO-8601. Passed in rather than read here so
   * `buildMessages` stays pure and runs stay reproducible. Optional: when
   * absent the date line is omitted entirely — a wrong "today" would be worse
   * than none.
   */
  nowIso: z.string().optional(),
})
export type PlanWeekInput = z.infer<typeof PlanWeekInputSchema>

/** `YYYY-MM-DD` in UTC, or null when the clock is absent/unparseable. */
function isoDay(value: string | undefined): string | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  return new Date(at).toISOString().slice(0, 10)
}

function horizonDay(value: string | undefined): string | null {
  if (!value) return null
  const at = new Date(value).getTime()
  if (Number.isNaN(at)) return null
  return new Date(at + SLOT_HORIZON_DAYS * DAY_MS).toISOString().slice(0, 10)
}

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
  _knowledge?: ChatMessage,
  market?: ChatMessage,
): ChatMessage[] {
  const channels: Channel[] = input.channels
  const today = isoDay(input.nowIso)
  const horizon = horizonDay(input.nowIso)
  const user = [
    `Goals: ${input.goals || '(none given — infer from the brand)'}`,
    `Channels: ${channels.join(', ')}`,
    // Anchor the model in real time. Without this it has no idea what "the
    // coming week" means, emits slots from an arbitrary era, and the caller
    // discards every one of them.
    ...(today && horizon
      ? [
          `Today is ${today} (UTC).`,
          `Every suggestedSlot must be a UTC ISO-8601 datetime after today and on or before ${horizon}; anything outside that window is discarded.`,
        ]
      : []),
    'Plan exactly 5 briefs for the coming week.',
  ].join('\n')
  // Brand before market, deliberately. The Brand Brain is who this business
  // says it is and the Marketing Brain is what its numbers show; when the two
  // pull in different directions the brand wins, and the order the model reads
  // them in is the cheapest way to say so.
  return [
    { role: 'system', content: SYSTEM },
    ...(brand ? [brand] : []),
    ...(market ? [market] : []),
    { role: 'user', content: user },
  ]
}

// No demo-fallback: a double JSON failure returns a typed PROVIDER_ERROR.
export const planWeekTask: MeshTaskSpec<PlanWeekInput, PlanWeekOutput> = {
  def,
  buildMessages,
  /**
   * The FIRST and only task reading the Marketing Brain, on purpose.
   *
   * docs/53's build order: one task means the effect is attributable. If next
   * week's plans get better, nothing else moved; if they get worse, there is one
   * thing to turn off. Planning is also the task with the most to gain — it is
   * the one place where "your Tuesday posts do better" changes what gets made
   * rather than how a sentence is worded.
   */
  wantsMarketContext: true,
}
