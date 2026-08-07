import { scrubEvent, type ScrubbableEvent, type ScrubbedEvent } from './scrub'

/**
 * Builds the Sentry init options, in one pure function, for every runtime
 * (client, server, edge) that calls `Sentry.init`.
 *
 * Pure on purpose: the privacy invariants below are the kind that get quietly
 * inverted by a well-meaning edit two quarters from now ("turn on PII so we can
 * see who hit this"). Expressed as a builder, they are pinned by unit tests that
 * run in CI — a config object assembled inline at three call sites is pinned by
 * nothing, and drifts apart between the three.
 *
 * This module never reads process.env. NEXT_PUBLIC_SENTRY_DSN has to be
 * referenced in its literal form at the client call site or the Next build-time
 * inliner misses it (see lib/env.ts), so the DSN arrives here as an argument.
 */

export interface SentryOptionsInput {
  /** The DSN, exactly as the environment gave it — including '' for an unset var. */
  readonly dsn?: string
  readonly environment?: string
  readonly release?: string
  /**
   * Values known to be secret at init time (decrypted tokens, signing secrets).
   * Entries under 8 characters are dropped downstream — see scrub.ts.
   */
  readonly secretValues?: readonly string[]
}

export interface SentryOptions {
  readonly enabled: boolean
  readonly dsn: string | undefined
  readonly environment: string | undefined
  readonly release: string | undefined
  /**
   * Typed as the literal `false`, not `boolean`. `sendDefaultPii: true` attaches
   * request headers, cookies and IP addresses to every event — and the SDK adds
   * them AFTER `beforeSend` runs, so our scrubber never sees the data and cannot
   * defend against it. The literal type means flipping this is a compile error,
   * not a one-character diff that passes review.
   */
  readonly sendDefaultPii: false
  readonly tracesSampleRate: number
  /**
   * How long a single event value may be before the SDK truncates it.
   *
   * Set explicitly because the SDK's own default is "do not truncate at all",
   * and that is not obvious from the option's name. @sentry/core's
   * `prepareEvent` destructures `maxValueLength` with NO default and then only
   * truncates `if (maxValueLength)` — so with the option unset, `exception.value`
   * and `request.url` reach `beforeSend` at whatever length they were thrown at.
   *
   * That is how a 200KB string reached the scrubber's regexes in the first
   * place. This is the outermost of three layers guarding the same failure; the
   * other two live in scrub.ts and neither one should have to be the last word.
   */
  readonly maxValueLength: number
  readonly beforeSend: (event: ScrubbableEvent) => ScrubbedEvent | null
  readonly beforeBreadcrumb: (breadcrumb: ScrubbableEvent) => ScrubbedEvent | null
}

/**
 * Errors only, for now. Tracing spans carry full URLs and route params — a
 * second PII surface we have not audited and are not paying for yet. Zero is a
 * decision, not a placeholder.
 */
const TRACES_SAMPLE_RATE = 0

/**
 * 1024 characters per event value. Comfortably past the end of a real exception
 * message or URL, and far short of the sizes that made the crash path expensive.
 */
const MAX_VALUE_LENGTH = 1024

export function buildSentryOptions(input: SentryOptionsInput): SentryOptions {
  // An unset var in a .env file reads as '' rather than undefined, and a
  // copy-pasted line can leave whitespace — so the trim is the common path, not
  // the exotic one. A half-initialised SDK is worse than none: it installs
  // global handlers and swallows errors into a transport with nowhere to send
  // them, hiding the fact that reporting was never configured.
  const dsn = input.dsn?.trim()
  const enabled = Boolean(dsn)
  const secretValues = input.secretValues ?? []

  // Belt and braces. `enabled: false` already stops the transport, but these
  // hooks are the last gate before data leaves the process — and they are what
  // protects us if a caller wires them up by hand, or a future SDK version
  // treats `enabled` as advisory.
  const scrub = (value: ScrubbableEvent): ScrubbedEvent | null =>
    enabled ? scrubEvent(value, secretValues) : null

  return {
    enabled,
    dsn: enabled ? dsn : undefined,
    // Left undefined when not supplied: Sentry fills its own defaults, and
    // inventing a value here would mislabel every event from a build that
    // genuinely did not know its release.
    environment: input.environment,
    release: input.release,
    sendDefaultPii: false,
    tracesSampleRate: TRACES_SAMPLE_RATE,
    maxValueLength: MAX_VALUE_LENGTH,
    beforeSend: scrub,
    beforeBreadcrumb: scrub,
  }
}
