import * as Sentry from '@sentry/nextjs'

import { toSentryInitOptions } from '@/lib/observability/sentry-init-options'
import { buildSentryOptions } from '@/lib/observability/sentry-options'

/**
 * Sentry for the browser. This file replaced `sentry.client.config.ts` in v9+;
 * Next.js itself owns the entry point now, aliasing `src/instrumentation-client`
 * (checked first) or `<root>/instrumentation-client` into the client bundle.
 * It runs before any application code, which is what lets it catch errors thrown
 * during hydration.
 *
 * THE DSN IS SPELLED OUT IN FULL, ON PURPOSE. DO NOT REFACTOR IT.
 * `process.env.NEXT_PUBLIC_SENTRY_DSN` is not a variable read at runtime — the
 * browser has no `process`. Next performs a literal TEXT substitution on that
 * exact token at build time. Hoisting it to a const, destructuring it, reading
 * it through a computed key, or routing it via `@/lib/env` all defeat the
 * inliner, and the failure is silent: the bundle ships `undefined`, Sentry
 * initialises disabled, and client-side reporting is dead with nothing logged to
 * say so. See lib/env.ts for the full account of this trap.
 */
Sentry.init(
  toSentryInitOptions(
    buildSentryOptions({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      // Also NEXT_PUBLIC_, and for the same reason — the server-only VERCEL_*
      // vars are not readable here, so the release has to be inlined at build
      // time or left undefined.
      release: process.env.NEXT_PUBLIC_SENTRY_RELEASE,
      // NO secretValues, and this is a security decision rather than an omission.
      // Every value passed here would be inlined into a JavaScript file served to
      // the public — registering CLERK_SECRET_KEY as something to redact would
      // publish CLERK_SECRET_KEY. The shape rules in scrub.ts (JWT, Bearer,
      // sk_live_, email) still run in the browser and are the client's protection;
      // they need no registry because they match on form, not on value.
    }),
  ),
)

/**
 * Records App Router client-side navigations as spans.
 *
 * VERIFIED AGAINST THE INSTALLED PACKAGE, because the obvious guess is wrong:
 * there is no `Sentry.onRouterTransitionStart` export in @sentry/nextjs 10.66.0
 * (checked against build/types/client/index.d.ts and the CJS runtime exports).
 * `onRouterTransitionStart` is the name NEXT requires this export to have; the
 * SDK's implementation is called `captureRouterTransitionStart`. Next warns at
 * build time when an instrumentation-client file omits the export, and the SDK
 * ships `suppressOnRouterTransitionStartWarning` for people who intend to.
 *
 * Wiring it up costs nothing today — `tracesSampleRate` is 0, so no span is
 * actually sampled — but it keeps the warning quiet and means enabling tracing
 * later is a one-line change to sentry-options.ts rather than an archaeology
 * exercise into why navigations were never instrumented.
 */
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
