import * as Sentry from '@sentry/nextjs'

import { toSentryInitOptions } from '@/lib/observability/sentry-init-options'
import { buildSentryOptions } from '@/lib/observability/sentry-options'
import { secretValuesFrom } from '@/lib/observability/secret-values'

/**
 * Sentry for the Edge runtime — middleware, and any route that opts into it.
 *
 * A near-twin of sentry.server.config.ts, and separate on purpose: `@sentry/nextjs`
 * resolves to a different build under the `edge` export condition (WinterCG
 * APIs, no OpenTelemetry, no node integrations), so the two cannot share an init
 * call even though they share every option. What they must NOT do is drift, which
 * is why the option shape comes from `buildSentryOptions` and the redaction list
 * from `secretValuesFrom` — the only thing duplicated here is the call itself.
 *
 * This file is what covers middleware.ts. Auth middleware runs on every request
 * and is exactly where a Clerk failure shows up first, so an edge runtime with
 * no reporter is a blind spot over the busiest code path in the app.
 */
Sentry.init(
  toSentryInitOptions(
    buildSentryOptions({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV,
      release: process.env.VERCEL_GIT_COMMIT_SHA,
      // Same registry as the node runtime. SUPABASE_SERVICE_ROLE_KEY is normally
      // absent from an edge deploy's env — `secretValuesFrom` filters it out
      // rather than registering `undefined`, so the list is simply shorter here.
      secretValues: secretValuesFrom(process.env),
    }),
  ),
)
