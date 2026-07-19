import type { Channel, ContentVariantsOutput } from '@sahoda/shared'

/**
 * `ContentVariantsOutputSchema` has no `.min()` and no cross-check against the
 * requested channels, so `{"variants": []}` parses clean. Channel invariants are
 * prompt-enforced only (LEARNINGS.md:9) — consumers must filter, and a channel
 * the model skipped has to surface as an honest "couldn't generate" rather than
 * a silent blank.
 *
 * The variant shape is the frozen mesh contract, so it is derived from
 * `ContentVariantsOutput` rather than restated here. Note `VariantExtras` in
 * `./variant-extras` is a DIFFERENT, wider shape (the loose `post_variants.extras`
 * jsonb, which carries other lanes' keys); this module only ever handles the
 * narrow mesh-output extras and must not claim to produce the wide one.
 */

/** One entry of the frozen `content_variants` mesh output. */
export type FilteredVariant = ContentVariantsOutput['variants'][number]

export interface FilteredVariants {
  /** Kept variants, ordered to match the requested order. */
  variants: FilteredVariant[]
  /** Requested but not usably returned → offer a per-channel retry. */
  missing: Channel[]
  /** Returned but not requested → dropped. */
  unexpected: Channel[]
}

/** A body of only whitespace is a failed generation, not a short post. */
function hasBody(body: string): boolean {
  return body.trim().length > 0
}

/**
 * Rebuilds the entry so the returned variant is not the caller's object, but
 * carries `extras` by reference — this module has no business reshaping a
 * payload it did not validate. `null` is outside the contract yet reachable from
 * hand-rolled callers, so it is treated as absent rather than emitted as a key.
 */
function toFilteredVariant(raw: FilteredVariant): FilteredVariant {
  const { channel, body, extras } = raw
  return extras === undefined || extras === null ? { channel, body } : { channel, body, extras }
}

export function filterVariants(
  requested: readonly Channel[],
  output: { variants: ReadonlyArray<FilteredVariant> },
): FilteredVariants {
  const wanted = new Set(requested)
  const requestedOnce = [...new Set(requested)]

  // First usable occurrence per channel wins. A blank body never claims the
  // slot, so a later usable duplicate can still fill it.
  const kept = new Map<Channel, FilteredVariant>()
  const unexpected = new Set<Channel>()

  for (const raw of output.variants) {
    if (!wanted.has(raw.channel)) {
      unexpected.add(raw.channel)
      continue
    }
    if (!hasBody(raw.body)) continue
    if (kept.has(raw.channel)) continue
    kept.set(raw.channel, toFilteredVariant(raw))
  }

  const variants: FilteredVariant[] = []
  const missing: Channel[] = []
  for (const channel of requestedOnce) {
    const variant = kept.get(channel)
    if (variant === undefined) missing.push(channel)
    else variants.push(variant)
  }

  return { variants, missing, unexpected: [...unexpected] }
}
