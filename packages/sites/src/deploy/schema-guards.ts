import { z } from 'zod'

/**
 * Two guards the `sites.deploy` schemas need but zod does not provide. Kept out of `port.ts`
 * because neither knows anything about deploys — both are general facts about validating a
 * value that arrived as jsonb.
 */

/**
 * `__proto__` is the ONE key `strictObject` cannot see. Zod excludes it from unknown-key
 * detection BY DESIGN, but a jsonb column is read back through `JSON.parse`, which creates
 * `__proto__` as an OWN ENUMERABLE property — so a row containing it parses clean, loses the
 * key, and surfaces nothing to the caller. That is exactly the silent loss a strict schema
 * exists to prevent, so it is refused before `.parse` runs rather than demoted to a footnote
 * on the guarantee.
 *
 * Only `__proto__` needs this. `constructor`, `prototype`, `toString`, `hasOwnProperty` and
 * `__defineGetter__` were each checked by execution and are already rejected as unrecognized
 * keys; `port-strictness.test.ts` pins that so this guard cannot be "simplified" into a
 * narrowing of unknown-key detection.
 */
const PROTO_KEY = '__proto__'

const hasOwnProtoKey = (value: unknown): boolean =>
  typeof value === 'object' &&
  value !== null &&
  Object.prototype.hasOwnProperty.call(value, PROTO_KEY)

/** Wrap a schema so an own `__proto__` key is REPORTED rather than dropped. */
export const withProtoKeyRejected = <T>(schema: z.ZodType<T>): z.ZodType<T> =>
  z
    .unknown()
    .superRefine((value, ctx) => {
      if (hasOwnProtoKey(value)) {
        ctx.addIssue({
          code: 'custom',
          path: [PROTO_KEY],
          message: `Unrecognized key: "${PROTO_KEY}". It is refused rather than dropped, because a dropped key is silent data loss.`,
        })
      }
    })
    .pipe(schema) as unknown as z.ZodType<T>

/**
 * A cross-field rule: a combination of individually-valid fields that together assert
 * something untrue. Each carries the `path` it should be reported against, so a caller sees
 * WHICH field made the record dishonest rather than a bare object-level failure.
 */
export interface HonestyRule<T> {
  readonly path: string
  readonly isViolated: (value: T) => boolean
  readonly message: string
}

/** Build a `superRefine` that reports EVERY violated rule, not just the first. */
export const checkHonesty =
  <T>(rules: readonly HonestyRule<T>[]) =>
  (value: T, ctx: z.RefinementCtx): void => {
    for (const rule of rules.filter((candidate) => candidate.isViolated(value))) {
      ctx.addIssue({ code: 'custom', path: [rule.path], message: rule.message })
    }
  }
