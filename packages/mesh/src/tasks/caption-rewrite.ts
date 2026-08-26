import { CaptionRewriteInputSchema, CaptionRewriteOutputSchema } from '@sahoda/shared'
import type {
  CaptionRewriteInput,
  CaptionRewriteOutput,
  MeshContext,
  MeshTaskDef,
} from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

const MAX_TOKENS = 512

const DIRECTIVES: Record<CaptionRewriteInput['instruction'], string> = {
  rewrite: 'Rewrite it to read clearer and more on-brand, at roughly the same length and meaning.',
  shorten: 'Make it noticeably shorter and tighter without losing the core message.',
  hookify: 'Rework the opening into a strong, scroll-stopping hook; keep the rest intact.',
}

const SYSTEM_BASE =
  'You edit social captions. Output ONLY a JSON object {"text": string} — no markdown, no commentary. Preserve @mentions, #hashtags, and links exactly.'

const def: MeshTaskDef<CaptionRewriteInput, CaptionRewriteOutput> = {
  name: 'caption_rewrite',
  tier: 'economy',
  inputSchema: CaptionRewriteInputSchema,
  outputSchema: CaptionRewriteOutputSchema,
  maxTokens: MAX_TOKENS,
  // "more on-brand" was the directive's promise while the task had no brand to be
  // on. content_variants and plan_week ground; the one task the user invokes
  // directly on their own words did not. `cachePrefix` alone only makes the engine
  // FETCH the brain — buildMessages below is what actually spends it.
  cachePrefix: 'brand_context',
}

/** Rewrite the selection when the editor sends one; otherwise the whole caption. */
function target(input: CaptionRewriteInput): string {
  return input.selection ?? input.text
}

function buildMessages(
  input: CaptionRewriteInput,
  _ctx: MeshContext,
  brand?: ChatMessage,
  knowledge?: ChatMessage,
): ChatMessage[] {
  return [
    { role: 'system', content: `${SYSTEM_BASE} ${DIRECTIVES[input.instruction]}` },
    ...(brand ? [brand] : []),
    ...(knowledge ? [knowledge] : []),
    { role: 'user', content: target(input) },
  ]
}

// No demo-fallback: only brand_guidelines has one (CLAUDE.md). A double JSON
// failure here returns a typed PROVIDER_ERROR — no mock-success.
export const captionRewriteTask: MeshTaskSpec<CaptionRewriteInput, CaptionRewriteOutput> = {
  def,
  buildMessages,
  // Retrieved against the same text the model is asked to rewrite, so a caption
  // about the tasting menu draws the passage about the tasting menu.
  knowledgeQuery: target,
}
