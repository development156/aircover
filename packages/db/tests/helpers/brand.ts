import type { BrandMemoryPayload } from '@sahoda/shared'

/**
 * A payload that satisfies the frozen BrandMemoryPayloadSchema exactly (fixed-length
 * arrays are 3; signal_lock is a SignalLock). `resolve_brand_memory` re-checks this
 * shape in SQL, so a fixture that drifts from the zod contract would make the guard
 * tests pass for the wrong reason.
 */
export function brandPayload(text = 'base'): BrandMemoryPayload {
  return {
    voice: {
      descriptor: `Warm, direct, unhurried — ${text}`,
      formality_label: 'Casual-professional',
      signature_phrases: ['built for makers', 'ship it clean', 'stay in the work'],
      banned_phrases: ['synergy', 'game-changer'],
    },
    brand_persona: {
      archetype: 'The Creator',
      one_liner: 'We make consistent marketing feel effortless.',
      core_values: ['craft', 'honesty', 'momentum'],
    },
    customer_persona: {
      one_liner: 'Solo founders scaling their first real product.',
      primary_pain_point: 'No time to market consistently.',
      primary_fear: 'Building something nobody ever sees.',
      desired_identity: 'A founder with a brand people recognise.',
    },
    hook: {
      core_promise: 'Marketing that runs itself.',
      primary_emotion: 'relief',
      sample_hooks: ['Stop guessing', 'Your brand, on autopilot', 'One brain, every channel'],
    },
    taboo: { red_lines: ['never fake urgency', 'never punch down'] },
    alignment: { signal_lock: 'strong', note: 'Signals agree across the supplied sources.' },
  }
}

/** Deep-ish override of one section, so guard tests can break exactly one rule at a time. */
export function withSection<K extends keyof BrandMemoryPayload>(
  base: BrandMemoryPayload,
  key: K,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  return { ...base, [key]: { ...base[key], ...patch } }
}
