import { z } from 'zod'
import { BrandSignalSchema, BrandStarterIdeasSchema } from '@sahoda/shared'
import type { MeshContext, MeshTaskDef } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'
import { PROSE_RULES } from '../prose-rules'

/**
 * PICTURE IDEAS, WRITTEN ONCE FROM A RESOLVED BRAND BRAIN.
 *
 * ── THE DEFECT THIS TASK REPLACES ───────────────────────────────────────────
 * `/studio` offered five hardcoded starters, the same five for every
 * workspace: a plate of samosas, a cup of chai, a shopfront at dusk. A
 * sales-training company and a design consultancy were both shown them.
 * `buildPromptStarters` (apps/web `lib/studio/prompt.ts`) is an improvement,
 * not the fix: it substitutes the customer's own words into sentences that
 * still assume a physical product on a counter, so a design consultancy
 * reads its own one-liner set "on a plain surface with soft morning light."
 * A TEMPLATE cannot know what a business is photographable as. That is the
 * whole reason a model is involved.
 *
 * ── THE PROMPT IS THE PRODUCT HERE ──────────────────────────────────────────
 * This task must produce ideas a SERVICE business can actually photograph, a
 * training company, a design consultancy, an accountant, not only businesses
 * with things on counters. `SYSTEM` says so explicitly and asks the model to
 * reason from what the business actually DOES before reaching for an object.
 *
 * ── NEVER INVENT A FACT ──────────────────────────────────────────────────────
 * The model sees only `input.signals`, resolved brand facts the caller
 * already read from the Brand Brain. Nothing else is fed in: no address, no
 * price, no claim about the business beyond what the brain itself holds. An
 * idea about generic office life is fine when the signals are thin; an idea
 * that names a product, service or place the signals never mentioned is not,
 * and `NO_INVENTION_RULE` states that in the model's own terms.
 *
 * ── RUN ONCE, NEVER ON A READ ────────────────────────────────────────────────
 * This task is FREE (folded into the cost of resolving a Brand Brain) and is
 * therefore never wrapped in `withCredits`. Its cost is bounded by
 * construction instead, entirely on the caller's side: it is invoked once per
 * `brand_memory.version`, from the write path that just produced that
 * version (`apps/web/src/lib/brand/write-starters.ts`), best-effort, and
 * never from anything that renders `/studio`. See that file for the "check
 * first, never rely on the unique constraint" contract and for why a failure
 * here can never fail a Brand Brain resolve.
 *
 * ── WHY THIS DOES NOT USE `cachePrefix: 'brand_context'` ────────────────────
 * Same reasoning as `prompt-refine.ts`: the caller here already has the exact
 * payload it just wrote (or is about to write) to `brand_memory`, and handing
 * that in directly avoids a second read of a row that may not have committed
 * yet. The cache-controlled prefix still exists structurally: `buildMessages`
 * marks the signals block `cache: true`, content-addressed by the block's own
 * text, so it changes exactly when the brain does.
 */

/**
 * 900: eight ideas at roughly 60 chars of label and 220 chars of prompt each
 * is about 2,240 characters of JSON, comfortably under 900 tokens with the
 * object/array punctuation included. Not a bake-off measurement (this task
 * has none yet); a deliberately generous ceiling for a call that runs once
 * per brand version rather than a per-request cost.
 */
const MAX_TOKENS = 900

/** Ceiling on how many resolved facts this task will read, matching `promptRefineTask`. */
const MAX_SIGNALS = 16

export const BrandStartersInputSchema = z.object({
  /**
   * Brand facts already resolved to text, each with the certainty the source
   * can support. May be empty for a brand Sahoda knows little about yet: the
   * model still owes 3 to 8 ideas, built from what a generic business of no
   * stated kind can be photographed doing.
   */
  signals: z.array(BrandSignalSchema).max(MAX_SIGNALS),
})
export type BrandStartersInput = z.infer<typeof BrandStartersInputSchema>

export const NO_INVENTION_RULE =
  'Use only the brand facts given below, if any. Never invent a product, price, offer, ' +
  'location, service or any other fact about the business that is not stated there. When ' +
  'the facts are thin, write ideas about generic work and workplace moments rather than ' +
  'guessing at specifics.'

export const SERVICE_BUSINESS_RULE =
  'Sahoda is used by service businesses as often as shops: consultancies, trainers, ' +
  'accountants, agencies, clinics. Never assume a physical product sitting on a counter. ' +
  'Reason from what the business actually DOES first, then decide what a camera could ' +
  'point at: people at work, a screen, a whiteboard, a handshake, a workspace, a document, ' +
  'a call in progress, hands doing the actual job. At least half of the ideas you write must ' +
  'work for a business with nothing to put on a counter.'

const SYSTEM =
  "You write picture ideas for a Sahoda customer's Studio, so the prompt box is never " +
  'blank. Output ONLY a JSON object {"starters": [{"label": string, "prompt": string}]} ' +
  'with 3 to 8 entries, no markdown, no commentary. "label" is short chip text (a few ' +
  'words, under 60 characters) naming the subject alone; "prompt" is the full sentence a ' +
  'picture-generation model can draw from (concrete, visual, one to two sentences). Each ' +
  `idea demonstrates a different useful thing to photograph. ${SERVICE_BUSINESS_RULE} ` +
  `${NO_INVENTION_RULE} ${PROSE_RULES}`

function buildMessages(input: BrandStartersInput, _ctx: MeshContext): ChatMessage[] {
  const messages: ChatMessage[] = [{ role: 'system', content: SYSTEM }]
  if (input.signals.length > 0) {
    messages.push({
      role: 'system',
      content: [
        'Brand facts you may use, and nothing else about the brand:',
        ...input.signals.map((s) => `- ${s.field} (${s.certainty}): ${s.value}`),
      ].join('\n'),
      // Content-addressed: this text is a deterministic rendering of the
      // brain version this task was called for, so it only changes when that
      // version does.
      cache: true,
    })
  }
  messages.push({
    role: 'user',
    content:
      input.signals.length > 0
        ? 'Write the picture ideas now, grounded in the brand facts above.'
        : 'Write the picture ideas now. Nothing about this brand is known yet, so keep every idea generic and business-type-free.',
  })
  return messages
}

const RawBrandStartersOutputSchema = z.object({ starters: BrandStarterIdeasSchema })
export const BrandStartersOutputSchema = RawBrandStartersOutputSchema
export type BrandStartersOutput = z.infer<typeof BrandStartersOutputSchema>

const def: MeshTaskDef<BrandStartersInput, BrandStartersOutput> = {
  name: 'brand_starters',
  tier: 'economy',
  inputSchema: BrandStartersInputSchema,
  outputSchema: BrandStartersOutputSchema,
  maxTokens: MAX_TOKENS,
}

// No demo-fallback: only brand_guidelines has one. An output with fewer than 3
// or more than 8 ideas fails BrandStarterIdeasSchema, spends the runner's one
// repair retry, and on a second failure returns a typed PROVIDER_ERROR — the
// caller (`write-starters.ts`) treats that as "nothing to write" and moves on,
// never as a reason to fail the Brand Brain save it rode in on.
export const brandStartersTask: MeshTaskSpec<BrandStartersInput, BrandStartersOutput> = {
  def,
  buildMessages,
}
