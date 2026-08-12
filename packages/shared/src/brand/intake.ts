import { z } from 'zod'

/**
 * The three onboarding picks, as they ride inside `brand_memory.payload`.
 *
 * Named apart from `StoredIntake` in `gate/brain-rules.ts` on purpose: that one is
 * the tolerant READ (nullable regime, and a `default` basis for a brain that
 * carries none). This is the WRITE contract, where every field is present or the
 * intake is not written at all.
 *
 * ── WHY THIS IS PERSISTED AT ALL ─────────────────────────────────────────────
 * The refusal gate resolves its rule set from `regime × locale` (doc 18 §4), and
 * until this existed it could not: onboarding classified the three picks, folded
 * them into a prose sentence for the resolve prompt, and threw the structure
 * away. Every workspace therefore resolved to `consumer` / `default`, and the
 * MANDATED tier was the floor pack and nothing else — a clinic that picked
 * "Health & care" was judged by the general advertising floor.
 *
 * ── WHY IT NEEDS NO MIGRATION ────────────────────────────────────────────────
 * `public.resolve_brand_memory` validates the six sections and the array lengths
 * and ignores anything else. This rides the same seam `field_meta` already uses.
 *
 * ── WHY `basis` IS STORED AND NOT INFERRED ───────────────────────────────────
 * The gate's refusal copy branches on it. `declared` may say "this comes with the
 * trade you told us you are in"; anything weaker must say "this applies to every
 * business advertising anything". Attributing a rule to a regulator nobody
 * consulted is the exact failure the whole surface exists to prevent, so the
 * strength of the claim travels WITH the claim rather than being guessed at the
 * far end.
 *
 * It maps one-to-one onto what onboarding's classifier already knows
 * (`apps/web/src/lib/onboarding/classify.ts`):
 *
 *   `chosen`  — the user overrode the chip themselves      → `declared`
 *   `matched` — read out of the sentence they typed        → `derived`
 *   `assumed` — nothing matched and we defaulted           → not stored at all
 *
 * `assumed` is absent by construction rather than by convention: a default is
 * not a fact about the customer, and storing one would turn "we guessed" into
 * "they told us" at the only point where the difference is still visible.
 */
export const BrandIntakeSchema = z.object({
  model: z.string().min(1),
  regime: z.string().min(1),
  locale: z.string().min(1),
  /** How the REGIME was arrived at — the regime is what selects the pack. */
  basis: z.enum(['declared', 'derived']),
})
export type BrandIntake = z.infer<typeof BrandIntakeSchema>
