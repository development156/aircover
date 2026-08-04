import { ResolveInputSchema, type ResolveInput } from '@sahoda/shared'

/** The minimal onboarding intake — "give the model a spark, not a 30-field form". */
export interface SparkInput {
  name: string
  category?: string
  website?: string
  instagram?: string
}

/**
 * Map the spark onto the frozen `ResolveInput`. Only `name` + `category` feed the
 * `brand_guidelines` resolve; `website`/`instagram` are captured for logo theming
 * and the future deep-research path and are deliberately NOT smuggled into the
 * frozen contract (it has no field for them). zod fills every channel default, so
 * a near-blank spark still yields a full, valid input — blanks never block.
 */
export function sparkToResolveInput(spark: SparkInput): ResolveInput {
  return ResolveInputSchema.parse({
    source: {
      name: spark.name.trim(),
      category: (spark.category ?? '').trim(),
    },
  })
}
