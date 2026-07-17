import { z } from 'zod'

/**
 * Sahoda Guide tour definition (FSD Appendix C). Tours are versioned JSON,
 * hot-updatable from `guide_tours` without a deploy. `action` is a small DSL:
 * `click`, `input_min:<n>`, or absent for an informational (Next) step. A
 * `confirm_spend` step always pauses in DIFM; a missing anchor auto-skips + logs.
 */
export const TourStepSchema = z.object({
  anchor: z.string(),
  say: z.string(),
  action: z.string().optional(),
  spotlight: z.boolean().optional(),
  confirm_spend: z.boolean().optional(),
})
export type TourStep = z.infer<typeof TourStepSchema>

export const TourTriggerSchema = z.object({
  type: z.enum(['first_visit', 'show_me_how', 'help_search', 'release', 'stuck']),
  route: z.string().optional(),
})
export type TourTrigger = z.infer<typeof TourTriggerSchema>

export const TourDefinitionSchema = z.object({
  id: z.string(),
  version: z.int(),
  locale: z.string().default('en'),
  trigger: TourTriggerSchema,
  steps: z.array(TourStepSchema),
  difm_allowed: z.boolean().default(false),
  max_steps_visible: z.int().default(8),
})
export type TourDefinition = z.infer<typeof TourDefinitionSchema>
