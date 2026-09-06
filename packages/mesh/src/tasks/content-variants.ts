import { z } from 'zod'
import { ChannelSchema, ContentVariantsOutputSchema, CONSTRAINTS } from '@sahoda/shared'
import type { Channel, ContentVariantsOutput, MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'
import { PROSE_RULES } from '../prose-rules'
import { SEARCH_SURFACE_RULE, SEO_RULES } from '../seo-rules'

/** 2048: measured 925 x 1.4 (token-budget.ts). 1024 left 10% headroom. */
const MAX_TOKENS = 2048

/** Canonical body + the channels to adapt it for. Local input (not a cross-worktree seam). */
export const ContentVariantsInputSchema = z.object({
  body: z.string().min(1),
  channels: z.array(ChannelSchema).min(1),
})
export type ContentVariantsInput = z.infer<typeof ContentVariantsInputSchema>

/**
 * ── KEYWORDS, NOT HASHTAGS ───────────────────────────────────────────────────
 * Founder's ruling (REQUESTS §34). The JSON KEY stays `hashtags` because it maps
 * straight onto `post_variants.extras.hashtags`, which is untyped jsonb with
 * production rows already in it — renaming the key would orphan every one. What
 * changes is what goes in it, and the model is told the difference explicitly
 * rather than left to infer it from a field name that now lies.
 *
 * `normalizeKeywords` strips a stray `#` and wraps the value, so a model that
 * ignores this still produces a legal list. The instruction is here to make the
 * CONTENT right: a keyword is a phrase a customer would type into a search box,
 * which is a different thing from a hashtag and is usually more than one word.
 */
const KEYWORD_RULE = `KEYWORDS, NOT HASHTAGS. The "hashtags" field holds SEARCH KEYWORDS. \
Never write a "#". Write the plain words somebody would type into a search box, and prefer \
a real phrase over a single word: "chai in pune" beats "chai". Sahoda wraps each one as \
[keyword] when it publishes, so do not add brackets yourself. Two to six per channel.`

const SYSTEM = `You adapt one canonical social post into native per-channel variants for Sahoda.
Output ONLY a JSON object matching:
{ "variants": [ { "channel": <one of the requested channels>, "body": string,
  "extras": { "hashtags"?: string[], "gbpCta"?: string } } ] }
Rules: exactly one variant per requested channel; stay within each channel's character
limit; follow each platform's norms for links and (GBP) call-to-action; keep
the core message and the brand voice. No markdown, no commentary.
${KEYWORD_RULE}
${SEO_RULES}
${SEARCH_SURFACE_RULE}
${PROSE_RULES}`

export { KEYWORD_RULE }

/**
 * ── PER-PLATFORM VOICE, NOT JUST PER-PLATFORM LIMITS ─────────────────────────
 * `channelBrief` told the model how LONG a post could be and nothing about how it
 * should READ, so every channel came back in one register — the canonical post,
 * trimmed. A shop owner opening the X variant beside the LinkedIn one saw two
 * lengths of a single voice, not two posts that belong on two different
 * platforms. This is the "follow each platform's norms" the old prompt gestured
 * at and never named.
 *
 * One line each, guidance not law: the body still carries the brand voice and the
 * core message; this shapes HOW it lands. No em-dashes (PROSE_RULES still holds).
 * Emoji are native to a social caption and are NOT the interface emoji ban
 * (docs/22 §4), so Instagram is told they belong — stripping them there is a
 * regression, not a fix.
 */
const CHANNEL_STYLE: Record<Channel, string> = {
  x: 'punchy and short. Lead with the single most interesting thing, cut every warm-up word, one idea per post.',
  instagram:
    'warm and visual, written to sit under a photo. A friendly opening line, emoji where they feel natural, and let the keywords do the discovery.',
  linkedin:
    'professional and specific. A clear first line that states the value, then room to explain it plainly. No breathless hype.',
  facebook:
    'conversational and neighbourly, the way you would tell a regular. A hook or a question fits, and a link is fine.',
  gbp: 'factual and local, the way a good listing reads. Say what is on offer and end on a clear next step. Google indexes the words, so no keyword list.',
  telegram:
    'direct and plain, a short broadcast to people who already follow you. Say the thing, add a link if there is one.',
}

/**
 * Per-channel brief: the numeric limits from the shared Constraint Engine (one
 * source of truth) on the first line, then the voice that channel is written in.
 */
function channelBrief(channel: Channel): string {
  const spec = CONSTRAINTS[channel]
  const parts = [`max ${spec.maxChars} chars`, `links ${spec.linkPolicy}`]
  if (spec.maxHashtags !== undefined) parts.push(`≤${spec.maxHashtags} keywords`)
  if (spec.gbp) parts.push(`CTA one of: ${spec.gbp.ctaTypes.join('/')}`)
  return `- ${channel}: ${parts.join('; ')}\n    voice: ${CHANNEL_STYLE[channel]}`
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
  market?: ChatMessage,
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
    // Brand ABOVE market. docs/51 RULING 1, enforced by reading order; a test
    // pins it, because an ordering is a convention a refactor can reverse.
    ...(brand ? [brand] : []),
    ...(knowledge ? [knowledge] : []),
    ...(market ? [market] : []),
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
  /**
   * Reads the brain for the reason `channel_return` exists: this task writes one
   * variant PER CHANNEL, and the one observation that knows a customer's
   * channels differ is the one measuring what each returns. Cutting a caption
   * for Instagram and for LinkedIn identically is the default this is meant to
   * end.
   */
  wantsMarketContext: true,
}
