import { z } from 'zod'

/**
 * ONE PICTURE IDEA, WRITTEN ONCE FROM A RESOLVED BRAND BRAIN.
 *
 * ── WHY A PAIR, AND NOT ONE SENTENCE TRUNCATED ──────────────────────────────
 * `/studio` shows the ideas as chips ("Samosas on a counter") so five or more
 * fit on one line, but the box behind each chip needs the whole sentence a
 * picture model can actually draw from. A label that is a truncation of the
 * sentence reads as clipped text the moment the sentence is longer than the
 * chip; a label the model writes ON PURPOSE, short and legible on its own, is
 * the thing that actually belongs on a chip. `PromptStarter` in
 * `apps/web/src/lib/studio/prompt.ts` already carries this exact pair for the
 * hardcoded five, for the same reason.
 *
 * ── WHY THIS DOES NOT INHERIT `BrandSignalSchema`'s SHAPE ───────────────────
 * A `BrandSignal` is a FACT the brain holds, with a certainty attached. A
 * starter is not a fact: it is an idea a model composed FROM those facts, and
 * it carries no certainty of its own because nothing about it was confirmed or
 * guessed, it was written.
 */
export const BrandStarterIdeaSchema = z.object({
  /** What the chip shows. Short: five or more sit on one line. */
  label: z.string().trim().min(1).max(60),
  /** What lands in the prompt box. The whole sentence a picture model reads. */
  prompt: z.string().trim().min(1).max(400),
})
export type BrandStarterIdea = z.infer<typeof BrandStarterIdeaSchema>

/**
 * THE BOUND, AND WHY IT IS 3 TO 8.
 *
 * Floored at three because a screen offering one or two ideas offers close to
 * no choice at all. Capped at eight so a malformed model answer cannot write
 * an unbounded list into a jsonb column: `brand_starters_shape` in
 * `20260906221300_brand_starters.sql` asserts the identical bound at the
 * database, so a row this schema would refuse can never be written in the
 * first place either.
 */
export const BrandStarterIdeasSchema = z.array(BrandStarterIdeaSchema).min(3).max(8)
export type BrandStarterIdeas = z.infer<typeof BrandStarterIdeasSchema>
