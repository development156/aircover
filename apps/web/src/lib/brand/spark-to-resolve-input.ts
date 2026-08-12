import { ResolveInputSchema, type ResolveInput } from '@sahoda/shared'

/** The minimal onboarding intake — "give the model a spark, not a 30-field form". */
export interface SparkInput {
  name: string
  category?: string
  website?: string
  instagram?: string
  /**
   * A sentence in the founder's own words. NOT collected by any screen today —
   * plumbed here because it is the single highest-value field the intake is
   * missing (see the report in this commit). Blank until a UI mounts it.
   */
  description?: string
}

/**
 * Map the spark onto `ResolveInput`. Everything the Spark screen collects is
 * forwarded: name and category as before, plus website and instagram, which used
 * to be dropped on the floor here while the form went on asking for them.
 *
 * What each field is worth is not the same:
 *   · `description` → `source.one_liner` — the founder's own words. Real signal.
 *   · `website` / `instagram` → identifiers the model CANNOT fetch. A URL is
 *     worth about what its domain name is worth; it is not the site's copy. The
 *     content lift is doc 18 §5's URL door, which is a separate crawl step.
 * Forwarding them is still strictly better than dropping them — a domain and a
 * handle are two more constraints than zero — but it is not the same lift.
 *
 * zod fills every channel default, so a near-blank spark still yields a full,
 * valid input — blanks never block.
 */
export function sparkToResolveInput(spark: SparkInput): ResolveInput {
  return ResolveInputSchema.parse({
    source: {
      name: spark.name.trim(),
      one_liner: (spark.description ?? '').trim(),
      category: (spark.category ?? '').trim(),
      website: (spark.website ?? '').trim(),
      instagram: (spark.instagram ?? '').trim(),
    },
  })
}
