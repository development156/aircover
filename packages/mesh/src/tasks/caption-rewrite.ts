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
}

function buildMessages(input: CaptionRewriteInput, _ctx: MeshContext): ChatMessage[] {
  // Rewrite the selection when the editor sends one; otherwise the whole caption.
  const target = input.selection ?? input.text
  return [
    { role: 'system', content: `${SYSTEM_BASE} ${DIRECTIVES[input.instruction]}` },
    { role: 'user', content: target },
  ]
}

// No demo-fallback: only brand_guidelines has one (CLAUDE.md). A double JSON
// failure here returns a typed PROVIDER_ERROR — no mock-success.
export const captionRewriteTask: MeshTaskSpec<CaptionRewriteInput, CaptionRewriteOutput> = {
  def,
  buildMessages,
}
