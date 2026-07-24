import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'

import type { ScrubbableEvent } from './scrub'
import type { SentryOptions } from './sentry-options'

/**
 * Adapts our runtime-agnostic `SentryOptions` into the shape `Sentry.init`
 * accepts.
 *
 * WHY THIS FILE EXISTS AT ALL — it is a TypeScript variance problem, not a
 * modelling one. `buildSentryOptions` types its hooks over
 * `Record<string, unknown>`, which is the honest description of a Sentry event
 * and is what keeps scrub.ts free of any `@sentry/*` import (see the note at the
 * top of that file — the scrubber must be provable without dragging a transport
 * and global handlers into a unit test). The SDK types the same hooks over its
 * `ErrorEvent` INTERFACE. TypeScript does not give interfaces an implicit index
 * signature, so `ErrorEvent` is not assignable to `Record<string, unknown>` even
 * though every actual value of one is a valid value of the other — and because
 * parameters are contravariant, the mismatch surfaces on the way in.
 *
 * So there is a cast, and it is confined to this module: three init call sites
 * each doing their own `as` is three chances to widen it to `as any` under time
 * pressure, and a silenced `beforeSend` type is exactly how a scrubber stops
 * being called without anyone noticing.
 *
 * The cast is sound in one specific direction. A Sentry event really is a plain
 * JSON object with string keys, and `scrubEvent` rebuilds it key by key into a
 * new object rather than reinterpreting it — so nothing here claims a shape the
 * data does not have. What it does NOT do is guarantee the scrubber preserves
 * the fields Sentry needs; that is what scrub.test.ts is for.
 */

/**
 * The return type is deliberately inferred rather than annotated.
 *
 * The same object has to satisfy three different SDK option types —
 * `BrowserOptions`, `NodeOptions` and `VercelEdgeOptions` — which are structurally
 * similar but not identical, and which resolve differently per bundle via the
 * package's export conditions. Naming any one of them here would make this
 * module compile in one runtime and fail in another. Letting `init` check the
 * inferred object at each call site is what keeps all three honest.
 */
export function toSentryInitOptions(options: SentryOptions) {
  return {
    enabled: options.enabled,
    dsn: options.dsn,
    environment: options.environment,
    release: options.release,
    sendDefaultPii: options.sendDefaultPii,
    tracesSampleRate: options.tracesSampleRate,

    // The OUTERMOST of the three ReDoS defences, and the only one that works by
    // making sure the scrubber is never handed the expensive input in the first
    // place — the SDK truncates `exception.value` and `request.url` inside
    // `prepareEvent`, which runs BEFORE `beforeSend`. The other two layers live
    // in scrub.ts and both operate on a value that has already arrived.
    //
    // Enumerating fields by hand (rather than spreading `options`) is what keeps
    // the hook re-wrapping above honest, but it is also why this line is easy to
    // forget: a field added to `SentryOptions` and not repeated here is silently
    // dropped, and the resulting dead defence shows up in no test that checks the
    // builder alone. That is exactly what happened to this one.
    maxValueLength: options.maxValueLength,

    // Both hooks are re-wrapped rather than passed through, so the SDK sees a
    // function with the arity and parameter types it documents. Returning `null`
    // drops the event entirely, which is what our scrubber does when Sentry is
    // disabled — the last gate before anything leaves the process.
    beforeSend: (event: ErrorEvent): ErrorEvent | null =>
      options.beforeSend(event as unknown as ScrubbableEvent) as ErrorEvent | null,

    beforeBreadcrumb: (breadcrumb: Breadcrumb): Breadcrumb | null =>
      options.beforeBreadcrumb(breadcrumb as unknown as ScrubbableEvent) as Breadcrumb | null,
  }
}
