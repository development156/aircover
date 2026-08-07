import { z } from 'zod'
import { SignalLockSchema } from '../enums'
import type { AppError } from '../errors'

/**
 * Brand Brain resolve contract (FSD M1) — verified identical, key for key, to the
 * strict JSON contract embedded in `sahoda_brand_brain_demo.html`. This is the
 * output shape of the `brand_guidelines` mesh task and the `payload` of a
 * `brand_memory` row. Fixed-length arrays are exactly 3 (repair retry corrects drift).
 */
export const BrandMemoryPayloadSchema = z.object({
  voice: z.object({
    descriptor: z.string(),
    formality_label: z.string(),
    signature_phrases: z.array(z.string()).length(3),
    banned_phrases: z.array(z.string()),
  }),
  brand_persona: z.object({
    archetype: z.string(),
    one_liner: z.string(),
    core_values: z.array(z.string()).length(3),
  }),
  customer_persona: z.object({
    one_liner: z.string(),
    primary_pain_point: z.string(),
    primary_fear: z.string(),
    desired_identity: z.string(),
  }),
  hook: z.object({
    core_promise: z.string(),
    primary_emotion: z.string(),
    sample_hooks: z.array(z.string()).length(3),
  }),
  taboo: z.object({
    red_lines: z.array(z.string()),
  }),
  alignment: z.object({
    signal_lock: SignalLockSchema,
    note: z.string(),
  }),
})
export type BrandMemoryPayload = z.infer<typeof BrandMemoryPayloadSchema>

/**
 * Signal Console intake: Source + five channels, mirroring the demo's exact
 * fields. Only `source.name` is required — blanks never block (FSD M1); a
 * tracked-field count drives the Signal Clarity meter. Voice formality/energy are
 * 1–5 sliders.
 */
export const ResolveInputSchema = z.object({
  source: z.object({
    name: z.string().min(1),
    one_liner: z.string().default(''),
    category: z.string().default(''),
    mission: z.string().default(''),
  }),
  customer: z
    .object({
      description: z.string().default(''),
      pain: z.string().default(''),
      fear: z.string().default(''),
      desired_identity: z.string().default(''),
    })
    .prefault({}),
  brand: z
    .object({
      archetype: z.string().default(''),
      values: z.string().default(''),
      persona_line: z.string().default(''),
      proof_point: z.string().default(''),
    })
    .prefault({}),
  hook: z
    .object({
      primary_lever: z.string().default(''),
      hook_sentence: z.string().default(''),
    })
    .prefault({}),
  voice: z
    .object({
      formality: z.int().min(1).max(5).default(3),
      energy: z.int().min(1).max(5).default(3),
      voice_words: z.string().default(''),
      tone_lines: z.string().default(''),
      never_use: z.array(z.string()).default([]),
    })
    .prefault({}),
  taboo: z
    .object({
      avoid_topics: z.string().default(''),
      legal_red_lines: z.string().default(''),
    })
    .prefault({}),
})
export type ResolveInput = z.infer<typeof ResolveInputSchema>

/**
 * Result of a resolve. Companion §14 requires that a double JSON failure serve a
 * typed error AND a demo fallback (a plain Result<T> union cannot carry both), so
 * the success-with-fallback arm carries the payload and the error. A fallback
 * payload persists with `source='system'` and a visible notice — never presented
 * as a genuine resolve (no fake success states).
 */
export type ResolveResult =
  | { ok: true; data: BrandMemoryPayload; fallback: false }
  | { ok: true; data: BrandMemoryPayload; fallback: true; error: AppError }
  | { ok: false; error: AppError }

/** Served (flagged) only when the model output cannot be parsed twice (Roadmap §7). */
export const DEMO_FALLBACK_PAYLOAD: BrandMemoryPayload = {
  voice: {
    descriptor: 'Warm, plain-spoken, quietly confident',
    formality_label: 'Relaxed professional',
    signature_phrases: ['Here for the long run', 'No hype, just useful', 'Made with care'],
    banned_phrases: ['revolutionary', 'game-changer'],
  },
  brand_persona: {
    archetype: 'The Caregiver',
    one_liner: 'A dependable partner that quietly does the work.',
    core_values: ['Craft', 'Honesty', 'Belonging'],
  },
  customer_persona: {
    one_liner: 'A busy owner who wants marketing handled well.',
    primary_pain_point: 'No time to market consistently.',
    primary_fear: 'Looking amateur or being ignored.',
    desired_identity: 'A respected, established local name.',
  },
  hook: {
    core_promise: 'Show up every day without the daily effort.',
    primary_emotion: 'Relief',
    sample_hooks: [
      'The quiet way to stay top-of-mind.',
      'Your brand, handled — while you run the shop.',
      'Consistency beats loud. Every week.',
    ],
  },
  taboo: { red_lines: ['No false urgency', 'No competitor bashing'] },
  alignment: {
    signal_lock: 'moderate',
    note: 'Demo fallback served because the model output could not be parsed. Retry resolve for a brand-specific result.',
  },
}
