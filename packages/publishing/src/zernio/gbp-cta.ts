import { CONSTRAINTS } from '@sahoda/shared'

/**
 * Whether `type` is a Google Business call-to-action the engine accepts.
 *
 * ── ONE LIST, AND IT IS THE ENGINE'S ─────────────────────────────────────────
 * `GBP_CTA_TYPES` is module-private inside the frozen Constraint Engine, so
 * `CONSTRAINTS.gbp.gbp.ctaTypes` is the only exported path to it. apps/web
 * already reaches it that way (`lib/posts/variant-extras.ts`), and this is the
 * publishing side reaching the SAME array rather than keeping a second copy that
 * would drift.
 *
 * Worth recording: those six values were checked against Zernio's own
 * `GoogleBusinessPlatformData.callToAction.type` enum on 2026-08-20 and match
 * exactly as a set (docs/31 §2.4). The list here was already right.
 *
 * Exact match, no trimming and no case folding: Google expects the literal
 * uppercase code, so anything else must surface as a refusal rather than be
 * silently repaired into something the writer did not choose.
 */
export function isValidGbpCtaType(type: string): boolean {
  return (CONSTRAINTS.gbp.gbp?.ctaTypes ?? []).includes(type)
}
