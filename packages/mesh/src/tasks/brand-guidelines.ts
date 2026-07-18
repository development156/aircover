import {
  BrandGuidelinesOutputSchema,
  DEMO_FALLBACK_PAYLOAD,
  ResolveInputSchema,
} from '@sahoda/shared'
import type { BrandMemoryPayload, MeshContext, MeshTaskDef, ResolveInput } from '@sahoda/shared'
import type { ChatMessage } from '../providers/types'
import type { MeshTaskSpec } from '../engine'

const MAX_TOKENS = 2048

/**
 * Static output contract for the Signal Resolution engine (FSD M1). Mirrors
 * BrandMemoryPayloadSchema key-for-key; the exactly-3 arrays are the fields the
 * engine's single repair retry most often has to correct.
 */
const SYSTEM = `You are the Signal Resolution engine for Sahoda's Brand Brain.
Turn a founder's onboarding signals into one Brand Brain JSON object.
Output ONLY a JSON object — no markdown, no commentary — matching exactly:
{
  "voice": { "descriptor": string, "formality_label": string,
             "signature_phrases": [string, string, string], "banned_phrases": string[] },
  "brand_persona": { "archetype": string, "one_liner": string,
                     "core_values": [string, string, string] },
  "customer_persona": { "one_liner": string, "primary_pain_point": string,
                        "primary_fear": string, "desired_identity": string },
  "hook": { "core_promise": string, "primary_emotion": string,
            "sample_hooks": [string, string, string] },
  "taboo": { "red_lines": string[] },
  "alignment": { "signal_lock": "strong" | "moderate" | "weak", "note": string }
}
Rules: signature_phrases, core_values, and sample_hooks have EXACTLY 3 items each.
Infer confidently from sparse signals — never leave a field blank. Set signal_lock
by how tightly the intake constrains the brand, and justify it in "note".`

const def: MeshTaskDef<ResolveInput, BrandMemoryPayload> = {
  name: 'brand_guidelines',
  tier: 'standard',
  inputSchema: ResolveInputSchema,
  outputSchema: BrandGuidelinesOutputSchema,
  maxTokens: MAX_TOKENS,
}

/** System contract first, resolve signals last. brand_guidelines PRODUCES the Brain, so there is no cache prefix. */
function buildMessages(input: ResolveInput, _ctx: MeshContext): ChatMessage[] {
  return [
    { role: 'system', content: SYSTEM },
    { role: 'user', content: JSON.stringify(input) },
  ]
}

export const brandGuidelinesTask: MeshTaskSpec<ResolveInput, BrandMemoryPayload> = {
  def,
  buildMessages,
  // The ONLY task with a demo-fallback (CLAUDE.md): served flagged on double JSON
  // failure, persisted with source='system'. Never presented as a real resolve.
  fallbackPayload: () => DEMO_FALLBACK_PAYLOAD,
}
